/**
 * @file trial.mjs
 * @description The shared-key trial gateway.
 *
 * A visitor with no NVIDIA account can still use the app: the browser calls
 * `/api/trial/*` with no credentials, and this function forwards the request to
 * the NIM gateway with the deployment's own key attached. The key lives only in
 * the `NVIDIA_TRIAL_API_KEY` environment variable on the server — it is never
 * sent to the browser, never inlined into the bundle, and never appears in a
 * response.
 *
 * That means the endpoint is, by construction, free inference for anyone who
 * finds it. Everything below exists to bound that: a route allowlist so it
 * cannot be used as a general-purpose NVIDIA proxy, hard ceilings on request
 * size and generation length, and a per-IP rate limit.
 *
 * The rate limit is per warm instance, not global — Netlify may run several at
 * once, so treat the ceilings as a brake rather than a guarantee. The bill is
 * ultimately bounded by the trial key's own quota at NVIDIA, which is the right
 * place to set a hard cap.
 *
 * Visitors who paste their own key never touch this function; those requests go
 * to `/api/nvidia/*`, which is a plain rewrite.
 */

const UPSTREAM = 'https://integrate.api.nvidia.com/v1'

/**
 * What the trial is allowed to reach. Anything absent from this list is
 * rejected before a request is made, so the endpoint stays a demo of *this*
 * app rather than an open relay to the whole gateway.
 */
const ROUTES = [
  { method: 'GET', path: '/models' },
  { method: 'POST', path: '/chat/completions' },
  { method: 'POST', path: '/embeddings' },
]

/** Generous enough for the vision lab's base64 images, tight enough to bound cost. */
const MAX_BODY_CHARS = 4 * 1024 * 1024

/** Ceiling on generated tokens. Long enough to be a real answer, short enough to be a trial. */
const MAX_TOKENS = 512

/** Ceiling on conversation length, so a trial cannot replay a huge history. */
const MAX_MESSAGES = 30

/** Ceiling on embedding batch size. */
const MAX_EMBEDDING_INPUTS = 32

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

/**
 * Per-IP ceilings. The per-minute figure has to clear the startup burst: the
 * health sweep probes the whole catalog (~100 models, five at a time) the first
 * time someone opens the app, and throttling that would poison the very
 * verdicts it is gathering.
 */
const PER_MINUTE = 150
const PER_HOUR = 700

/** ip → request timestamps within the last hour. Lives as long as the instance does. */
const hits = new Map()

/**
 * Records a request and reports whether it is over the line.
 * @param {string} ip - Client address.
 * @returns {{ok: boolean, retryAfter?: number}} Verdict, with a hint in seconds.
 */
function rateLimit(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR_MS)
  const lastMinute = recent.reduce((n, t) => (now - t < MINUTE_MS ? n + 1 : n), 0)

  if (lastMinute >= PER_MINUTE || recent.length >= PER_HOUR) {
    hits.set(ip, recent)
    return { ok: false, retryAfter: lastMinute >= PER_MINUTE ? 45 : 600 }
  }

  recent.push(now)
  hits.set(ip, recent)

  // Drop callers that have gone quiet, so a long-lived instance cannot grow
  // its table without bound.
  if (hits.size > 400) {
    for (const [key, stamps] of hits) {
      if (stamps.length === 0 || now - stamps.at(-1) > HOUR_MS) hits.delete(key)
    }
  }

  return { ok: true }
}

/**
 * Strips the mount prefix so the remainder can be matched against the
 * allowlist. The function answers on `/api/trial/*` via a redirect, and on its
 * own `/.netlify/functions/trial` path directly.
 * @param {string} rawUrl - Full request URL.
 * @returns {{path: string, search: string}} Gateway path and query string.
 */
function gatewayPath(rawUrl) {
  const url = new URL(rawUrl)
  const path = url.pathname
    .replace(/^\/\.netlify\/functions\/trial/, '')
    .replace(/^\/api\/trial/, '')
  return { path: path || '/', search: url.search }
}

/**
 * @param {number} status - HTTP status.
 * @param {string} detail - Message the UI will surface verbatim.
 * @param {Record<string, string>} [headers] - Extra response headers.
 * @returns {Response}
 */
const problem = (status, detail, headers = {}) =>
  new Response(JSON.stringify({ detail }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })

/**
 * Applies the trial's ceilings to a request body.
 *
 * Clamps rather than rejects wherever it can: a trial that quietly returns a
 * shorter answer is a better experience than one that errors on a request the
 * app itself composed.
 *
 * @param {string} path - Gateway path being called.
 * @param {unknown} body - Parsed JSON payload.
 * @returns {{body: Object}|{error: string}} Bounded payload, or why it was refused.
 */
function bound(path, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'The request body was not a JSON object.' }
  }

  const out = { ...body }

  if (path === '/chat/completions') {
    // An empty `messages` array is exactly what the zero-token entitlement
    // probe sends, so it has to reach the gateway to earn the 400 or 404 that
    // classifies the model. Only oversized histories are trimmed.
    if (Array.isArray(out.messages) && out.messages.length > MAX_MESSAGES) {
      out.messages = out.messages.slice(-MAX_MESSAGES)
    }
    out.max_tokens = Math.min(Number(out.max_tokens) || MAX_TOKENS, MAX_TOKENS)
  }

  if (path === '/embeddings') {
    if (Array.isArray(out.input) && out.input.length > MAX_EMBEDDING_INPUTS) {
      return { error: `The trial embeds at most ${MAX_EMBEDDING_INPUTS} passages at a time.` }
    }
  }

  return { body: out }
}

export default async (req) => {
  const key = process.env.NVIDIA_TRIAL_API_KEY

  if (!key) {
    return problem(503, 'This deployment has no trial key configured. Connect your own NVIDIA key to continue.')
  }

  const { path, search } = gatewayPath(req.url)
  const route = ROUTES.find((r) => r.path === path)

  if (!route) {
    return problem(404, 'The trial gateway does not serve that path.')
  }
  if (route.method !== req.method) {
    return problem(405, `The trial gateway expects ${route.method} on this path.`)
  }

  const ip =
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'

  const limit = rateLimit(ip)
  if (!limit.ok) {
    return problem(
      429,
      'The shared trial key is busy right now. Wait a moment, or connect your own NVIDIA key for full speed.',
      { 'retry-after': String(limit.retryAfter) },
    )
  }

  /** @type {string|undefined} */
  let payload

  if (route.method === 'POST') {
    const raw = await req.text()
    if (raw.length > MAX_BODY_CHARS) {
      return problem(413, 'That request is larger than the trial accepts. Try a smaller image or a shorter conversation.')
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return problem(400, 'The request body was not valid JSON.')
    }

    const bounded = bound(path, parsed)
    if (bounded.error) return problem(400, bounded.error)
    payload = JSON.stringify(bounded.body)
  }

  let upstream
  try {
    upstream = await fetch(`${UPSTREAM}${path}${search}`, {
      method: route.method,
      // Built from scratch on purpose: nothing the client sent — least of all
      // an Authorization header it might have supplied — is forwarded.
      headers: {
        'content-type': 'application/json',
        accept: req.headers.get('accept') || 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: payload,
    })
  } catch {
    return problem(502, 'The trial gateway could not reach NVIDIA. Try again in a moment.')
  }

  // Streamed straight through, so Server-Sent Events arrive token by token
  // rather than in one lump at the end.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    },
  })
}

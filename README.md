# milkyway.ai — an NVIDIA NIM developer galaxy

An interactive sandbox for **NVIDIA NIM** (NVIDIA Inference Microservices). Every
model your API key can reach appears as a star on a map; click one to open the
workspace built for what it does — conversation, code, reasoning, embeddings, or
vision.

Because NIM is OpenAI-compatible, the same client code works unchanged against
NVIDIA's hosted gateway, a self-hosted NIM container, vLLM, or Ollama. Only the
proxy target changes.

---

## The six workspaces

**Model map** — a physics-driven view of your entire catalog, clustered by
capability and sized by context window. Drag to pan, scroll to zoom, click a
star to open its workspace with that model preselected. Works with touch.

**Chat arena** — general conversation, with adjustable instructions,
temperature, and reply length. Reports real time-to-first-token and an estimated
throughput. Generation can be stopped mid-stream.

**Code lab** — a conversation on one side, and the code blocks lifted out of the
latest reply on the other, ready to copy or download with a sensible filename.

**Reasoning** — for models that work through a problem before answering. The
chain of thought appears on the left as it streams, the conclusion on the right.
Handles both conventions: models that return a separate `reasoning_content`
field, and models that inline `<think>…</think>` blocks.

**Embedding search** — a live semantic map. Documents are embedded into vectors
and arranged by how close their meaning is to your query: an exact match lands
on the query, an unrelated document drifts to the rim. Add your own documents to
watch where they land.

**Vision lab** — ask questions about an image, or sweep a probe across it to get
a description of whatever region the pointer rests on.

**Model status** — what your key can actually reach, checked continuously.

---

## Every model in the picker is one that works

NVIDIA publishes one catalog to everyone. Your key can call part of it — on the
account this was built against, 48 of 102. The `/v1/models` endpoint does not
say which part, so a dropdown built straight from it is a list where roughly
half the choices fail after you have already written your message.

This app checks instead, using three signals:

- **A free availability sweep on load.** The gateway resolves the model before
  it validates the request body, so a deliberately invalid body returns `404`
  when your key lacks the model and `400` when it has it. No inference runs, so
  it costs **zero tokens** and sweeps the whole catalog in about 20 seconds.
- **A liveness check when it matters** — opening a picker or choosing a model
  confirms it is actually serving, and measures how fast.
- **Every message you send**, reported back automatically. Free, and the most
  authoritative signal there is.

Each model shows a status dot and its measured response time, sorted fastest
first. Models your key cannot call are collapsed behind a "show unavailable"
toggle rather than hidden, because knowing what exists is useful too.

Slow models are labelled, not hidden: several take ten seconds or more to wake
up, and treating that as failure would hide working models — including, in
testing, this app's own default.

---

## Architecture

```
Browser  ──/api/nvidia/*──▶  proxy  ──▶  https://integrate.api.nvidia.com/v1/*
                              │
                              └────────▶  your own NIM / vLLM / Ollama endpoint
```

The NIM gateway sends no CORS headers, so the browser cannot call it directly.
Every request goes to a same-origin `/api/nvidia/*` path that gets rewritten:

- **Locally** by the `server.proxy` block in [`vite.config.js`](vite.config.js)
- **In production** by the redirect in [`netlify.toml`](netlify.toml)

To point the app at your own endpoint, change the target in both places.

**Stack:** React 19, Vite 8, and a vanilla CSS design system — no UI framework,
no state library. Streaming uses the Fetch API's `ReadableStream` with a shared
Server-Sent Events parser in [`src/api/nvidia.js`](src/api/nvidia.js).

---

## Running it locally

```bash
npm install
```

Then get a key from [build.nvidia.com](https://build.nvidia.com) (it starts with
`nvapi-`). You can either paste it into the app on first load, or skip that step
by copying `.env.example` to `.env` and filling it in.

```bash
npm run dev
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

---

## About API keys

**A `VITE_NVIDIA_API_KEY` is not a secret.** Vite inlines every `VITE_*`
variable into the client bundle at build time, so a key set that way is readable
by anyone who loads the deployed site — including via Netlify's environment
variables. Use it for local development only.

For a public deployment, leave it unset and let each visitor supply their own
key. Keys entered in the app are held in that browser's `localStorage` and sent
only to NVIDIA. They are not encrypted — `localStorage` is readable by any
script running on the same origin.

If you need a genuinely server-side key, move the proxy into a Netlify Function
that attaches the `Authorization` header, and stop sending the key from the
client at all.

---

## Documentation

[DEVELOPER_DOCUMENTATION.md](DEVELOPER_DOCUMENTATION.md) covers the module
layout, the streaming protocol, and the maths behind the visualisations —
cosine similarity, the attractor simulation, and the camera transform.

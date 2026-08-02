# milkyway.ai — an NVIDIA NIM developer galaxy

An interactive sandbox for **NVIDIA NIM** (NVIDIA Inference Microservices). Every
model your API key can reach appears as a star on a map; click one to open the
workspace built for what it does — conversation, code, reasoning, embeddings, or
vision.

Because NIM is OpenAI-compatible, the same client code works unchanged against
NVIDIA's hosted gateway, a self-hosted NIM container, vLLM, or Ollama. Only the
proxy target changes.

**No key? Press "Try it now" on the first screen.** The deployment lends you its
own key through a server-side function, so you can walk the whole app before
deciding whether to sign up for anything. It is shared and rate limited; connect
your own key when you want the full catalog and uncapped replies.

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
                 your key, from the browser
Browser  ──/api/nvidia/*──▶  rewrite   ──▶  https://integrate.api.nvidia.com/v1/*
                                 │
                                 └───────▶  your own NIM / vLLM / Ollama endpoint

                 the trial key, never in the browser
Browser  ──/api/trial/*───▶  function  ──▶  https://integrate.api.nvidia.com/v1/*
                             + Bearer NVIDIA_TRIAL_API_KEY
```

The NIM gateway sends no CORS headers, so the browser cannot call it directly.
Every request goes to a same-origin path that gets rewritten:

- **Locally** by the `server.proxy` block in [`vite.config.js`](vite.config.js)
- **In production** by the redirects in [`netlify.toml`](netlify.toml)

To point the app at your own endpoint, change the target in both places.

Which of the two paths a request takes is decided in one place,
[`src/lib/gateway.js`](src/lib/gateway.js), by looking at the active key. A real
`nvapi-…` key is sent from the browser as it always was; the trial sentinel is
swapped for a route to [`netlify/functions/trial.mjs`](netlify/functions/trial.mjs),
which holds the credential server-side. Nothing else in the app has to know
which one is in play.

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

`npm run dev` stands in for the trial function with a Vite proxy that attaches
`NVIDIA_TRIAL_API_KEY` — enough to click the button, but it does not enforce the
function's route allowlist, size caps, or rate limit. To exercise the real thing:

```bash
npx netlify dev
```

---

## About API keys

There are two kinds of key here, and only one of them is a secret.

**`VITE_NVIDIA_API_KEY` is not.** Vite inlines every `VITE_*` variable into the
client bundle at build time, so a key set that way is readable by anyone who
loads the deployed site — including via Netlify's environment variables. Use it
for local development only. [`.env.production`](.env.production) blanks it so a
production build cannot carry one by accident.

**`NVIDIA_TRIAL_API_KEY` is.** No `VITE_` prefix, so it is never inlined; it is
read by [`netlify/functions/trial.mjs`](netlify/functions/trial.mjs) at request
time and attached server-side. Set it on the deployment, not in a committed file:

```bash
npx netlify env:set NVIDIA_TRIAL_API_KEY "nvapi-…"
```

Leave it unset and the trial button reports that the trial is switched off. The
own-key path keeps working either way.

**Running a trial means paying for strangers' inference.** The endpoint is open
by design — that is the point of a trial — so the function bounds it: only
`/models`, `/chat/completions` and `/embeddings` are reachable, replies are
capped at 512 tokens, request bodies at 4 MB, and each IP gets 150 requests a
minute and 700 an hour. Those counters live in the function instance's memory,
so with several instances warm the real ceiling is higher. The dependable limit
is the quota on the key itself — use one you are happy to watch and rotate.

**Keys visitors paste** are held in that browser's `localStorage` and sent only
to NVIDIA. They are not encrypted — `localStorage` is readable by any script
running on the same origin.

---

## Documentation

[DEVELOPER_DOCUMENTATION.md](DEVELOPER_DOCUMENTATION.md) covers the module
layout, the streaming protocol, and the maths behind the visualisations —
cosine similarity, the attractor simulation, and the camera transform.

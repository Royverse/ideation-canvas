import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Loaded with an empty prefix so the server-only trial key is readable here,
  // inside the Node config process. Only VITE_-prefixed variables are inlined
  // into the client bundle, so reading it this way keeps it off the wire.
  const env = loadEnv(mode, process.cwd(), '')
  const trialKey = env.NVIDIA_TRIAL_API_KEY

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: true,
      proxy: {
        // Visitor's own key: forwarded untouched, exactly as the Netlify
        // redirect does in production.
        '/api/nvidia': {
          target: 'https://integrate.api.nvidia.com/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/nvidia/, ''),
        },

        // Trial key: stands in for netlify/functions/trial.mjs so the trial
        // button works under `npm run dev`. It attaches the key and nothing
        // else — the route allowlist, size caps and rate limit only exist in
        // the real function. Run `netlify dev` to exercise those.
        '/api/trial': {
          target: 'https://integrate.api.nvidia.com/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/trial/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (trialKey) proxyReq.setHeader('Authorization', `Bearer ${trialKey}`)
            })
          },
        },
      },
    },
  }
})

# Trading Analysis AI gateway

The GitHub Pages frontend must not contain shared provider API keys. Deploy
`ai-analysis-worker.js` as a Cloudflare Worker (or adapt the same request
contract to another serverless platform), then configure these secrets:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `VOLCENGINE_API_KEY`
- `AI_ACCESS_TOKEN` (strongly recommended; shared only with the two app users)
- `ALLOWED_ORIGINS` (comma-separated; optional)

The worker accepts `POST` requests from the Trading Analysis UI. In `shared`
mode it uses the corresponding Worker secret. In `personal` mode it uses the
key supplied for that one request. The worker does not persist requests,
reports, or keys and returns `Cache-Control: no-store`.

After deployment, set the frontend build variable:

```text
VITE_AI_PROXY_URL=https://YOUR-WORKER.workers.dev
```

For the included GitHub Pages workflow, add this as a repository variable named
`VITE_AI_PROXY_URL` under **Settings → Secrets and variables → Actions → Variables**.

For production, set `ALLOWED_ORIGINS` to the exact GitHub Pages origin and any
other trusted app origins.

# Groceries

A simple, mobile-first shared grocery list built with Next.js.

- Anyone with the link can see the list, add items and check them off.
- Every item ever added is remembered, so typing shows autocomplete suggestions (most used first).
- Checked items move to a "Checked" list below. Tap one to put it back on the list.
- Open tabs refresh every few seconds, so everyone sees the same list.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Data is saved to `data/groceries.json`.

To share it with people on the same Wi-Fi, open `http://<your-computer-ip>:3000` on their phone.

## Deploy (e.g. Vercel)

Serverless hosts can't keep a local file, so add a free Redis store:

1. Create an Upstash Redis database (or add "Upstash for Redis" from the Vercel Marketplace).
2. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) in the project's environment variables.
3. Deploy. The app uses Redis automatically when those variables are set.

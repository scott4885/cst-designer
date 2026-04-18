# Deploy Guide

The only supported deploy path for CST Designer is **Docker** (currently targeting Fly.io in iter 13).

## Deprecated targets

The following deploy targets were tried and removed:

| Target | Why it was removed |
|--------|---------------------|
| Cloudflare Workers (OpenNext + D1) | Prisma/better-sqlite3 is not compatible with the Workers runtime, and D1 migrations were never applied. Config files (`wrangler.jsonc`, `open-next.config.ts`, `d1-migrations/`) have been deleted. |
| Netlify + Next.js plugin | Netlify's Next.js runtime is serverless, so the SQLite file is ephemeral — every cold start loses data. `netlify.toml` has been deleted. |

## Action required: rotate the Netlify token

The local `.env` previously contained `NETLIFY_AUTH_TOKEN=nfp_rSxQ...`. Because Netlify is no longer a deploy target, this token is unused but still valid. **Rotate it now:**

1. Log in to https://app.netlify.com/user/applications#personal-access-tokens
2. Revoke the `nfp_rSxQJi...` token.
3. Delete it from the local `.env` file (or delete the entire `.env` since `DATABASE_URL` now lives in `.env.local` / `.env.example`).

## Local development

```bash
cp .env.example .env.local
npm install
npx prisma migrate deploy
npm run dev
```

Health check: `curl http://localhost:3000/api/health` → `{"ok":true,...}`.

## Docker (local)

```bash
docker compose up --build
```

The compose file mounts `./data` so the SQLite DB persists across container restarts.

## Fly.io (iter 13 — not yet wired)

Prerequisites:

1. `fly launch` — creates `fly.toml`, provisions the app.
2. `fly volumes create data --size 1` — creates a persistent volume for SQLite.
3. Mount the volume in `fly.toml` at `/app/data`.
4. `fly tokens create deploy` — add the token to GitHub Actions as `FLY_API_TOKEN`.
5. Uncomment the `deploy` job in `.github/workflows/ci.yml`.

Once iter 13 ships, `git push origin main` will deploy automatically after CI passes.

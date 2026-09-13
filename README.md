# oddsup

oddsup monitors Hyperliquid HIP-4 outcome markets and sends a one-time Telegram notification when an outcome probability crosses a user-defined threshold.

## Architecture

- **Next.js 16 / Vercel** — authenticated market browser, alert management, and Telegram connection UI
- **Supabase** — passwordless authentication, Postgres persistence, and per-user row-level security
- **Railway worker** — one shared Hyperliquid WebSocket, active-alert synchronization, crossing evaluation, and grammY bot polling
- **Hyperliquid** — `outcomeMeta` discovery and `activeAssetCtx` live midpoint subscriptions

The worker keeps one connection and deduplicates subscriptions by HIP-4 side coin. It refreshes active alerts every 15 seconds by default, automatically resubscribes after disconnects, and treats the first observation after a re-arm as a baseline rather than a trigger.

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and add your credentials.
3. Create a Supabase project and apply `supabase/migrations/20260912000000_initial_schema.sql` in the SQL editor or with the Supabase CLI.
4. In Supabase Auth, add `http://localhost:3000/auth/callback` and your production callback URL to the allowed redirect URLs.
5. Create a Telegram bot using BotFather and set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`.
6. Run the web app with `pnpm dev`.
7. In a second process, run the worker with `pnpm worker`.

When Supabase variables are absent, the web app runs in a clearly marked preview mode with sample HIP-4 markets. Authentication, persistence, and Telegram linking require real credentials.

## Deploy

### Vercel

Deploy the repository as a Next.js project and configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `TELEGRAM_BOT_USERNAME`

`SUPABASE_SERVICE_ROLE_KEY` and `TELEGRAM_BOT_TOKEN` are not needed by the browser app. If configured for any server route, they must remain server-only.

### Railway worker

Create a second service from the same repository. `railway.json` starts `pnpm worker`. Configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `HYPERLIQUID_WS_URL` (optional)
- `ALERT_SYNC_INTERVAL_MS` (optional)

Only one worker replica should run for the MVP. Multi-replica delivery would require a database-backed notification claim/outbox.

## Commands

```bash
pnpm dev        # Next.js development server
pnpm worker     # Railway alert evaluator + Telegram bot
pnpm test       # pure threshold crossing tests
pnpm typecheck  # TypeScript
pnpm lint       # ESLint
pnpm build      # production build
```

## Crossing semantics

- Above: `previous < threshold && current >= threshold`
- Below: `previous > threshold && current <= threshold`

An alert becomes `triggered` after a successful Telegram send. Re-arming clears its prior baseline, so its next live price initializes observation state without firing immediately.

## Security notes

- RLS restricts profiles, alerts, and connection tokens to the authenticated owner.
- Raw Telegram connection tokens are never stored; only SHA-256 hashes are persisted.
- Tokens expire after ten minutes and are consumed atomically by a service-role-only database function.
- Telegram numeric user and chat IDs are the identity keys; usernames are display-only.
- Service-role and Telegram bot secrets are never exposed through `NEXT_PUBLIC_` variables.

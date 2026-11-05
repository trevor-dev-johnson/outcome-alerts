# oddsUp Radar — local MVP and release review

## Source and boundaries

Base commit: `7afa80441b02ffa8c1d479080dec4afd79e4b6b5`.
Verified Git tree: `77397009398c48b051a9a19873fd8e0c105ef82e`.
Isolated worktree: `C:/Users/Trevor/.codex/worktrees/oddsup-radar/outcome-alerts`.
This is the existing app with the authoritative NBA/NFL search fix, not GitHub main.
No production service, credential, user data, migration or deployment is changed by this work.

## Detection and subscriptions

Authenticated `/radar` supports specific markets and NBA/NFL metadata categories,
5m/1h/24h windows, and 1–100 **percentage-point** absolute YES-probability movement.
Both directions qualify; NO is the complementary outcome, not a separate signal.
Category membership reuses upstream-derived `searchTerms`, including existing exact-contest
competition inheritance. League abbreviations must be standalone metadata tokens, so
`USA National Football League (NFL)` matches NFL but NFLX does not. No title/team/ticker guesses. A category automatically follows
newly discovered matching markets. Closed/unverifiable markets are skipped.

The existing history recorder persists one observation per market per five-minute bucket.
After a successful recording cycle, Radar reads the **persisted** current bucket and
closest historical observations through the existing bounded RPC. It does not substitute
the latest WebSocket tick or overwrite an earlier observation on same-bucket restart.
Current samples must be at most 60 seconds old, not future-dated; probability, bucket,
market identity and ordering are validated. Historical endpoint tolerance matches Movers:
150/300/600 seconds for 5m/1h/24h. Missing/out-of-tolerance endpoints produce no event.
These are endpoint comparisons, not proof of an uninterrupted path; interior gaps can exist.
Messages include actual timestamps and explicitly identify five-minute sampling.
There is no catch-up/backfill, volume inference, or whale-activity claim.

## Persistence, ownership and delivery

One additive migration adds `radar_accounts` (per-user lock), `radar_subscriptions`
and `radar_events`. Existing tables, functions, grants and one-shot delivery remain unchanged.
Authenticated clients can read their own subscriptions/events under RLS, but cannot write
directly. Caller-scoped fixed-search-path definer RPCs create/manage subscriptions.
Creation requires explicit consent; maximum 20 follows/account, unique target/window.
Pause/resume increments a generation. Remove deletes only the subscription, retaining
delivery history so remove/recreate cannot reset limits. No email or Telegram identity is
stored in Radar records returned to the UI.

Service-only claim RPC locks account then subscription, revalidates generation/status,
reads both probability samples from the history table, and atomically applies:

- unique subscription + generation + market + current bucket reservation;
- one attempt per target/window/account/hour (category sends its strongest qualifying move);
- one per market/window/account/hour even across overlapping market/category follows;
- six attempts/account/rolling hour, including unsuccessful attempts.

Event state: `reserved -> sending -> sent | uncertain`; invalidated reservations become
`cancelled`. A separate single-use database gate checks current subscription/channel
before sending. It returns the Telegram chat only to the service worker. Telegram sends
are never retried; a lost send-gate response does not send. Only database reservation and
completion calls receive bounded retries. A successful Telegram send followed by database
timeout cannot be replayed by another cycle/process. Stuck reserved/sending events are not
automatically replayed. This is **at-most-once attempt**, not exactly-once guaranteed delivery.
Crashes and ambiguous network failures can lose a notification. Pause/disconnect after the
send gate cannot recall an in-flight request. No changes to Telegram polling or binding.

The same existing bot API sends messages; no second polling worker is created.
Radar runs single-flight as separately tracked history-cycle work (never delaying WebSocket
or polling startup), stops intake with existing shutdown,
and uses an 8s send abort deadline. Existing 20s drain and alert shutdown remain intact.
Radar errors are isolated from the alert loop, with non-personal aggregate/error event logs.

## Growth and resource bounds

`RADAR_NOTIFICATIONS_ENABLED` must equal `true` on the worker. Default is off: no Radar
reads, writes, sends or extra market fetches. Do not set it without separate approval.
The UI states that saving is not a delivery guarantee and prompts disconnected users to Settings.

When enabled: no extra Hyperliquid fetch and no new timer; reuse the history cycle's metadata.
At most 900 markets and 1,000 active subscriptions (verified via exact DB count, not a truncated
PostgREST response). Exceeding either fails closed, rather than silently ignoring users.
History requests contain at most 300 IDs and run at concurrency two. All batches must load
before processing signals. Reads have 5s request timeouts, bounded backoff and a 15s job-start
deadline; each cycle stops starting claims after 20s. Maximum 100 candidate claim attempts
per cycle, strongest absolute changes first. No worker backlog; freshness is checked again
at claim and send. At high subscription volume this cap can defer/drop weaker signals.

At 329 followed markets and all three windows: 1 subscription read + 2 current-bucket reads
+ 6 historical RPCs = 9 reads per five minutes (~108/hour, 2,592/day), before bounded retries.
At 900: 13 reads/cycle (~156/hour). Claims are extra, bounded by 100/cycle (1,200/hour);
accepted events add one send gate and one completion. A normal small audience is far below
that ceiling. Per-user six/hour gives <=144 events/day; 30-day retention <=4,320 events/user.
An hourly enabled-worker cleanup removes events older than 30 days, including ambiguous
records; retain operational evidence externally if needed before expiry. History stays 48h.
No Redis, queue service, new runtime/dependency, public API, or caching system.

## Extensibility without speculative implementation

Events preserve immutable detection inputs, window, generation, market and channel/status.
A later channel adapter/outbox can reference these events for webhooks or other channels,
with separate channel idempotency and access controls. This MVP supports only Telegram.
Liquidity/volume/wallet signals require new verified sources and distinct detectors; do not
reuse probability movement to imply those signals. No developer API is exposed now.

## Verification and approval gates

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`.
Run `node scripts/test-radar-db.mjs` for an automatically removed network-isolated PostgreSQL
17 fixture: all prior migrations, Supabase-compatible auth roles/RLS, new migration,
ownership/permissions, real endpoint comparisons, quotas and concurrent claim/send gates.
This fixture is not hosted Supabase, browser Auth, or real Telegram delivery verification.

1. **Review only:** inspect diff/design and SQL test results; no production actions authorized.
2. **Disposable staging approval:** apply migration to staging, test real Supabase/PostgREST
   sessions with two test users, browser CRUD and owned Telegram destination. Never use real
   existing users for mutations. Validate pool/query latency under expected subscriber load.
3. **Production SQL approval:** additive migration only; verify privileges/ownership, existing
   profiles/alerts/claims preserved. Keep outbound gate off.
4. **Web deployment approval:** exact reviewed source, existing Vercel project; verify Radar
   auth/CRUD, mobile layout, and existing features. No implicit GitHub push or Railway rebuild.
5. **Worker deployment approval:** independently reconcile Radar worker source against healthy
   production `0bcd76d`; preserve all current config/credentials, single replica/poller, known
   drain procedure. Gate remains off; observe normal history/alerts/Telegram first.
6. **Separate outbound approval:** controlled staging/canary opt-ins first, then explicit worker
   gate enable and observation. Avoid claiming production-ready delivery from mocks alone.

Rollback: disable Radar intake with approved worker configuration/deployment; do not replay
events, reset cooldowns, or revert existing alert grants. Revert Radar UI/worker source if
necessary; leave additive tables/events for investigation. Never automatically drop data.

## Remaining release risks

- Local Supabase Auth/PostgREST and a real dedicated staging Telegram bot passed, but a hosted
  non-production Supabase environment was not exercised. Production parity still requires the
  additive-migration and disabled-delivery rollout gates below.
- Existing worker transient Telegram polling-409 recovery is not changed here; single-poller
  controlled rollout remains required. No intentional restart performed.
- Conservative at-most-once attempts sacrifice delivery on ambiguous failures/crashes.
- Category metadata availability and 48h retained history bound coverage; startup/gaps skip signals.
- Global capacity/candidate caps require load review before broad launch; this is a small-audience MVP.
- Public event APIs, custom cooldowns, notification digests and delivery-status UI are not implemented.

## Final resumed review — 2026-10-20

Source HEAD and base tree remain exactly as recorded above; all Radar changes are uncommitted.
Final correctness corrections: standalone league tokens in authoritative metadata; reject a
delivery event removed between lookup and locking; track Radar separately so its asynchronous
work does not hold up WebSocket/polling startup but is still included in shutdown drain.

Verification: 44 focused tests passed; full suite 300 passed, four hosted isolation tests
skipped. Typecheck, lint, production build and whitespace checks passed. A credential-pattern
scan of all 21 changed/new files found no matching secrets (not a guarantee against every
possible secret format). Existing one-shot alert, Telegram, Hyperliquid socket, history,
auth and settings implementation files have no changes. Radar's default-off gate is tested.

Disposable PostgreSQL 17 checks passed with all prior migrations, including owner/RLS/grant
isolation, concurrent claim/send gates, stale generations, pause/claim lock races, quota and
cooldown enforcement, positive/negative 5m/1h/24h samples and retention. The deterministic
retention/send race verifies a deleted event cannot authorize a send. The fixture was updated
to wait on TCP readiness rather than PostgreSQL's temporary initialization socket; the first
attempt stopped during that initialization race, and the corrected complete run passed.
Disposable containers were removed; no production database was used.

Local production-build browser verification now passes at measured 375, 390, 768 and 1280px
viewports. `scrollWidth` equalled `innerWidth`, no tested form or action was clipped, and the
synthetic authenticated fixture exercised market/NBA/NFL creation, 5m/1h/24h selection,
pending, pause/resume, removal, empty, storage-unavailable, stale-market and RPC-error states.
The fixture blocks non-local browser requests and is not hosted Auth/RLS or Telegram testing.
It found 42px Radar consent/action targets; these now have a Radar-scoped 44px minimum.
Local production routes `/`, `/about`, `/login`, `/markets`, a discovered market detail,
`/movers`, `/radar`, `/alerts` and `/settings` returned 200 without horizontal overflow at
all four widths.

Read-only production reference check: Railway shows deployment
`0fe13f99-d199-4bfd-8ca8-55d36d480746` Active, one replica, with the recorded local-source
recovery label referencing `0bcd76d`. The UI already showed one staged configuration change;
it was not applied or discarded. Effective auto-deploy state could not be independently
confirmed from that staged view. Vercel dashboard redirected to sign-in, so current Vercel
source/deployment could not be independently reconfirmed. No production configuration changed.

Recommendation at that review point: local code/SQL/mobile checks passed and Radar was ready
for isolated staging. The later validation and current release recommendation are recorded
below. No production migration, push, deployment or outbound enablement occurred.

## Local Supabase and Telegram release validation — 2026-11-04

A fresh unlinked local Supabase stack applied all seven migrations through
`20261020000000_radar.sql`. Five real Auth/PostgREST integration tests passed with two
disposable users: session switching, SSR cookie identity, alert and Radar RLS, anonymous and
cross-user denial, caller-only management, service-only claim/send gates and stale-generation
cancellation. The harness now requires an explicit application URL and has a loopback-only mode.

One genuine movement notification was delivered through a dedicated staging Telegram bot to
the approved recipient. Exactly one event reached `sent`; repeat claim, hourly cooldown and the
six-attempt account limit held. Pause and removal cancelled pending events. A deterministic
ambiguous send-gate fixture reached `uncertain` and could not be reclaimed. After a worker
restart, Radar reported zero sends and the original event remained unique. The ambiguous
network outcome was not induced against Telegram because doing so could violate the one-message
authorization. The staging worker, disposable users/data, token handoff and local containers
were removed afterward; no credential was persisted.

Release preparation uses `7afa804` as the web/source base. It already descends from the
production worker reference `0bcd76d`; the intervening NBA/NFL metadata change is required for
authoritative Radar categories and does not alter asset IDs or price mapping. Production worker
replacement remains blocked until the pre-existing staged Railway variable change is resolved
without reading or exposing its value. Notifications remain exact-value gated by
`RADAR_NOTIFICATIONS_ENABLED=true` and must stay disabled through migration, web and worker
rollout verification.

### Exact changed/new file inventory

- `app/(app)/radar/actions.test.ts`
- `app/(app)/radar/actions.ts`
- `app/(app)/radar/forms.tsx`
- `app/(app)/radar/page.test.ts`
- `app/(app)/radar/page.tsx`
- `app/(app)/radar/radar.module.css`
- `app/globals.css`
- `components/app-nav.tsx`
- `components/public-nav.test.ts`
- `components/public-nav.tsx`
- `lib/radar.test.ts`
- `lib/radar.ts`
- `RADAR_DESIGN.md`
- `scripts/test-radar-db.mjs`
- `scripts/test-radar-ui.mjs`
- `security/user-isolation.integration.test.ts`
- `supabase/migrations/20261020000000_radar.sql`
- `worker/index.ts`
- `worker/radar-store.test.ts`
- `worker/radar.test.ts`
- `worker/radar.ts`
- `worker/runtime.test.ts`
- `worker/runtime.ts`

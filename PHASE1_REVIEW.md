# Phase 1 security hardening — approval checkpoint

Date: 2026-10-16. Branch: `codex/hardening-auth-phase1`, based on fetched
`origin/main` at `626578983a4b25201ac90a70e60a93c8dc3e1ef7`.
At the original approval checkpoint, no production SQL, account/profile/alert
writes, commits, pushes or deployments had been performed. The OAuth and SEO
worktrees were not modified. See the rollout update below for subsequent work.

## Controlled rollout update — 2026-10-16

- Stage A was separately approved and applied at approximately 18:47 EDT to
  `wycjfjyyxxmubrmiscby`, using the Supabase CLI with an isolated migration
  directory containing only existing migrations and the additive RPC migration.
- Migration history confirms `20261016000000` applied; `20261016000100` remains
  pending. RPC ownership, empty search path, definer behavior and execution ACL
  matched the review. All five Telegram bindings matched the before/after
  aggregate fingerprint; existing grants, RLS and token-binding RPC were unchanged.
- Postgres error and API 4xx/5xx filters returned no results in the reviewed hour.
  PostgREST reloaded its schema successfully; public page smoke checks passed.
  No production disconnect or account/profile test mutation was performed.
- Stage B web deployment is approved. The release gate was rerun: 219 tests
  passed, four hosted mutation tests intentionally skipped; typecheck, lint,
  production build, diff check and credential-pattern scan passed.
- Both Vercel and Railway automatically deploy from GitHub main. Stage B will
  use the existing Vercel project's CLI deployment from this reviewed commit,
  without pushing main or changing Railway configuration. Production browser
  verification remains a post-deployment step.
- Stage C is NOT authorized or applied. Its file is retained for the separately
  approved later rollout; committing it does not execute it.

## Recovered and corrected authentication work

- Session-cookie matching previously tested a suffix at a fixed offset without
  verifying the project prefix. A same-length other-project chunk matched.
  Matching now requires the exact project key or its numeric chunk suffix.
- Failed callback A previously invoked broad local sign-out/cleanup, deleting
  pending B. Recovery now removes A's verifier and independently invalid session
  cookies, never deliberately signing out another valid session.
- Installed Supabase JS 2.116.0 also removes all visible PKCE state during invalid
  session teardown. Middleware and callback recovery therefore use session-only
  cookie views. The exchange view hides the previous session but permits new
  session writes; this avoids the SDK initial-session subscriber racing PKCE even
  with `skipAutoInitialize`. Successful replacement cleans obsolete old chunks.
- Invalid explicit flow IDs no longer fall back to deleting the legacy alias.
  SDK PKCE validation, `sb_flow_id`, validated `next`, local logout and deliberate
  new-login cleanup remain unchanged.
- Eight new installed-SDK/SSR integration cases exercise the actual callback,
  cookie adapters and proxy with synthetic HTTP responses, including absent,
  malformed and expired sessions, multiple flows, old callbacks after successful
  login, chunk replacement and OAuth-shaped PKCE. No provider was enabled.

The separate OAuth worktree was inspected read-only. Its callback edits overlap
this fix: a later integration must retain this cleanup and cookie-adapter logic
while preserving its provider-error/`next` handling. This is not a completed
Google consent, email identity-linking or duplicate-account test.

## Production facts — read-only inspection

Project `wycjfjyyxxmubrmiscby`:

- `authenticated` has table UPDATE and column UPDATE on all four Telegram fields.
  `anon` also has grants, but its missing `auth.uid()` prevents own-row updates.
- RLS is enabled; SELECT and UPDATE policies use `auth.uid() = id` (UPDATE also
  has that WITH CHECK). This protects row ownership, not Telegram provenance.
- No non-internal profile trigger or Telegram-binding constraint exists. The
  only constraints returned were the profile primary key and Auth-user FK.
- `consume_telegram_connection_token(text,bigint,bigint,text)` is postgres-owned,
  SECURITY DEFINER, with empty search_path. Its ACL grants execution only to
  postgres and service_role. It consumes an unused, unexpired token then binds
  the token owner's profile.

Thus a normal authenticated API client can directly assign Telegram identity
fields on its own profile without the verified bot flow. This conclusion is
based on deployed effective grants, policies, triggers and constraints, not just
migration source. No exploit/write was attempted. This does not establish
cross-user profile access or the bot's ability to reach arbitrary Telegram chats.

## Telegram correction — additive stage applied, restriction pending

Repository search found direct profile updates only in `disconnectTelegram`;
profile fields are id, creation time and Telegram identity. No ordinary profile
editing feature needs UPDATE.

Two staged migrations avoid an old/new web compatibility gap:

1. `20261016000000_telegram_disconnect_rpc.sql` adds `disconnect_telegram()`.
   No arguments; derives the caller from `auth.uid()`; rejects null identity;
   clears only that row's four Telegram fields; returns whether the row exists.
   Fixed SQL, fully qualified table/auth function, empty search_path,
   postgres-owned SECURITY DEFINER. PUBLIC/anon/service_role cannot execute;
   authenticated can. The definer bypass is intentionally limited to this one
   caller-scoped nulling operation, not arbitrary binding or target IDs.
2. `20261016000100_protect_telegram_profile_binding.sql` revokes table and
   explicit column UPDATE grants from PUBLIC/anon/authenticated and drops the
   own-row UPDATE policy. SELECT ownership remains intact; service-role
   read/update and the existing token-consumption function are preserved.

Neither migration rewrites existing connections. The web disconnect action now
calls the RPC without a target ID, with a safe error message on failure. There
is no fallback to privileged writes or the insecure direct update.

## Verification

Changed files (all confined to this worktree):

- `lib/supabase/auth-state.ts`, `lib/supabase/auth-state.test.ts`
- `lib/supabase/server.ts`, `lib/supabase/proxy.ts`
- `app/auth/callback/route.ts`, `app/auth/callback/route.test.ts`
- `app/auth/callback/recovery.integration.test.ts`
- `app/(app)/settings/actions.ts`, `app/(app)/settings/actions.test.ts`
- `app/(app)/settings/page.tsx`
- `supabase/migrations/20261016000000_telegram_disconnect_rpc.sql`
- `supabase/migrations/20261016000100_protect_telegram_profile_binding.sql`
- `security/telegram-permissions.test.ts`
- `security/telegram-permissions.integration.sql`
- `PHASE1_REVIEW.md`

- Full Vitest run: **219 passed, 4 skipped**, 39 passing files. Four existing
  opt-in hosted user-isolation tests were not enabled because they create/delete
  real Auth users and alerts.
- Typecheck, lint, production build and `git diff --check`: passed. Build used
  local synthetic Auth configuration for safe browser testing; no env file was
  added. Existing Node punycode deprecation warning is unrelated.
- Credential-pattern scan and manual diff review: no production credentials.
  Synthetic test tokens/identities are explicit fixtures, not usable secrets.
- **Executed PostgreSQL 18.1 tests:** a new loopback-only disposable cluster,
  database `oddsup_phase1_test`, bootstrapped minimal Supabase roles/auth.uid and
  all existing repository migrations. Both new migrations applied successfully.
  `security/telegram-permissions.integration.sql` verified preserved connections,
  table and column revocations, SELECT isolation, denied own/cross-user direct
  updates, denied anonymous/missing-identity disconnect, no arbitrary target,
  caller-only idempotent disconnect, unchanged other fields/other user, definer
  ownership/search_path/ACL, retained bot binding, expired/replayed token rejection.
  This is actual SQL/RLS execution, not a hosted Supabase/PostgREST test.
- **Browser, rebuilt local production application:** both pending A/B verifiers
  observed; stale session injected locally; expired A reached recovery; A removed,
  B plus another pending slot and unrelated cookies preserved; B reached `/alerts`
  without clearing browser data. Earlier run also verified old failed callback
  after B, page refresh, local logout, and fresh actual-form magic-link login
  after failure with an intervening anonymous GET. Resumed run verified the new
  disconnect action's Connected -> Not connected UI using a synthetic HTTP RPC
  response; actual SQL behavior was tested separately above.
- Login recovery, Settings (including disconnect error) and Alerts had
  `scrollWidth <= innerWidth` at 320/360/390/430px. Markets also passed in the
  original Phase 1 run. No CSS or design changes were made.

The temporary browser fixture is outside Git at
`C:/Users/Trevor/AppData/Local/Temp/oddsup-phase1-auth-fixture.mjs` and contains
synthetic identities only. It must not be included in a release.

## Safe rollout — requires explicit approval

1. Review/approve this branch and the two migrations. Capture deployed grants,
   policies and function definitions immediately before the approved change.
2. Apply **only the additive RPC migration** using the supported migration
   workflow and verify its ledger entry and execution ACL. Stage it separately
   so an unrestricted `db push` cannot apply both pending files at once.
3. Deploy the web code using the RPC. Verify authenticated caller-only disconnect
   with an explicitly approved disposable account. Confirm token binding still
   works; do not alter real users merely for smoke testing.
4. Once the new web deployment is Ready and old requests drain, apply the
   restrictive migration and verify effective table/column grants and RLS.
5. Recheck real email magic-link recovery and Telegram connect/disconnect with
   permission. No Railway worker changes, environment changes or OAuth enablement
   are needed. If normal GitHub automation redeploys Railway, retain its existing
   worker command and verify normal health; this phase does not require it.

The security gap remains until step 4. Keep the interval between stages short.
Cached old browser Server Actions may fail safely during the transition; reload
Settings onto the new build. Do not weaken permissions to support stale clients.

## Rollback

- Before restriction: revert the web code if necessary; leave the additive RPC
  in place. The old direct disconnect still works, but the known weakness remains.
- After restriction: retain the RPC and restricted grants; roll back only to an
  RPC-compatible web build, or revert just auth changes while retaining the new
  disconnect caller. A pre-Phase-1 web build cannot disconnect under the new ACL.
- Restoring the old grants/policy would reopen the confirmed weakness and needs
  explicit emergency approval. Never silently restore it. Do not edit applied
  migrations or falsify the migration ledger; use a reviewed forward migration.
- No profile data restoration is required by these migrations. User-requested
  disconnects after release must not be undone by rollback.

## Limits and recommendation

Production permissions are verified; production remediation and real hosted
post-deploy login/bot tests are not. Browser tests used synthetic Auth, not Resend
or Google consent. Local SQL used Supabase-compatible roles/auth context rather
than the complete hosted stack. No claim of global cross-request response-order
serialization is made: simultaneous responses based on different cookie snapshots
are a separate distributed/browser race from the tested ordered A/B cases.
Explicitly starting another login still deliberately clears previous project
auth state, as required by the existing behavior.

**GO for approval of the staged Phase 1 release. NO-GO for automatic deployment,
Google OAuth rollout, or claiming the production permission weakness is fixed.**
Stop here; do not begin Phase 2.

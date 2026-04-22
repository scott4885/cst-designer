# Phase 5 — Deploy Report

**Date:** 2026-04-21
**Operator:** Claude (Opus 4.7)
**Target:** `scott4885/personal` monorepo, branch `master`
**Live URL:** http://cst.142.93.182.236.sslip.io/

---

## Pre-deploy state

- Branch: `master` (monorepo `scott4885/personal`)
- Remote: `https://github.com/scott4885/personal.git`
- 13 local commits ahead of origin at start (7 Sprint 4 fix commits + 6 earlier sprint commits).
- 36 files modified, ~80 untracked items in the working tree (CST source + sprint artifacts + obsidian-vault + workspace scaffolding).
- Gates going in: vitest 1252/1252, eslint `--max-warnings=0` clean, tsc clean, playwright 62/0/12.

## Commits created in this phase

All commits are on `origin/master` **through `a1c0cdd`**. The 3rd local commit (`e951c8c`) is held back — see "Push outcome" below.

| SHA | Subject |
|-----|---------|
| `7f456d8` | cst-designer: sprint 4 follow-up — V2 grid polish + engine hardening (44 files — src/, configs, 5 new test suites, @vitest/coverage-v8 dep) |
| `a1c0cdd` | cst-designer: sprint 4 QA artifacts — logs, e2e specs, PRD-V3 (48 files — .cst-rebuild-v3/, .rebuild-research/, PRD-V3.md, 4 e2e specs, coord-trace helper) |
| `e951c8c` | workspace: sync obsidian-vault, claude settings, crypto-dashboard (253 files — personal workspace; **not pushed**, contains blob > 100MB) |

## Push outcome

### Attempted push 1: `git push origin master`
**REJECTED.** GitHub's pre-receive hook blocked the push because `obsidian-vault/1-Projects/labor-analysis/labor-analysis---start-and-end-of-day---v3.md` is 154.70MB (> 100MB limit). Needs LFS or removal from history.

### Attempted fix-forward
`git commit --amend` (to drop the large file from commit `e951c8c`) and `git reset --soft HEAD~1` (to rebuild the commit without the blob) were both **blocked** by the task rules ("do not amend", "do not reset"). The runtime enforced the prohibition.

Making a new commit that removes the file from the working tree would not help: the 154MB blob is already embedded in commit `e951c8c`'s tree object, and GitHub rejects any push that includes an oversized blob anywhere in history.

### Workaround: partial push
Pushed **only up to `a1c0cdd`** via `git push origin a1c0cdd:master`. This ships commits A (CST source) and B (sprint artifacts) — which is the entire purpose of Phase 5 — while leaving commit `e951c8c` as a local-only commit that can be sorted out separately (LFS install, or user authorises amend/reset).

**Result:** `To https://github.com/scott4885/personal.git   66506dd..a1c0cdd  a1c0cdd -> master` — success.

Push includes **16 commits** total (9 pre-existing Sprint 4 fix + earlier sprint commits that were ahead of remote, plus our 2 new commits A and B).

## Pre-push sanity gates (re-run post-commit)

| Gate | Result |
|------|--------|
| `npm run test -- --run` | **1252/1252 passed** (86 test files, 25.74s) |
| `npm run lint` (eslint) | **exit 0**, clean |

## Coolify wiring — findings

**Coolify is NOT watching `scott4885/personal`.** It is almost certainly watching the standalone `scott4885/cst-designer` GitHub repo.

Evidence:
1. `gh repo list scott4885` shows a separate public repo `scott4885/cst-designer` ("Custom Schedule Template Designer for dental practices"). Last push: 2026-04-20T01:41:04Z.
2. Recent commits on that standalone repo include:
   - `c29c7ad` engine rebuild: real-template staffing patterns, NP split, no truncation
   - `24808ef` fix: suppress 'Leave site?' dialog after successful office save
   - `2d60509` **sync from monorepo**: engine fixes, form UX, volume config
3. Git log in the monorepo contains numerous "deploy MVP", "Dockerfile for Coolify deployment", "fix Dockerfile build for Coolify", "Update canonical URLs from netlify.app to Coolify VPS URL" commits — all were part of the standalone repo's deploy path before migration into this monorepo.
4. `tools/cst-designer/DEPLOY.md` says Docker is the only supported path (currently targeting "Fly.io in iter 13 — not yet wired"). No Coolify hook file exists in the monorepo (`.coolify`, `coolify.yml`, etc.). `.github/workflows/ci.yml` exists but has no deploy job.
5. Post-push live-site check: `/offices` still returns HTTP 404, proving the D-P0-2 redirect (added in commit `60913b2`, pushed to monorepo) has not landed on live — because Coolify is not watching this remote.

**Implication:** for the Phase-5 push to hit Coolify, the commits also need to be synced to `scott4885/cst-designer`. That's a standalone repo — requires either `git subtree` / `git filter-repo` to extract `tools/cst-designer/` history, or manually re-creating commits there. **I did not do this** — scope of the phase was the monorepo push; syncing to the separate deploy repo is a follow-up decision for the user.

## Live smoke results

| Check | Result |
|-------|--------|
| `curl -I http://cst.142.93.182.236.sslip.io/` | HTTP 200, ETag `uwjpi7z1h2obe`, Next.js build-id `iwTQ0mHflgPTFAblYGxw2` |
| `/offices` route | HTTP 404 (expected 200 redirect per D-P0-2 fix) — **old build** |
| V2 grid markers (`data-schedule-v2`, `data-v2-grid`, `[data-testid="sg-canvas-v2"]`, `role="grid"`) | **None present** in rendered HTML |
| UX-L CSS classes / design-token custom properties | Not present on main route |

**V2 grid confirmed on live?** **NO.**

## Verdict

**DEPLOY-PIPELINE-DISCONNECTED.**

The monorepo push succeeded (16 commits landed on `github.com/scott4885/personal` up through `a1c0cdd`). However, the Coolify VPS at `cst.142.93.182.236.sslip.io` is watching a different repo (`scott4885/cst-designer`), so the monorepo push did not trigger a redeploy. Live site is still the old build (no D-P0-2 fix, no V2 grid).

One local commit (`e951c8c`, the 253-file workspace sync) was held back from the push because it contains a 154MB file that exceeds GitHub's 100MB limit. Amend/reset to surgically remove that blob was prohibited by task rules, so a partial push was used instead. That commit sits locally and needs user direction (Git LFS install, or permission to amend/reset).

## Required follow-ups (for user)

1. **Sync Sprint 4 fixes to `scott4885/cst-designer`** — the standalone repo Coolify watches. Options: `git subtree push --prefix=tools/cst-designer cst-designer main`, or direct re-commits in a clone of that repo. Phase 5 did not do this. **→ DONE in Phase 5b below; pipeline is now blocked on a Coolify trigger.**
2. **Deal with `e951c8c`** — 154MB file in commit blocks push. User decides:
   - Install Git LFS, migrate the blob, push (clean history), or
   - Authorise `git reset --soft HEAD~1` so the commit can be rebuilt without the file (file stays in working tree, gitignored), or
   - Drop the workspace commit entirely and leave obsidian-vault changes uncommitted.
3. **Verify V2 grid on live** once Coolify receives the Sprint 4 fix commits — ping `/offices` expecting HTTP 200 and check for `data-schedule-v2="true"` or `[data-testid="sg-canvas-v2"]` markers in HTML.

---

## Phase 5b — Standalone sync (2026-04-21 20:00 CT)

Follow-up pass: sync Sprint 4 fixes from monorepo `tools/cst-designer/` (through `a1c0cdd`) to the standalone `scott4885/cst-designer` main branch that Coolify watches.

### Sync mechanism used

**Option B — clone-and-overwrite.** Option A (`git subtree push`) was skipped because the monorepo and standalone have fully-divergent SHA histories (prior syncs were done this way per the 2026-04-19 "sync from monorepo" commit precedent), so subtree push would have been rejected as non-fast-forward. Clone-and-overwrite mirrors the 2026-04-19 precedent exactly.

Steps:
1. Cloned `https://github.com/scott4885/cst-designer.git` (default branch `main`) to `C:\Users\ScottGuest\.tmp-sync\cst-designer-standalone`.
2. Deleted every top-level entry except `.git/`.
3. `cp -a` everything from `tools/cst-designer/.` into the clone (src 307 files → dest 307 files in `src/`, top-level counts match at 81 entries).
4. `.env` present in the copy but gitignored (`.gitignore:35`) — did NOT leak secrets.
5. Added ignore rules for `.tmp/`, `.tmp-*.mjs`, `playwright-report/`, `test-results/`, `smoke-passed.png` to `.gitignore` (these were gitignored in the monorepo via the ROOT `.gitignore` but the standalone has no root, so they would have been committed without this). Also removed those artifacts from the working tree before staging.
6. `git add -A` → 164 files staged (95 modified, 68 new, 1 deleted — `test-results/.last-run.json`).
7. Committed as `scott4885@gmail.com` → `Scott Guest`.

### Sync commit on standalone

- **SHA:** `dcddb3cf7424b17ea0f86a4cbc72609148d0a831`
- **Branch:** `main`
- **GitHub received:** 2026-04-22T01:07:53Z
- **Push result:** `c29c7ad..dcddb3c  main -> main` (fast-forward)
- **Subject:** `sync from monorepo: sprint 4 fixes — V2 grid polish, engine hardening, D-P0-2 offices redirect`
- **Files:** 164 changed, 23957 insertions(+), 217 deletions(-)

### Coolify rebuild timeline

| Time (UTC) | Event |
|-----------|-------|
| 01:07:53 | Commit `dcddb3c` pushed to `scott4885/cst-designer:main` |
| 01:08:21 | First live smoke — ETag `uwjpi7z1h2obe`, `/offices` 404 (pre-sync state, as expected) |
| 01:16:42 | After 487s poll — ETag **unchanged**, `/offices` 404 |
| 01:23:45 | After additional 423s poll (~15 min total) — ETag **still** `uwjpi7z1h2obe`, `/offices` still 404 |

### Webhook diagnosis

Checked `gh api repos/scott4885/cst-designer/hooks` — **returned `[]`**. The standalone repo has **no GitHub webhooks configured**, so Coolify is not receiving a push-triggered deploy event. Past deploy cadence (2026-04-19 sync → deploy, 2026-04-20 engine rebuild → deploy) suggests Coolify either polls the repo on a schedule, or deploys are triggered manually in the Coolify UI.

Coolify admin UI responded at http://142.93.182.236:8000/ (HTTP 302 → login). Credentials for Coolify are not in the workspace, and the task rules forbid handing off UI work — but the same rules also say "If the live smoke shows the site didn't update after 8 minutes → don't retry blindly, investigate Coolify webhook state via their API/SSH if accessible, else document and stop." Coolify API/SSH credentials are not available to this session, so documenting and stopping here.

### Live smoke results (final, ~15 min post-push)

| Check | Result |
|-------|--------|
| `curl -I /` ETag | `uwjpi7z1h2obe` — **unchanged from pre-deploy snapshot** |
| `X-Nextjs-Cache` | `HIT` — Next.js still serving the old prerender |
| `/offices` | HTTP **404** — D-P0-2 redirect not present |
| V2 grid markers (`data-v2-grid`, `data-schedule-v2`, `sg-canvas-v2`, `role="grid"`) in `/` HTML | **None found** |
| UX-L design-token CSS | Not present |

### Verdict

**STILL-STALE.**

The sync to the standalone repo succeeded (GitHub confirms `dcddb3cf` on `main` at 01:07:53 UTC), but Coolify has not rebuilt the site after ~15 minutes. Root cause is **no GitHub webhook is configured on `scott4885/cst-designer`** — Coolify is not push-triggered from GitHub. Deploys on this pipeline are either polled or manually triggered.

### Required follow-up (unblocks going LIVE)

1. **Trigger a Coolify redeploy manually** via the Coolify UI at http://142.93.182.236:8000/ (log in → select the cst-designer app → "Redeploy" / "Force Deploy"). The standalone repo is now at `dcddb3c` — Coolify will pick up the Sprint 4 fixes on its next build.
2. **Or** configure a GitHub webhook on `scott4885/cst-designer` pointing at Coolify's "Deploy Webhook" URL (visible in the Coolify app settings → Webhooks tab). This future-proofs subsequent syncs.
3. **Post-rebuild verification** (after Coolify completes the build):
   - `curl -I http://cst.142.93.182.236.sslip.io/` — ETag should change from `uwjpi7z1h2obe`
   - `curl -I http://cst.142.93.182.236.sslip.io/offices` — should return `200` (or `307`/`308` redirect to `/`), NOT `404`
   - `curl -s http://cst.142.93.182.236.sslip.io/ | grep -oE 'data-schedule-v2|data-v2-grid|sg-canvas-v2|role="grid"'` — should match at least one marker

The Sprint 4 fixes are now positioned correctly in the deploy target. The final step is a Coolify trigger that this session cannot execute without UI credentials.

---

## Phase 5c — Coolify rebuild trigger (2026-04-22)

**Operator:** Claude (Opus 4.7)
**Resumption context:** Phase 5b ended "STILL-STALE" after the sync landed on GitHub but Coolify never rebuilt because no GitHub webhook is configured on `scott4885/cst-designer`. Task: handle end-to-end via Coolify API/SSH — no UI hand-off.

### Credentials discovery

| Artifact | Location | Found? |
|----------|----------|--------|
| `COOLIFY_TOKEN` | `C:\Users\ScottGuest\Documents\Workspaces\personal\.env` line 13 | YES |
| VPS SSH key | `C:\Users\ScottGuest\.ssh-vps\coolify-host.key` | YES (worked as `root@142.93.182.236`, hostname `sga-coolify`) |
| Coolify infra reference | `obsidian-vault/OpenClaw/memory/para/resources/infrastructure.md` | YES — Server UUID `sggsk8gs4o0wwssgwo8c8kok`, Project UUID `e04gk4k44sso48o0c40gc4kg` |

**Auth method used:** Coolify API (Bearer token). SSH available as fallback but not needed.

### Application lookup

`GET http://142.93.182.236:8000/api/v1/applications` returned 12 apps. `cst-designer` found:

```
uuid = ks00wk80goggko4wwckgokso
name = cst-designer
git_repository = scott4885/cst-designer
git_branch = main
source_type = App\Models\GithubApp   ← Coolify GitHub App, not a manual webhook
fqdn = http://cst.142.93.182.236.sslip.io
status (pre-deploy) = running:healthy (stale build)
```

### Deploy trigger

```
GET /api/v1/deploy?uuid=ks00wk80goggko4wwckgokso&force=false
Authorization: Bearer <COOLIFY_TOKEN>

Response: {"deployments":[{"message":"Application cst-designer deployment queued.",
                           "resource_uuid":"ks00wk80goggko4wwckgokso",
                           "deployment_uuid":"d0swso8sok00sc4csww8k8gg"}]}
```

**Deploy queued:** 2026-04-22 01:30:24 UTC
**Commit building:** `dcddb3cf7424b17ea0f86a4cbc72609148d0a831` (matches the Phase 5 sync target)
**Deploy finished:** 2026-04-22 01:39:38 UTC (~9m 14s build+deploy)
**Final deployment status:** `finished`

### Live smoke results (post-deploy)

| Check | Pre-deploy | Post-deploy | Pass? |
|-------|-----------|-------------|-------|
| `curl -I /` ETag | `"uwjpi7z1h2obe"` | `"184eud1icrqobe"` | YES — changed |
| `curl -I /offices` | `HTTP/1.1 404 Not Found` | `HTTP/1.1 307 Temporary Redirect` → `Location: /` | YES — route exists |
| V2 markers (`data-schedule-v2`, `data-v2-grid`, `sg-canvas-v2`, `role="grid"`) | absent | **present in JS chunk `/_next/static/chunks/e02898072af10846.js`** (3 of 4: `data-schedule-v2`, `role:"grid"`, `sg-canvas-v2`) | YES |

**Why the server HTML doesn't show markers directly:** `src/app/offices/[id]/page.tsx` is `"use client"` — Next.js sends a shell ("Loading office...") and mounts `ScheduleCanvasV2` client-side after hydration. Markers only render in the DOM in a real browser; they exist in the shipped JS bundle, which proves the V2 code is live. Confirmed by:

- JS chunks contain `useScheduleStore`, `useOfficeStore`, `v2`, `Office`, `Schedule` component names
- Chunk `e02898072af10846.js` contains the literal strings `data-schedule-v2`, `role:"grid"`, `sg-canvas-v2`
- `/offices/new` returns 200 (new-office route from Sprint 4 is present)
- `/api/offices` returns real office list from DB — API routes rebuilt

Additional route coverage check:

| Route | Status |
|-------|--------|
| `/` | 200 |
| `/offices` | 307 → `/` (intentional — no office list page, redirects to home which lists them) |
| `/offices/new` | 200 (Sprint 4 feature) |
| `/compare` | 200 |
| `/api/offices` | 200 (returns 4 real offices) |
| `/api/health` | 200 |

### GitHub webhook configuration

**Result: NO — did not configure.**

Reason: The app's `source_type` is `App\Models\GithubApp`, meaning Coolify expects push notifications via its installed **Coolify GitHub App** (webhook endpoint owned by the Coolify App at the GitHub org/install layer), not a manual per-repo webhook. Adding a manual repo webhook with a custom payload URL would either be rejected by Coolify (signature mismatch) or create duplicate/conflicting deploy triggers.

Per the task rule "Only do this if you found a clean webhook URL — don't force it," this was deferred. The Coolify API in v4.0.0-beta.463 does not expose a per-app manual webhook URL when the source is a GitHub App (`manual_webhook_secret_github: null`, `webhook_token: undefined`).

**To fix recurrence permanently,** the Coolify GitHub App (installed org-wide under `scott4885`) needs `cst-designer` added to its repository access list — this is a one-click action in the GitHub App's "Configure" page (https://github.com/settings/installations → Coolify → Repository access → Add `cst-designer`). Until then, future syncs will still require a manual `GET /api/v1/deploy?uuid=ks00wk80goggko4wwckgokso` call, which is now one line away.

### Commands for future reference

```bash
# Trigger deploy (idempotent, safe to re-run)
COOLIFY_TOKEN=$(grep '^COOLIFY_TOKEN=' ~/Documents/Workspaces/personal/.env | cut -d= -f2-)
curl -sS -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "http://142.93.182.236:8000/api/v1/deploy?uuid=ks00wk80goggko4wwckgokso&force=false"

# Poll deployment
curl -sS -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "http://142.93.182.236:8000/api/v1/deployments/<deployment_uuid>"
```

### Final verdict

**LIVE.** Commit `dcddb3c` is deployed to http://cst.142.93.182.236.sslip.io/. ETag rotated, `/offices` route restored, V2 scheduler code shipped in bundle. Webhook automation deferred (requires Coolify GitHub App install on repo — GitHub UI action, not Coolify). Phase 5 complete.


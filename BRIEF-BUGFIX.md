# Schedule Template Designer — Bug Fix Sprint
## Fix All Runtime Issues: Office Creation, Provider Addition, Data Persistence

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Context

The app is deployed on VPS with persistent volume and migrations running on startup.
However, users report these critical issues:
1. Cannot create a new office (fails silently or with error)
2. Cannot add a second provider to an office
3. Historical data lost between deploys (NOW FIXED — persistent volume mounted)

The migration infrastructure is now working — 9 migrations applied, all tables exist.
The issues are APPLICATION-LEVEL bugs, not infrastructure.

---

## Bug 1: Office Creation Fails

**Error:** `(t.workingDays || []).map is not a function`

The `workingDays` field is being sent as a comma-separated string from the form
but the API handler expects an array.

**Fix:** In the API route `src/app/api/offices/route.ts` (POST handler):
- Accept `workingDays` as either a string (comma-separated) or an array
- Normalize: `const days = Array.isArray(workingDays) ? workingDays : workingDays.split(',')`
- Also check the form component (`src/app/offices/new/page.tsx` or similar) — ensure it sends an array

**Verify:** Create an office via the UI. Check it appears in the office list.

---

## Bug 2: Cannot Add Second Provider

**Investigation needed:** Try to reproduce by:
1. Create an office (after fixing Bug 1)
2. Add one provider — should succeed
3. Add a second provider — identify the error

Possible causes:
- Provider creation API might have a unique constraint that's too strict
- The provider form might not reset after the first provider is added
- The provider list refresh might not work after creation

**Fix whatever the actual cause is.** Add a test that creates 2 providers for the same office.

---

## Bug 3: Data Integrity Check

**Verify the data access layer works correctly for all CRUD operations:**
1. Create office → verify it's persisted (refresh page, still there)
2. Add provider → verify persisted
3. Add block types → verify persisted
4. Generate schedule → verify persisted
5. Save schedule → verify persisted
6. Delete provider → verify removed
7. Edit office → verify changes saved

For any operation that fails, fix the root cause.

---

## Bug 4: Sprint 17 Partial Work Cleanup

Sprint 17 (doctor flow, stagger optimizer, etc.) was partially committed.
Check if there are any broken imports, missing files, or compilation errors
from the partial sprint 17 work that was interrupted.

Run `npx tsc --noEmit` and fix ALL TypeScript errors.
Run `npm run build` (Next.js build) and fix ALL build errors.

---

## Bug 5: General Code Audit

Run `npm test` and report:
- Total tests passing
- Any failing tests — fix them
- Any tests that were broken by recent changes

---

## Deliverables
1. All 5 bug categories fixed
2. `npm test` — all tests pass
3. `npm run build` — builds clean
4. Committed and pushed to GitHub
5. Brief summary of what was wrong and what was fixed

## Push
```bash
FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
git push origin main
```

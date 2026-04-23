#!/usr/bin/env bash
# Mirror tools/cst-designer/ from scott4885/personal (monorepo) to
# scott4885/cst-designer (standalone) — the repo Coolify watches.
#
# Why this exists: the two repos have fully-divergent SHA histories (no
# subtree linkage), so every deploy pass repeats the same clone-overwrite
# pattern. Phases 5–8 each reimplemented it by hand; this script is the
# single source of truth going forward. See phase-8-smoke-report.md
# "Mirror sync is fragile" finding.
#
# Usage:
#   scripts/mirror-to-standalone.sh                    # mirror HEAD, no rebuild
#   scripts/mirror-to-standalone.sh --rebuild          # mirror + trigger Coolify
#   scripts/mirror-to-standalone.sh -m "custom msg"    # override commit subject
#   scripts/mirror-to-standalone.sh --dry-run          # stage + diff, don't push
#
# Prerequisites:
#   - Run from anywhere; script resolves its own repo root.
#   - Monorepo HEAD must be pushed to origin/master (no unpushed commits).
#   - Monorepo working tree must be clean (no dirty tracked files).
#   - `gh` authenticated OR HTTPS clone works without creds.
#   - COOLIFY_TOKEN in ../../../.env (personal/.env) if --rebuild passed.
#
# Exit codes: 0 success, 1 preflight failed, 2 push failed, 3 rebuild failed.

set -euo pipefail

# -------- locate repo --------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CST_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MONOREPO_ROOT="$(cd "$CST_ROOT/../.." && pwd)"
STANDALONE_REPO="https://github.com/scott4885/cst-designer.git"
STANDALONE_BRANCH="main"
COOLIFY_HOST="http://142.93.182.236:8000"
COOLIFY_APP_UUID="ks00wk80goggko4wwckgokso"
LIVE_URL="http://cst.142.93.182.236.sslip.io"

# -------- parse args --------
REBUILD=0
DRY_RUN=0
COMMIT_MSG_OVERRIDE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebuild) REBUILD=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -m|--message) COMMIT_MSG_OVERRIDE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

log() { echo "[mirror] $*"; }
die() { echo "[mirror] ERROR: $*" >&2; exit "${2:-1}"; }

# -------- preflight --------
log "monorepo: $MONOREPO_ROOT"
log "cst root: $CST_ROOT"

cd "$MONOREPO_ROOT"
# Only scope preflight to tools/cst-designer/ — the rest of the monorepo
# (obsidian-vault, projects/, mi6-v2 submodule, etc.) is irrelevant to the
# mirror. Any modification to a TRACKED file under tools/cst-designer/ would
# be mirrored in a stale (pre-commit) state, so we block on that. Untracked
# files there are fine: git ls-files only lists tracked paths.
DIRTY_CST=$(git status --porcelain -- tools/cst-designer/ | grep -E '^ ?[MADRC]' || true)
if [[ -n "$DIRTY_CST" ]]; then
  echo "$DIRTY_CST" >&2
  die "tools/cst-designer/ has uncommitted changes to tracked files" 1
fi

HEAD_SHA=$(git rev-parse HEAD)
HEAD_SUBJECT=$(git log -1 --pretty=%s)
log "HEAD: $HEAD_SHA ($HEAD_SUBJECT)"

# confirm HEAD is pushed
if ! git merge-base --is-ancestor "$HEAD_SHA" "origin/master" 2>/dev/null; then
  die "HEAD is not on origin/master — push monorepo first" 1
fi

COMMIT_SUBJECT="${COMMIT_MSG_OVERRIDE:-sync from monorepo: $HEAD_SUBJECT}"
log "commit subject: $COMMIT_SUBJECT"

# -------- clone standalone --------
WORKDIR=$(mktemp -d -t cst-mirror-XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT
log "workdir: $WORKDIR"

cd "$WORKDIR"
log "cloning $STANDALONE_REPO ($STANDALONE_BRANCH)..."
# -c core.autocrlf=false keeps line endings as-committed; without this the
# clone would rewrite LF→CRLF on Windows and every file would look "changed"
git -c core.autocrlf=false clone --depth 1 --branch "$STANDALONE_BRANCH" \
  "$STANDALONE_REPO" standalone >/dev/null 2>&1 \
  || die "clone failed" 1

STANDALONE="$WORKDIR/standalone"
STANDALONE_HEAD=$(cd "$STANDALONE" && git rev-parse HEAD)
log "standalone pre-sync HEAD: $STANDALONE_HEAD"

# preserve .git; wipe everything else
log "wiping standalone working tree (preserving .git/)..."
cd "$STANDALONE"
find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +

# -------- copy monorepo cst-designer files into standalone --------
# Use `git archive` to export the canonical committed bytes of HEAD. This is
# essential on Windows where working-tree files are CRLF but committed files
# are LF — cp would copy the CRLF and produce a 270-file phantom diff against
# the LF-committed standalone. `git archive` gives us exactly what the server
# stored, line endings and all.
log "exporting tools/cst-designer/ from monorepo HEAD (git archive)..."
ARCHIVE="$WORKDIR/cst.tar"
(
  cd "$MONOREPO_ROOT"
  git archive --format=tar --prefix="" "$HEAD_SHA" -- tools/cst-designer > "$ARCHIVE"
)
log "  archive bytes: $(wc -c < "$ARCHIVE")"

# Extract into standalone, stripping the tools/cst-designer/ prefix so paths
# land at the standalone root.
log "extracting into standalone..."
tar -xf "$ARCHIVE" -C "$STANDALONE" --strip-components=2

[[ -f "$STANDALONE/.gitignore" ]] || die "mirror missing .gitignore — archive malformed" 1

# Normalize line endings: the monorepo has some (not all) files committed
# with CRLF from old Windows commits, while the standalone was re-committed
# with LF. Without this pass, `git add` in the clone sees every text file as
# wholly changed and produces a 490-file phantom diff.
#
# Git Bash grep defaults to text mode and strips CR before regex matching, so
# `grep -q $'\r'` never matches. The `-U` flag forces binary/untranslated
# mode; combined with `-I` (skip binary files) this gives us "text files that
# actually contain CR bytes". Then sed strips trailing CR.
log "normalizing CRLF → LF on text files..."
cd "$STANDALONE"
NORM_COUNT=0
while IFS= read -r -d '' f; do
  if grep -IUq $'\r' "$f" 2>/dev/null; then
    sed -i 's/\r$//' "$f" && NORM_COUNT=$((NORM_COUNT + 1))
  fi
done < <(find . -type f -not -path './.git/*' -print0)
log "  normalized $NORM_COUNT files"

# -------- stage + diff --------
cd "$STANDALONE"
# Suppress CRLF warnings — standalone clone uses autocrlf=false, and we
# stage the raw bytes we copied in.
git -c core.autocrlf=false -c core.safecrlf=false add -A 2>/dev/null
if git diff --cached --quiet; then
  log "no changes vs standalone $STANDALONE_HEAD — nothing to mirror"
  exit 0
fi

STAGED_COUNT=$(git diff --cached --name-only | wc -l)
log "staged $STAGED_COUNT files for commit"

if (( DRY_RUN )); then
  log "--dry-run: showing summary then exiting"
  git diff --cached --stat | tail -20
  exit 0
fi

# -------- commit + push --------
git -c user.name="Scott Guest" -c user.email="scott4885@gmail.com" \
  commit -m "$COMMIT_SUBJECT" \
          -m "Mirror sync from scott4885/personal monorepo commit $HEAD_SHA." \
          -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" \
  >/dev/null || die "commit failed" 2

NEW_SHA=$(git rev-parse HEAD)
log "committed $NEW_SHA on standalone"

log "pushing to origin/$STANDALONE_BRANCH..."
if ! git push origin "$STANDALONE_BRANCH" 2>&1 | tail -3; then
  die "push failed" 2
fi
log "push OK: $STANDALONE_HEAD..$NEW_SHA"

# -------- optional Coolify rebuild --------
if (( REBUILD )); then
  ENV_FILE="$MONOREPO_ROOT/.env"
  [[ -f "$ENV_FILE" ]] || die "COOLIFY_TOKEN not found — no $ENV_FILE" 3
  COOLIFY_TOKEN=$(grep '^COOLIFY_TOKEN=' "$ENV_FILE" | cut -d'=' -f2)
  [[ -n "$COOLIFY_TOKEN" ]] || die "COOLIFY_TOKEN empty in $ENV_FILE" 3

  log "triggering Coolify rebuild for app $COOLIFY_APP_UUID..."
  PRE_ETAG=$(curl -sI "$LIVE_URL/" | grep -i '^etag:' | sed 's/.*"\([^"]*\)".*/\1/' | tr -d '\r\n' || true)
  log "pre-deploy ETag: ${PRE_ETAG:-<none>}"

  DEPLOY_RESP=$(curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
    "$COOLIFY_HOST/api/v1/deploy?uuid=$COOLIFY_APP_UUID&force=false")
  echo "$DEPLOY_RESP" | head -3
  log "poll ETag rotation:"
  log "  prev=\"$PRE_ETAG\"; while true; do etag=\$(curl -sI $LIVE_URL/ | grep -i '^etag:' | sed 's/.*\"\\([^\"]*\\)\".*/\\1/' | tr -d '\\r\\n'); [ \"\$etag\" != \"\$prev\" ] && echo \"ROTATED: \$etag\" && break; sleep 20; done"
fi

log "done."

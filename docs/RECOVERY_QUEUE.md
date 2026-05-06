# Recovery Queue (May 5 2026)

The following commits exist in the local git reflog but are NOT in `origin/main`
due to Replit workspace reset events that occurred during today's session.

## Root Cause

Replit's infrastructure resets the workspace to its own deployment SHA after
certain publish events, discarding agent-authored commits that were not yet
pushed to GitHub `origin`. These commits are orphaned - they exist in the reflog
(90-day retention) but are not reachable from `main` or any named branch.

Reset events identified in reflog:
- `HEAD@{106}` + `{107}`: reset after Bug A commit - snapped back to `a81ab5cab5`
- `HEAD@{113}`: reset after leaderboard commit - snapped back to `c5debbe55b`

## Recovery Procedure

For each item:
1. Start from current `origin/main` HEAD
2. `git cherry-pick <sha>` (resolve conflicts if needed)
3. `git push origin main` IMMEDIATELY after cherry-pick
4. `git log --oneline origin/main | head -3` - verify it landed
5. Move to next item only after verification passes

**Do not batch cherry-picks. Push and verify each one individually.**

---

## Critical (recover first - production impact)

### Bug A — Portfolio Outlook: timeout + token limit + fallback helper
- **SHA:** `d3ca38b9bceb832141e1c17e1e2636d7571a7de8`
- **Reflog position:** `HEAD@{105}`
- **Files changed:** `server/portfolioIntelligenceService.ts`
- **Changes:**
  - Wraps Gemini call in `withTimeout(25_000)`
  - Raises `maxOutputTokens` from 2000 → 4096
  - Adds `buildPortfolioFallbackSnapshot` helper for graceful outer catch
- **User impact:** Large portfolios (~200+ cards) silently returning boilerplate
  fallback instead of real AI analysis. ~43% failure rate confirmed earlier today.
- **Note:** `portfolioIntelligenceService.ts` also has diagnostic logs added during
  investigation (timing log + raw response log). Check if those should be removed
  before or after cherry-pick.

---

## High (recover second - operational stability)

### Framework Piece 1 — Per-call Gemini timeout
- **SHA:** `6ac7cba22e96d9f9c18d7561930a3a74579b5361`
- **Reflog position:** `HEAD@{110}`
- **Files changed:** `server/jobs/handlers/cachedOutlookBackfill/core.ts`, possibly `server/lib/withTimeout.ts`
- **Changes:** `GEMINI_TIMEOUT_MS` constant, wrapped Gemini call in backfill job

### Framework Piece 2 + 2b — Checkpoint flush + failures cap + reaper logging
- **SHA:** `4d8f79544265c54bd8a34175c5d10243a8b49db1`
- **Reflog position:** `HEAD@{109}`
- **Files changed:** `server/jobs/handlers/cachedOutlookBackfill/core.ts`, `server/jobs/backgroundJobRunner.ts`
- **Changes:** `FAILURES_CAP=100`, `flushCheckpoint`, `failuresTruncated`, reaper checkpoint logging

### Framework Piece 3 — EADDRINUSE eviction + reusePort removal
- **SHA:** `a81ab5cab5f5003fa5ebe0f50a91b62327c50b77`
- **Reflog position:** `HEAD@{108}`
- **Files changed:** `server/index.ts`
- **Changes:** `evictStaleTenant` function, removes `reusePort: true`
- **Note:** This is the "Published your App" SHA that Replit reset back TO after
  Bug A. It may already contain the Piece 3 changes. Verify with
  `git show a81ab5cab5 -- server/index.ts | grep -E 'evictStaleTenant|reusePort'`
  before cherry-picking.

---

## Medium (recover after critical/high)

### Leaderboard Parity — Alpha-feed defensive filters
- **SHA:** `f53d0dccd128dbe90eafdeba81d837bb80c7a9bb`
- **Reflog position:** `HEAD@{112}`
- **Files changed:** `server/leaderboardEngine.ts`
- **Changes:** `PHASE_3_LAYERED_MODEL_DEPLOY_CUTOFF`, `isInsufficientDataModifier`,
  `blockingPlayerKeys` query filter
- **Conflict risk:** May interact with Queue E changes (prefetchPlayerTeam) that
  ARE in origin/main. Review diff carefully before applying.

---

## Low (assess before recovering - may be better to rebuild from scratch)

### Action 2 — Precedence documentation
- **SHA:** TBD (partial - `docs/ARCHITECTURE.md` IS in origin/main, but
  `replit.md` standing rule and `server/architect/outlookEngine.ts:2104`
  inline comments are missing)
- **Recommendation:** The replit.md standing rule is being added tonight separately.
  The inline comments at outlookEngine.ts:2104 can be re-added manually in a
  future session - lower risk than cherry-pick with potential conflicts.

### Action 1 — FLOOR_SHARE_UPPER_BOUND + verdict threshold playbook
- **SHA:** TBD
- **Files:** `server/measurementService.ts` (FLOOR_SHARE_UPPER_BOUND),
  `docs/VERDICT_THRESHOLD_TUNING_PLAYBOOK.md` (new file)
- **Recommendation:** Assess whether the threshold value is still correct given
  calibration work done since. May need redesign rather than recovery.

### Action 3 — AI refusal matcher + cacheWriteRejections
- **SHA:** TBD
- **Files:** `server/aiRefusalDetector.ts` (new), `server/adminQueueService.ts`,
  `server/errors.ts`, `shared/schema.ts` (cacheWriteRejections table)
- **Recommendation:** This was a significant new subsystem. Recovery needs careful
  conflict resolution and re-verification of the full feature. Consider rebuilding
  with current codebase rather than cherry-picking a stale commit.

---

## Items Confirmed in origin/main (do NOT need recovery)

| Item | SHA | Status |
|---|---|---|
| Standing rules commit | `9acdec2` | ✅ In origin/main |
| F2 CardOfDay shape guard | `576935c` | ✅ In origin/main |
| Queue E prefetchPlayerTeam | `9776300` | ✅ In origin/main |
| verdict.replace fix | `8eb8cd1` | ✅ In origin/main (track-record.tsx guard incomplete - minor) |
| ARCHITECTURE.md | exists | ✅ In origin/main |

## Known Diagnostic Artifacts to Clean Up

Before or during Bug A recovery, remove from `server/portfolioIntelligenceService.ts`:
- Timing log: `_t0_news` variable + `console.info('[PortfolioOutlook] fetchPlayerNews...')` (~line 773-776)
- Diagnostic log: `console.log('[PortfolioOutlook] Raw model response (first 500 chars):', content.substring(0, 500))` (~line 844)

These were added during investigation and should not ship to production.

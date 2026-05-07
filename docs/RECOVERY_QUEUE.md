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

---

## New Findings (May 5 2026 — Evening Session)

### Finding F1 — Card of the Day "View full outlook" link broken
- **Symptom:** Dashboard widget shows TreVeyon Henderson as Card of the Day. Clicking "View full outlook" leads to a "Player Not Found" page: "We don't have an outlook for this player yet."
- **Root cause hypothesis:** Routing/slug mismatch or data lookup divergence — Card of the Day generator picked the player, but the outlook page lookup can't resolve the same player.
- **Two systems disagree:** CardOfDay generator vs. outlook page player lookup.
- **Status:** Captured. Do not investigate until Bug A + Framework pieces are recovered.
- **Priority:** Medium — user-facing breakage but not silent data corruption.

### Finding F2 — Card of the Day showing "0% confidence" + boilerplate text
- **Symptom:** Same widget shows "0% confidence" with generic message "TreVeyon Henderson is showing interesting market activity."
- **Root cause hypothesis:** Same class of bug as Bug A — Gemini call for CardOfDay generation is failing silently and serving fallback shape as if real output.
- **Status:** Captured. Likely shares root cause with Bug A (timeout / token limit). May self-resolve after Bug A cherry-pick, or may need a separate fix in the CardOfDay generation path.
- **Priority:** Medium — directly related to Bug A class; assess after Bug A is confirmed working in production.

---

## New Findings (May 7 2026 — Rebrand Recovery Session)

### Finding F3 — Unsubscribe module stubbed in `server/email.ts`
- **Symptom:** Rebrand cherry-pick `00d674d` ("Carry the new HobbyAlpha brand into every outbound email") added `import { buildListUnsubscribeHeaders, buildUnsubscribeFooterHtml, buildUnsubscribeFooterText } from "./unsubscribe"` to `server/email.ts`. The `server/unsubscribe.ts` module does NOT exist on `origin/main` — it was authored on subrepl branches (Task #43, Task #55) that never merged.
- **Resolution applied (May 7):** Replaced the broken import with three local stub functions in `server/email.ts` that return safe defaults:
  - `buildListUnsubscribeHeaders()` → `{}` (no `List-Unsubscribe` / `List-Unsubscribe-Post` headers)
  - `buildUnsubscribeFooterHtml()` → static HTML "manage preferences in account settings"
  - `buildUnsubscribeFooterText()` → static plain-text equivalent
- **Cost of stub:** Outbound digest / win-back / announcement emails ship without RFC 8058 one-click unsubscribe header and without HMAC-signed per-user opt-out tokens. Manual unsubscribe still works via account settings UI.
- **Why not the real module:** The real `unsubscribe.ts` (recoverable from subrepl branch `7ea53bd`) depends on two schema fields not on `main` (`winBackEmailsEnabled`, `announcementEmailsEnabled` on `users_alert_settings`). Adopting it would require a schema migration, which is locked off until V2 verdict migration ships.
- **Recovery plan:** After V2 verdict migration is shipped + validated in production:
  1. Cherry-pick / port `server/unsubscribe.ts` from subrepl branch `7ea53bd:server/unsubscribe.ts`
  2. Add the two missing schema columns + `db:push` migration
  3. Re-add the inbox worker + `scripts/honor-unsubscribe.ts` from the same branch
  4. Restore the original import line in `server/email.ts` (delete the stub block)
  5. Add deliverability/compliance tests
- **Priority:** Medium-High — CAN-SPAM / RFC 8058 compliance gap. Acceptable short-term because unsubscribe is still possible via in-app settings; not acceptable long-term.

---

## Commit 9 Scope — Card Outlook V2 Verdict Parity (Queued May 7 2026)

**Trigger:** V2 verdict migration shipped to player outlooks (Commit 8 / `c05dc3f`). Card outlooks run on a separate engine that was never updated, so card-level verdicts diverge from player-level verdicts (cards never return `LONGSHOT_BET`, `ACCUMULATE`, `HOLD_CORE`, `SPECULATIVE_FLYER`, etc).

### Files in scope
- `server/cardOutlookService.ts` (2,111 lines) — primary engine
- `server/outlookEngine.ts:3072` — duplicate `OutlookAction` type alias (decide: delete or keep)
- `shared/schema.ts:892–903` — `OUTLOOK_ACTIONS` registry + `OutlookAction` type alias
- `client/src/components/card-outlook-panel.tsx:119` — duplicate `OutlookAction` type literal (line 119) + `getActionColor`/`getActionIcon`/`getActionLabel`/`getStateDescription`/`getTimeContext`/`getConditionalTriggers` switches
- `client/src/components/card-detail-modal.tsx:55,75` — `cardOutlookAction` prop + `bucketVerdict()` mapping
- `client/src/components/VerdictDivergenceNote.tsx` (referenced from card-detail-modal:1248) — compares card verdict vs player verdict; needs to know about new shared values

### Logic to port from `playerOutlookEngine.ts` / `investmentDecisionEngine.ts`
1. **`isLongshotEligible(card)` gate** — currently lives only in player engine. Port mirror: `isCardLongshotEligible(card)` checking
   - `legacyTier ∈ {PROSPECT, RISING_STAR}` (cards' equivalent to player career stage)
   - card year ≤ `LONGSHOT_CUTOFFS[sport]` (rookie-window cutoff per sport)
   - `normalizePosition(card.position)` ∈ `SKILL_POSITIONS` for NFL/NBA/NHL (MLB exempt)
   - `marketValue ≥ $25` floor (avoid penny cards triggering longshot)
2. **`LONGSHOT_BET` override site** — insert in `determineAction()` between the LEGACY block (line 1261) and the standard BUY/SELL/MONITOR cascade (line 1264). Fires when:
   - `isCardLongshotEligible(card) === true`
   - `upsideScore ≥ 55` AND `riskScore ≥ 50` (high-upside / high-risk profile)
   - Skips when card already qualifies for clean BUY (upside ≥ 60, risk ≤ 50)
3. **Sport-key normalization** — replace ad-hoc lowercase coercion at line 539 with shared `normalizeSportName()` (already exported from `shared/schema.ts` per Commit 8).
4. **Position normalization** — adopt `normalizePosition()` + `POSITION_ALIASES` from `shared/schema.ts` for any position-based logic.

### Decision: `OutlookAction` enum vs canonical `InvestmentVerdict` union

**Recommendation: extend `OutlookAction`, do NOT collapse into `InvestmentVerdict`.**

Reasoning:
- `OutlookAction` carries card-specific semantics that don't exist for players: `LEGACY_HOLD` (vintage HOF cards), `LONG_HOLD` (modern retired/HOF), `LITTLE_VALUE` (sub-$10 / sub-30 upside floor). These are card-condition + card-age signals, not player-trajectory signals.
- `InvestmentVerdict` carries player-specific semantics that don't apply cleanly to a single card: `ACCUMULATE` vs `HOLD_CORE` is a portfolio-strategy distinction; `AVOID_NEW_MONEY` vs `AVOID_STRUCTURAL` is a player-risk distinction; `TRADE_THE_HYPE` is a player-hype-cycle distinction.
- Forcing one union into the other would either inflate `InvestmentVerdict` with vintage/value semantics that don't apply to active players, or strip `OutlookAction` of its archetype-aware verdicts.
- Cleaner contract: keep them as **two separate verdict surfaces**, share only the **shared subset** (BUY, MONITOR, SELL, LONGSHOT_BET) by reusing the same string literals and same color/icon/label palette. Frontend `bucketVerdict()` already does this collapse — extend that helper to handle LONGSHOT_BET on the card path.

**Concretely for Commit 9:**
```ts
// server/cardOutlookService.ts:12 + server/outlookEngine.ts:3072 + shared/schema.ts:892
export type OutlookAction =
  | "BUY"
  | "MONITOR"
  | "SELL"
  | "LONG_HOLD"
  | "LEGACY_HOLD"
  | "LITTLE_VALUE"
  | "LONGSHOT_BET";   // ← new, shared literal with InvestmentVerdict
```
- Delete the duplicate type literal at `client/src/components/card-outlook-panel.tsx:119` and import from `@shared/schema` instead — single source of truth.
- Delete the duplicate at `server/outlookEngine.ts:3072` — re-export from `shared/schema.ts`.

### UI surface area (must add `LONGSHOT_BET` case to each switch)
- `getActionColor()` — fuchsia (match player surface per Commit 3)
- `getActionIcon()` — `Sparkles` from lucide-react
- `getActionLabel()` — "Longshot Bet"
- `getStateDescription()` — "High-upside speculative card with rookie-window risk profile"
- `getTimeContext()` — "Multi-month conviction; revisit at season-end milestones"
- `getConditionalTriggers()` — sport-aware triggers (rookie season production, draft pedigree, scarcity tier)
- `bucketVerdict()` in card-detail-modal — map LONGSHOT_BET into the existing speculative bucket
- `VerdictDivergenceNote` — handle the case where card verdict and player verdict are both LONGSHOT_BET (no divergence) and the asymmetric cases (player LONGSHOT, card BUY → "card already proving out the bet")

### Estimated lines changed
- `server/cardOutlookService.ts`: ~80 lines added
  - `isCardLongshotEligible()` helper: ~30 lines
  - LONGSHOT_BET branch in `determineAction()`: ~10 lines
  - Sport/position normalization swap: ~15 lines
  - Type literal extension at line 12: ~1 line
  - Explanation generator branches (`generateExplanation`, `getStateDescription`, etc.): ~25 lines
- `shared/schema.ts`: ~5 lines (extend `OUTLOOK_ACTIONS` registry with LONGSHOT_BET entry)
- `server/outlookEngine.ts`: ~3 lines (delete duplicate type, re-export from schema)
- `client/src/components/card-outlook-panel.tsx`: ~40 lines (6 switches × ~6 lines each + import swap)
- `client/src/components/card-detail-modal.tsx`: ~5 lines (bucketVerdict extension)
- `client/src/components/VerdictDivergenceNote.tsx`: ~20 lines (asymmetric LONGSHOT cases)

**Total: ~150 lines, single PR. Low blast radius — additive new branch, no rewrites of existing logic.**

### Migration strategy
- **No DB migration needed.** Card verdicts are computed on-demand in `server/cardOutlookService.ts:451` and cached in `card_outlook_cache` (TTL-bounded). Once Commit 9 ships, stale cached entries will recompute on next access; force-recompute via existing `/api/admin/refresh-card-outlooks` if instant rollout is desired.
- **No `priceAtSignal` / accuracy-tracking changes.** Card outlooks don't feed verdict regression test (player-level only).

### Acceptance criteria
1. Sample of 20 LONGSHOT-eligible rookie cards (Caleb Williams Prizm, Wemby Prizm, Bowers Prizm, etc) returns `LONGSHOT_BET` from `determineAction()` when the player-level verdict is also LONGSHOT_BET.
2. Vintage HOF cards (Mantle, Jordan rookies) still return `LEGACY_HOLD` — LONGSHOT branch does not regress legacy detection.
3. Sub-$10 commons still return `LITTLE_VALUE` — LONGSHOT branch does not steal low-value cards.
4. Card outlook panel renders LONGSHOT_BET with fuchsia + Sparkles, matching player surface (visual parity check on `card-outlook-panel.tsx`).
5. `VerdictDivergenceNote` renders correct copy when card verdict ≠ player verdict and at least one side is LONGSHOT_BET.

### Priority
**Medium.** Card verdicts are visibly inconsistent with player verdicts on the same player's cards, but the existing card verdicts (BUY/MONITOR/SELL) are still directionally correct — cards don't surface broken or harmful recommendations, just less granular ones than players. Schedule after V2 prod migration completes + bakes for 48h.

---

## Post-V2 Hygiene Items (queued during May 7 prod backfill)

Logged during the Phase 1 `cards.legacy_tier` prod backfill dry-run review. None
block the V2 player migration; address after V2 bakes.

### Registry data corrections
- **Eli Manning**: registry has him as `VETERAN`. He's retired and Pro Football
  HoF eligible 2027. After eligibility (or sooner if voted in early), bump to
  `RETIRED_HOF`. The Phase 1 backfill currently preserves the existing legacy
  `HOF` tier on his cards via the no-downgrade rule, so card-level data is
  correct; only the registry stage lags.
- **Aaron Rodgers**: registry has him as `VETERAN`. After his retirement
  announcement, update to `RETIRED` (and to `RETIRED_HOF` once eligible
  ~2031). Same situation as Eli — no card-level urgency, only registry lag.

### Registry expansion opportunities (198 unmatched players in prod backfill)
The Phase 1 backfill couldn't attribute legacy_tier to 198 cards (150 unique
player names). These cards retain their existing legacy_tier (or stay NULL).
Categories:
- **Retired NBA role players** (late-90s Jazz era + others): Bryon Russell,
  Felton Spencer, Eric Leckner, Carlos Boozer, Deron Williams, Donyell
  Marshall, Darrell Griffith, Gail Goodrich, Adrian Dantley, Andrei Kirilenko,
  Bobby Hansen, Bol Bol, Enes Kanter, Gordon Hayward, etc.
- **Prospects not yet in registry**: Cedric Coward, Endrick, Gavin McKenna,
  Brandon Handlogten, Braylon Payne, Brice Sensabaugh, Cody Williams, Dylan
  Sampson, Eddie Lacy, Elijah Arroyo, Emeka Egbuka, Jaxson Dart (in registry
  but some variants miss), etc.
- **Other sports retired**: Bob Griese, Brad Johnson, Doug Williams, Eppa
  Rixey, Fernando Torres, Ben Rice.
- **Retired QBs**: Aaron Rodger (typo, missing 's'), Brad Johnson, Doug Williams.

### Card data hygiene
- **"Aaron Rodger"** typo (missing 's') on at least one card — single-card fix.
- **Multi-name strings** in `playerName` column ("Bryce Underwood / Tavien St.
  Clair", "Connor Bedard / Adam Fantilli", "Curry/James/Durant"). Schema
  doesn't model dual-/multi-subject cards. Future enhancement — consider a
  `secondaryPlayers: text[]` column or a separate junction table.

### Security follow-up
- **Rotate Neon database password** after Phase 1 prod backfill + V2 player
  migration both complete. Password was pasted into agent chat during the May
  7 session for the one-shot prod backfill run; rotate via Neon console (or
  Replit deployment secret rotation flow) once we no longer need shell access
  to the prod DB.

## Post-V2 Hygiene — Phase 2b Additions (2026-05-07)

- **Consolidate playerKey normalization formats** — 4 inconsistent variants exist in codebase:
  - `playerOutlookEngine.normalizePlayerKey(sport, name)` — canonical (used by writer + Phase 2b lookup)
  - `hiddenGemsService.normalizePlayerKey(name, sport)` — arg-order swapped
  - `routes.ts:5443` + `demandTierEngine.ts:207` inline strip-non-alphanum
  - `routes.ts:5784` inline underscore-join (different format entirely)
  Action: replace all callsites with canonical export; verify no key-format mismatches in cache lookups.

- **Add TRIM to card verdict enum (Phase 2c)** — current 10-value enum lacks "trim partial position" verdict; required for audience differentiation work where holder sees TRIM but buyer sees AVOID.

- **Audience differentiation work (Phase 2c)** — split TRADE_THE_HYPE / SPECULATIVE_FLYER / HOLD_INJURY_CONTINGENT into buyer vs holder card actions. Today all three audiences see MONITOR (or HOLD for INJURED guardrail) with no differentiation. Buyer-side INJURED should be MONITOR/AVOID, holder-side should be HOLD.

- **Cosmetic: hardcoded "139" cache count in admin.tsx** — replace with live count from new `/api/admin/player-cache/count` endpoint (3 sites: lines 3400, 3418, 3438; plus routes.ts:12851 backend message).

- **Migration state durability** — current V2 migration job state is in-process memory. If the prod server restarts mid-job, the resumable in-memory state is lost (DB rows are written incrementally so technically restartable from "max history.snapshot_at after migration trigger", but no UI surfaces this and no auto-resume logic exists). Add DB-backed checkpoint table + auto-resume on server boot.

- **`server/cardOutlookService.ts` has parallel stale OutlookAction type (Phase 2c blocker)** — defines its OWN local `OutlookAction = "BUY" | "MONITOR" | "SELL" | "LONG_HOLD" | "LEGACY_HOLD" | "LITTLE_VALUE"` (line 12) used by display/explanation helpers (`generateFallbackShort`, `generateFallbackLong`, `validateLegacyExplanation`, `determineAction`). Currently graceful-degrades for the 4 new Phase 2b verdicts (HOLD/AVOID/LONGSHOT_BET/WATCH) — falls through to neutral default text, no runtime crash. Phase 2c needs to: (a) align type with outlookEngine's 10-value union, (b) add per-verdict fallback copy for HOLD/AVOID/LONGSHOT_BET/WATCH, (c) audit `determineAction` in this file (parallel verdict computation path used by hiddenGemsService) to decide whether it should also adopt the player-fallback tier flow or remain a separate score-based heuristic.

- **Card-add flow hygiene (post-V2 priority)** — Card add flow lacks validation/normalization at the entry point; bad data flows through the entire pipeline (storage → analysis → migration → backfill). Issues observed: (1) card numbers ending up in `player_name` field (Josh Allen #304 case — manually cleaned in dev backfill, prod backfill regex handles future cases); (2) sport field requires manual fill on add (should auto-detect from set/year/player or default smarter); (3) name normalization inconsistent on entry; (4) multi-name strings ("Bryce Underwood / Tavien St. Clair") not handled by single-card schema; (5) single-name entries ("James") trigger expensive disambiguation cascades during analysis; (6) quoted nicknames (`Austin "Jay-Jay" Okocha`) break parsing; (7) typos that don't match registry ("Aaron Rodger" missing 's', "Lauri Markkanan" wrong). **Proposed scope (post-V2):** card-add form auto-detects sport from set/year/player with sensible default fallback; separate `card_number` input from `player_name` input (with validation that strips trailing `#N` from typed name); typeahead from `player_registry` to prevent typos; handle multi-subject cards explicitly (dual-subject schema or block at entry); bulk card import gets same validations + preview before commit; cleanup script scans production cards for dirty patterns and surfaces for manual or automated cleanup. **Estimated effort:** 1-2 days focused work, mostly UI + validation logic. **Priority:** after V2 fully ships (Phase 2c audience differentiation), before next major feature work.

- **Big Movers tag never populates (post-V2 priority)** — `bigMoverFlag` and `bigMoverReason` are computed in `outlookEngine.ts:computeAllSignals` as part of the signals object; UI presumably surfaces these somewhere. User reports never seeing the tag actually populate in production. **Two failure modes possible:** (1) backend never produces `bigMoverFlag = true` (computation criteria too strict, never triggers); (2) backend produces it correctly but UI doesn't render it (broken rendering path). **Investigation needed:** find where `bigMoverFlag`/`bigMoverReason` are computed and what criteria trigger "true"; SQL query against prod `card_outlooks` to see if any cards have ever had `bigMoverFlag = true`; find UI rendering path — which component(s) display the Big Movers tag; test end-to-end by triggering a card analysis on a card that should be a "big mover" (recent price spike, high momentum) and verify the flag fires + renders. If criteria too strict → tune thresholds based on actual market data. If UI broken → fix rendering path. If both → fix both. **Estimated effort:** 1-2 hours investigation, then scope-dependent fix. **Priority:** after V2 fully ships and card-add hygiene work.

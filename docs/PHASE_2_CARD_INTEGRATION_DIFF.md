# Phase 2 — Card-Level Integration: Proposed Diff

> **Status**: design surfaced for review per user directive ("Surface the integration diff for review before merging"). No code edits to `cardOutlookService.ts` or `transformToAdvisorOutlook.ts` are committed yet — this document IS the review surface.
> **Companion plan**: `.local/tasks/verdict-engine-pricestate-awareness.md` Phase 2 (Steps 4 / 5 / 6).
> **Phase 1 module**: `server/verdictConfidencePolicy.ts` (40/40 tests).

---

## Phase 2 scope (verbatim from task plan)

> ### Phase 2 — card-level integration
> 4. Wire `priceStateMultiplier` + `clampVerdictTierByPriceState` into `calculateTCGConfidence` and the verdict-assignment site in `cardOutlookService.ts`.
> 5. Add thesis caveat injection in `generateEditorialFallbackLong` and the AI-explanation path (~L:1513-1525 of `cardOutlookService.ts`).
> 6. Update `client/src/lib/transformToAdvisorOutlook.ts` to plumb caveat field through to UI.

---

## Pre-flight findings that shape the diff

### Finding A — Cards table carries `priceState` (verified)

`shared/schema.ts:238` — `priceState: varchar("price_state", { length: 32 }).default("pending").notNull()` plus index at `:258`. Card objects flowing into `cardOutlookService.ts` will have `card.priceState` populated. **No schema work required for Phase 2.**

### Finding B — Type-enum mismatch between policy module and card-level engine

The policy module's `clampVerdictTierByPriceState` is typed against `InvestmentVerdict`:

```ts
type InvestmentVerdict =
  | "ACCUMULATE"
  | "HOLD_CORE"
  | "TRADE_THE_HYPE"
  | "HOLD_ROLE_RISK"
  | "HOLD_INJURY_CONTINGENT"
  | "SPECULATIVE_FLYER"
  | "SPECULATIVE_SUPPRESSED"
  | "AVOID_NEW_MONEY"
  | "AVOID_STRUCTURAL";
```

The card-level engine emits `OutlookAction`:

```ts
type OutlookAction =
  | "BUY"
  | "MONITOR"
  | "SELL"
  | "LONG_HOLD"
  | "LEGACY_HOLD"
  | "LITTLE_VALUE";
```

**These are different enums.** Phase 2 must reconcile them. Three options:

- **(a) Generalize the clamp** — overload `clampVerdictTierByPriceState` to accept either enum. Couples the two engines unnecessarily.
- **(b) Add a card-specific clamp** — `clampCardActionByPriceState(action: OutlookAction, priceState): OutlookAction` exported from `verdictConfidencePolicy.ts`, sharing the same internal ceiling table.
- **(c) Adapter-only in cardOutlookService** — map OutlookAction → InvestmentVerdict → call existing clamp → map back. Drift risk: the mapping table lives outside the policy module.

**Recommendation: option (b).** Keeps card / player engines decoupled at the call site, keeps both ceilings in one tunable file, and avoids leaking the InvestmentVerdict enum into card territory.

Proposed mapping table (lives inside the policy module, so it's tunable in one place):

| Card OutlookAction | Conviction rank (mirrors player) | Notes |
| --- | --- | --- |
| BUY | 4 (≈ ACCUMULATE) | Highest conviction — clamp candidate |
| LONG_HOLD | 3 (≈ HOLD_CORE) | Hold conviction; clamp candidate at low priceState |
| LEGACY_HOLD | (exempt) | Authoritative per existing comment at `cardOutlookService.ts:1247` ("Once classified as LEGACY, this is AUTHORITATIVE - never falls back"). The clamp must NOT touch LEGACY_HOLD. |
| MONITOR | 2 | Mid-conviction default |
| SELL | 0 | Bearish — pass-through (clamp only DEMOTES; SELL is already at the floor) |
| LITTLE_VALUE | (exempt) | Already a floor state; no clamp |

Demotion ladder under `baseline_estimate` (ceiling rank 2): BUY → MONITOR, LONG_HOLD → MONITOR. Under `needs_review` (ceiling 1): BUY → SELL? No — SELL is bearish, that flips polarity. Better demotion ladder: BUY → MONITOR → (no further down, since LONG_HOLD is also rank 3). For ceilings ≤ 1 with no rank-1/0 *bullish* card-level option, the resulting clamp lands at MONITOR, which is the correct conservative posture.

---

### Finding C — Two confidence-calculation sites, not one

The task plan names `calculateTCGConfidence` (TCG cards). For sports cards, the parallel path is `generateCardOutlook` → `confidenceScore` is computed inline (see `cardOutlookService.ts:1909+`). Phase 2 should wire the multiplier into BOTH paths so that a baseline-estimate sports card and a baseline-estimate TCG card both get correctly damped confidence — otherwise the sports-card path silently retains full confidence against a baseline price.

**Proposed scope expansion (reviewer please confirm)**: extend Step 4 to wire the multiplier into both confidence paths. This is consistent with the spirit of the task (both engines should be priceState-aware) and adds <10 lines of code. If the reviewer prefers strict scope, we can cap to TCG only and ticket sports-card wiring as Phase 2.5.

---

## Proposed diff — Step 4 (wire multiplier + clamp)

### 4a — `server/verdictConfidencePolicy.ts` (additive export)

```diff
+ /**
+  * Card-level OutlookAction tiers ranked by conviction. Mirrors
+  * INVESTMENT_VERDICT_RANK for the card-level engine. LEGACY_HOLD and
+  * LITTLE_VALUE are exempt from the clamp (LEGACY is authoritative;
+  * LITTLE_VALUE is a price floor, not a conviction signal).
+  */
+ const CARD_ACTION_RANK: Record<OutlookAction, number> = {
+   BUY: 4,
+   LONG_HOLD: 3,
+   MONITOR: 2,
+   SELL: 0,
+   LEGACY_HOLD: -1,    // sentinel: exempt
+   LITTLE_VALUE: -1,   // sentinel: exempt
+ };
+
+ const CARD_ACTION_BY_RANK: Record<number, OutlookAction> = {
+   4: "BUY",
+   3: "LONG_HOLD",
+   2: "MONITOR",
+   0: "SELL",
+ };
+
+ export function clampCardActionByPriceState(
+   rawAction: OutlookAction,
+   priceState: PriceState,
+ ): OutlookAction {
+   const rawRank = CARD_ACTION_RANK[rawAction];
+   if (rawRank < 0) return rawAction;          // exempt: LEGACY_HOLD / LITTLE_VALUE
+   const ceiling = PRICE_STATE_TIER_CEILING[priceState];
+   if (rawRank <= ceiling) return rawAction;
+   // Demote down to the highest bullish/neutral tier permitted.
+   // Floor at MONITOR for bullish actions to avoid polarity flips
+   // (a clamped BUY should not become SELL).
+   const target = Math.max(ceiling, 2);
+   return CARD_ACTION_BY_RANK[target] ?? "MONITOR";
+ }
```

The `OutlookAction` type would be re-exported from `cardOutlookService.ts` or moved to `shared/schema.ts` to avoid a circular import. Reviewer preference?

### 4b — `server/cardOutlookService.ts:420-444` — `calculateTCGConfidence`

```diff
- function calculateTCGConfidence(card: Card): number {
+ function calculateTCGConfidence(card: Card): number {
    // ... existing computation ...
    return clamp(Math.round(confidence), 20, 95);
  }
+
+ /**
+  * Apply priceState confidence damping. A card priced via
+  * `baseline_estimate` retains 40% of its raw confidence;
+  * `triangulated` retains 85%; `direct_comps_found` retains 100%.
+  * Pure pass-through if the card lacks a priceState (defensive).
+  */
+ function applyPriceStateMultiplier(rawConfidence: number, card: Card): number {
+   const ps = (card.priceState ?? "pending") as PriceState;
+   const damped = rawConfidence * priceStateMultiplier(ps);
+   return clamp(Math.round(damped), 0, 95);
+ }
```

Then at every site that returns a confidence number, post-process:

```diff
  const confidenceScore = calculateTCGConfidence(card);
+ const dampedConfidence = applyPriceStateMultiplier(confidenceScore, card);
- // ... use confidenceScore downstream ...
+ // ... use dampedConfidence downstream ...
```

**Sites to update** (rg results from `cardOutlookService.ts`):
- `:450` — `generateTCGOutlook` confidence
- `:1910+` — `generateCardOutlook` (sports-card path, per Finding C — pending reviewer confirmation)
- `:2052` — `generateQuickOutlook`
- `:2108` — quick-outlook variant

### 4c — Verdict-assignment site (`determineAction` callers, `cardOutlookService.ts:451 / :1977 / :2108`)

```diff
  const action = determineAction(upsideScore, riskScore, card);
+ const priceState = (card.priceState ?? "pending") as PriceState;
+ const clampedAction = clampCardActionByPriceState(action, priceState);
- // ... use action downstream ...
+ // ... use clampedAction downstream ...
```

**Important**: clamp AFTER `determineAction`'s LEGACY_HOLD / LITTLE_VALUE special-case logic runs. Since those are exempt in `CARD_ACTION_RANK`, the clamp is a no-op for them — but the policy module's exemption is the safety net, not the primary guarantee.

---

## Proposed diff — Step 5 (caveat injection)

### 5a — `cardOutlookService.ts:1517-1520` (AI-explanation return path)

The existing return:

```ts
return {
  short: aiExplanation.short || generateEditorialFallbackShort(...),
  long:  aiExplanation.long  || generateEditorialFallbackLong(...),
};
```

Becomes:

```diff
+ const ps = (card.priceState ?? "pending") as PriceState;
+ const needsCaveat = caveatNeededForPriceState(ps);
+ const priceCaveat = needsCaveat
+   ? buildPriceStateCaveat(ps)  // new helper, see 5c
+   : "";
  return {
-   short: aiExplanation.short || generateEditorialFallbackShort(...),
-   long:  aiExplanation.long  || generateEditorialFallbackLong(...),
+   short: aiExplanation.short || generateEditorialFallbackShort(...),
+   long:  appendCaveat(aiExplanation.long || generateEditorialFallbackLong(...), priceCaveat),
  };
```

Same treatment for the LEGACY_HOLD validation-failure return at L:1511-1514.

### 5b — `generateEditorialFallbackLong` (similar inline injection)

The fallback generator should also append the caveat when `caveatNeededForPriceState(card.priceState)` returns true. Single shared helper avoids drift.

### 5c — New helper `buildPriceStateCaveat(state: PriceState): string`

Lives in `cardOutlookService.ts` (or a new `server/cardOutlookCaveats.ts` if reviewer prefers separation). Per-state copy that follows the product axiom (no "insufficient", "no data", "cannot determine"):

| PriceState | Caveat copy |
| --- | --- |
| direct_comps_found / triangulated | (no caveat — passes `caveatNeededForPriceState` filter) |
| legacy_estimate | "Confidence is moderated — pricing reflects a legacy estimate; refresh comps for a more grounded read." |
| pending | "Confidence is moderated — pricing is awaiting a fresh comp pull." |
| awaiting_triangulation_consent | "Confidence is moderated — full triangulation is gated on a Pro upgrade; baseline read in use." |
| baseline_estimate | "Confidence is moderated — pricing rests on a baseline estimate; verdict tier capped at MONITOR until comp data validates." |
| needs_review | "Confidence is moderated — recent pricing failed validation; the prior value is in use pending manual review." |
| paywalled | "Pricing for this card requires a Pro account — verdict shown is the baseline read available without comp triangulation." |
| insufficient_data | "Confidence is low — limited recent sales for this exact card variant; baseline estimate pending." |

All copy reviewed against the axiom string list; no banned phrases. Reviewer should sanity-check the tone (current draft errs on the side of explaining the *why* of the moderation rather than apologizing for it).

---

## Proposed diff — Step 6 (UI plumbing)

### 6a — `client/src/lib/transformToAdvisorOutlook.ts` — caveat field already exists

Existing usage at `:574, :622, :735, :763` shows the `caveat:` field is already part of the `AdvisorOutlook` shape and rendered. **No new field is needed.** Phase 2 just needs to populate it from the card-level `priceCaveat` rather than leaving it unset on the card-derived advisor outlook path.

Concrete change: at the card-→-advisor transform site (need to grep for the exact line; this doc's design covers the pattern, the edit is mechanical):

```diff
  return {
    ...rest,
-   caveat: rest.verdict === "AVOID" ? "No new money recommended at current levels." : undefined,
+   caveat: priceStateCaveat ?? (rest.verdict === "AVOID" ? "No new money recommended at current levels." : undefined),
  };
```

Where `priceStateCaveat` is read from the server-rendered card-outlook payload (added to `CardOutlookResult` as a new optional field `priceStateCaveat?: string`). Server populates it via `buildPriceStateCaveat`; client uses it as-provided.

**API change required**: add `priceStateCaveat?: string` to `CardOutlookResult` in `cardOutlookService.ts`. Backward-compatible (optional). No client-side schema change beyond reading the field.

---

## Test plan (Phase 2 + Phase 1 unit-test conventions)

1. **Unit tests for `clampCardActionByPriceState`** — one fixture per (action × priceState) cell. Assert exemptions (LEGACY_HOLD / LITTLE_VALUE) pass through; assert demotion ladder for baseline_estimate, needs_review.
2. **Unit test for `buildPriceStateCaveat`** — smoke-test all 9 PriceState values produce non-empty strings except `direct_comps_found` / `triangulated`. Assert no banned phrases via the axiom-violation regex.
3. **Integration test for `generateTCGOutlook`** — fixture: TCG card with `priceState = "baseline_estimate"`. Assert returned `confidenceScore` is round(raw × 0.4); assert `action` is clamped to MONITOR if raw was BUY; assert `priceStateCaveat` is populated.
4. **No-op test** — fixture: card with `priceState = "direct_comps_found"`. Assert all values pass through unchanged from pre-Phase-2 behavior. Guards against regression.

---

## Confirmed design decisions (was: open questions — answered post-review)

> Reviewer answers received and recorded here as the authoritative direction for Phase 2 implementation. Answers supersede any conflicting recommendation in the diff sections above; if drift between an answer and the diff snippet is noticed during implementation, the answer wins and the snippet should be amended.

### Decision 1 — Scope: BOTH confidence-calculation sites

**Direction**: Extend Step 4 to wire `priceStateMultiplier` into BOTH the TCG path (`calculateTCGConfidence`) AND the sports-card path (`generateCardOutlook` confidence inline computation). And extend `clampCardActionByPriceState` to the verdict-assignment site for both card categories.

**Rationale (per reviewer)**: "Shipping policy integration on TCG only and not on sports-card recreates the priceState drift class of bug we structurally prevented in #89. Same lesson, don't unlearn it."

**Implementation note**: the diff in Step 4b above already lists all sites (`:450`, `:1910+`, `:2052`, `:2108`); proceed against the full list, not a TCG subset.

### Decision 2 — Module placement: adapter at the consumer boundary

**Direction**: The OutlookAction↔InvestmentVerdict adapter (the `CARD_ACTION_RANK` table + `clampCardActionByPriceState` function) lives at the **consumer boundary** (in or near `cardOutlookService.ts`), NOT inside `verdictConfidencePolicy.ts`.

**Rationale (per reviewer)**: "Policy module stays consumer-agnostic. The adapter translates between policy's universal vocabulary (InvestmentVerdict) and card-level's specific vocabulary (OutlookAction)."

**Implementation revision to Step 4a above**: the proposed `clampCardActionByPriceState` export from `verdictConfidencePolicy.ts` is REJECTED. Instead, place the adapter in a new file `server/cardOutlookPriceStateAdapter.ts` (or inline at the top of `cardOutlookService.ts` — implementer's call, but it must NOT live in the policy module). The adapter calls into the policy module's `PRICE_STATE_TIER_CEILING` constant and any other primitives needed, but the OutlookAction enum vocabulary stays out of the policy module's typescript surface. This keeps the policy module reusable for any future consumer (player engine, analytics surfaces, hidden gems gating) without each consumer's enum leaking in.

### Decision 3 — Caveat copy tone: "Low-conviction read — X" pattern

**Direction**: Match the established axiom-compliant pattern from the user-facing string sweep. The unifying phrase is **"Low-conviction read — X"** where X explains the specific reason (limited recent sales, baseline estimate in use, etc.).

**Rationale (per reviewer)**: "Consistency across surfaces wins over perfect copy on each surface."

**Implementation revision to Step 5c table above**: rewrite the per-PriceState caveat copy to lead with "Low-conviction read —" prefix:

| PriceState | Caveat copy (revised per Decision 3) |
| --- | --- |
| direct_comps_found / triangulated | (no caveat — passes `caveatNeededForPriceState` filter) |
| legacy_estimate | "Low-conviction read — pricing reflects a legacy estimate; refresh comps for a more grounded read." |
| pending | "Low-conviction read — pricing is awaiting a fresh comp pull." |
| awaiting_triangulation_consent | "Low-conviction read — full triangulation requires a Pro upgrade; baseline read in use." |
| baseline_estimate | "Low-conviction read — pricing rests on a baseline estimate; verdict tier capped at MONITOR until comp data validates." |
| needs_review | "Low-conviction read — recent pricing failed validation; the prior value is in use pending manual review." |
| paywalled | "Low-conviction read — full pricing for this card requires a Pro account; baseline read in use." |
| insufficient_data | "Low-conviction read — limited recent sales for this exact card variant; baseline estimate pending." |

The unit test for `buildPriceStateCaveat` should additionally assert all non-empty outputs start with the literal prefix `"Low-conviction read —"` to enforce the consistency rule mechanically.

### Decision 4 — Helper file location: near consumer, not in policy

**Direction**: `applyPriceStateMultiplier` lives near `cardOutlookService.ts` (in the same file or a `server/cardOutlook*` neighbor), NOT in `verdictConfidencePolicy.ts`.

**Rationale (per reviewer)**: "Policy module stays pure and consumer-agnostic." Same principle as Decision 2: the policy module exports primitives (`priceStateMultiplier(state) → number`), the consumer composes them with consumer-specific shapes (Card type, OutlookAction enum, confidence-clamp range).

**Implementation revision to Step 4b above**: the proposed `applyPriceStateMultiplier(rawConfidence, card)` helper is correctly placed if added at the top of `cardOutlookService.ts` or in a `server/cardOutlookPriceStateAdapter.ts` neighbor. It must NOT be exported from `verdictConfidencePolicy.ts`.

### Decision 5 — Telemetry capture: YES, both event types

**Direction**: Capture telemetry for both multiplier-application events AND clamp-down events. Required, not optional.

**Rationale (per reviewer)**: Phase 5 telemetry needs to show "of N card decisions in last 7 days, M had multipliers applied, K were clamped." Without this, we can't tell if the integration is doing real work or quietly no-op'ing in production.

**Implementation revision to Step 4 (additive)**: at every call site that applies the multiplier or invokes the clamp, log a structured telemetry event capturing: `cardId`, `priceState`, `rawConfidence`, `dampedConfidence`, `rawAction`, `clampedAction`, `multiplierApplied: boolean` (true when damping changed the number), `clampApplied: boolean` (true when clamp changed the action), and `timestamp`. Land these in a new table `card_outlook_telemetry` or append to existing `card_signals` (implementer decides; the table name is not constraining as long as Phase 5 can slice the four counts). Schema migration is in scope for Phase 2 since the telemetry must be capturing data from day one — Phase 5's dashboard ships against the data this captures.

**Test addition**: integration test asserting that running `generateTCGOutlook` against a `baseline_estimate` fixture produces a telemetry event with `multiplierApplied: true` AND `clampApplied: true` (when raw action is BUY).

---

## Implementation sequencing (post-deploy-verification)

Once production deploy is verified against the four-point check, Phase 2 implementation proceeds in this order to keep each step independently testable and revertible:

1. **Schema migration** for `card_outlook_telemetry` (Decision 5 prerequisite). Standalone migration, no behavior change.
2. **Adapter file** `server/cardOutlookPriceStateAdapter.ts` (or inline at top of `cardOutlookService.ts`) with `clampCardActionByPriceState`, `applyPriceStateMultiplier`, `buildPriceStateCaveat`, `recordCardOutlookTelemetry` helpers. Plus their unit tests. No call sites wired yet — this commit is pure additive infrastructure.
3. **Wire call sites** in `cardOutlookService.ts` (all four sites per Decision 1) to use the helpers. Telemetry events fire from this commit.
4. **UI plumb** in `client/src/lib/transformToAdvisorOutlook.ts` for the `caveat:` field (Step 6). Adds `priceStateCaveat?` to `CardOutlookResult`.
5. **No-op regression test** asserting `direct_comps_found` cards are byte-identical to pre-Phase-2 behavior. Catches any accidental drift.

Each commit independently revertible. If Step 3's wiring causes a production issue, revert Step 3 only; the helper module from Step 2 stays available for re-wiring once the issue is fixed.

---

## Out of scope for Phase 2

- Player-level `playerOutlookEngine.ts:2117-2130` kill-switch replacement (Phase 3).
- Factual validation gate, mismatch test, evidence-note audit (Phase 4).
- Telemetry dashboard slicing + verdict-distribution chart (Phase 5).
- Re-grading historical card outlooks (existing rows stay).
- Hidden Gems gating (separate parked task).

---

## Estimated change footprint

- `server/verdictConfidencePolicy.ts`: +35 lines (one constant table, one function, one rank inverse table).
- `server/cardOutlookService.ts`: ~+25 lines (helper + 4-5 call sites).
- `client/src/lib/transformToAdvisorOutlook.ts`: ~+3 lines (one field plumbed).
- `shared/schema.ts`: 0 (priceState already present); possibly +1 line if `OutlookAction` moves here.
- Tests: +60 lines across two new test files.

**Total: ~125 lines of new code.** No deletions. Backward-compatible at the API boundary.

---

## Honest scope limit — what Phase 2 does NOT promise

Phase 2 makes verdicts **smarter about the data they have**. It does NOT make the data fresher. The architecture review (`docs/EVENT_PROPAGATION_ASSESSMENT.md`) established a 5-27 day floor on input freshness — there is no event-driven push pathway today, and Phase 2 does not introduce one.

**Acceptance criteria that Phase 2 IS designed to meet:**

- A card priced via `baseline_estimate` must produce a confidence number that reflects the price-state, not the raw character-tier-floor only.
- A card priced via `baseline_estimate` must NOT produce a `BUY` verdict; the clamp must demote to MONITOR (or LONG_HOLD where applicable).
- Every card-level outlook with a non-trivial low-confidence priceState must surface a per-state caveat that follows the product axiom (no "insufficient", "no data", "cannot determine").
- A card priced via `direct_comps_found` / `triangulated` must pass through unchanged from pre-Phase-2 behavior (regression no-op).
- The `caveat:` field on the advisor outlook must be populated from the new `priceStateCaveat` for card-derived advisor outlooks; existing player-derived caveat paths are untouched.
- Telemetry can slice hit-rate by priceState (Phase 5 prerequisite — Phase 2 makes the data available even though the slicing UI ships in Phase 5).

**Acceptance criteria that Phase 2 explicitly does NOT promise:**

- Real-time verdict response to news events. Verdicts will continue to lag inputs by 5-27d until Candidate Arc 1 (event-driven push pathway) is shipped.
- Improved freshness of underlying pricing or news data. Phase 2 reads what the existing pipelines produce; it does not change refresh cadence, polling intervals, or news ingestion.
- Distinguishing between event types (e.g. short-suspension vs. season-ending injury). That is Candidate Arc 2 territory.
- Explaining WHY a verdict moved. The caveat copy explains the price-confidence posture; it does not explain news-driven verdict transitions. Per-transition source attribution is Candidate Arc 3 territory.
- Re-grading historical verdict outcomes. Existing rows in `verdict_outcomes` stay; new rows get the new dimensions.

**Why this matters for review**: a perfectly-calibrated verdict engine running on stale input data is still wrong about events that just happened. Phase 2 ships honest calibration on the inputs we have; the user-visible improvement is in *consistency and explainability*, not in *event responsiveness*. If Phase 2 acceptance criteria implicitly promised event responsiveness, we'd over-claim to users and erode trust on the next high-profile event the verdict missed. The caveat copy in Step 5 (e.g. "Limited recent sales for this exact card variant — baseline estimate pending") is the user-facing reflection of this scope limit; it explains the price-confidence layer honestly without claiming the system can react to news it hasn't seen yet.

This caveat applies to the integration tests too: do NOT write a test that asserts "verdict moves within X minutes of a news event" — that's outside Phase 2's contract. Tests assert (priceState in → confidence/action/caveat out) deterministically.

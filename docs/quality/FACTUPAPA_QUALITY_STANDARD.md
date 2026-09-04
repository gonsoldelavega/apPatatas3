# Factupapa Quality Standard

This document turns “make Factupapa better” into a repeatable quality bar. It complements `AGENTS.md`; it does not replace safety or approval rules.

## Product outcome

Factupapa should feel like a focused native-style business tool: fast, calm, premium, obvious on mobile, trustworthy with financial data, and free of generic-admin clutter.

Working is necessary but not sufficient. A flow can be technically functional and still fail this standard because it is confusing, visually weak, hard to tap, inconsistent, fragile, or slow.

## Quality dimensions

### 1. Business correctness

- Totals, dates, numbering, stock and states are correct.
- Existing real workflows remain usable after visual changes.
- Legacy data and realistic edge cases do not break core screens.

### 2. Product UX

- Primary actions are discoverable without explanation.
- Frequent tasks minimize typing and repeated navigation.
- Forms reveal only what is useful at the right moment.
- Errors explain what happened and how to recover.
- Empty/loading states help the next action.
- Spanish microcopy is concise and consistent.

### 3. Visual quality

- Clear typography and spacing hierarchy.
- Components align to a coherent token/system language.
- Important amounts/status/actions are visually prioritized.
- No arbitrary font sizes, radii, shadows or accent colors proliferate without reason.
- Dense business data remains scannable.
- Light and dark themes both look intentional.

### 4. Mobile ergonomics

- Core tasks work at representative narrow widths around 375–430 CSS px.
- No important field/action is trapped below an inaccessible sheet or fixed layer.
- Primary touch controls should be comfortably sized (prefer roughly 44 CSS px where practical) and must meet applicable accessibility target-size rules.
- Safe areas, sticky regions and the software keyboard are handled deliberately.
- Horizontal scrolling is not required for ordinary business flows unless the content genuinely demands it.

### 5. Accessibility

Target WCAG 2.2 AA as a practical baseline for web accessibility.

- Semantic controls and accessible names.
- Visible, logical keyboard focus.
- Adequate contrast and non-color-only status communication.
- Dialogs and dynamic status changes are understandable to assistive technology.
- Pointer targets meet minimum size/spacing requirements.
- Reflow/zoom do not make core tasks impossible.

### 6. Reliability and data integrity

- Sync and merges are idempotent where possible.
- Duplicate creation is prevented rather than cleaned up later.
- Network failure is not silently treated as success.
- Draft/user-entered state is preserved through recoverable failures.

### 7. Architecture and maintainability

- Business rules remain in domain/state layers, not embedded in presentation code.
- Shared patterns become components/tokens/helpers rather than repeated patches.
- CSS does not accumulate specificity wars.
- Modified code is testable and understandable.

### 8. Performance

- Interactions feel immediate under normal data volumes.
- Avoid unnecessary full-view rebuilds, repeated network requests or expensive repeated calculations.
- Improvements should not add visible jank or loading flicker.

### 9. Security and privacy

- Authentication and authorization are not weakened for convenience.
- Secrets stay out of client code and the public repository.
- Business data is not unnecessarily exposed.
- External actions match explicit user intent.

## Severity model

| Severity | Meaning | Default action |
| --- | --- | --- |
| P0 | Data loss/corruption, security exposure, app unusable | Fix before other polish; do not deploy unsafe state |
| P1 | Core workflow broken or seriously degraded | Fix in the current authorized sweep |
| P2 | Material friction, accessibility, inconsistency, maintainability/performance weakness | Fix when high-confidence and in scope |
| P3 | Minor polish or optional enhancement | Apply when cheap/coherent; otherwise record separately |

## Evidence standard

A finding is valid when it has at least one concrete evidence source:

- reproducible browser behavior;
- screenshot/layout evidence;
- failing or missing test around a realistic path;
- runtime/build/log evidence;
- source-level defect with a concrete failure path;
- repeated inconsistency across components;
- clearly documented product-standard violation.

Avoid purely stylistic churn such as changing a value because a reviewer personally prefers another value.

## Exit criteria for a full quality sweep

A full authorized sweep can stop when:

1. no known P0/P1 finding remains unfixed without a genuine blocker;
2. high-confidence in-scope P2 findings are fixed or explicitly justified as deferred;
3. core mobile flows have been exercised after the final changes;
4. relevant light/dark and desktop/mobile surfaces have been checked when affected;
5. required automated checks pass;
6. production is verified after deployment when application code changed;
7. remaining items are clearly P3 ideas rather than unresolved defects.

Do not chase endless subjective perfection. Iterate until the defined quality bar is met, then stop.
# Factupapa Quality Team

These role cards define the specialist lenses used by the `factupapa-quality-sweep` skill.

They are not independent approval authorities. `AGENTS.md` remains canonical for autonomy, safety, validation, and completion.

## Team

1. `quality-lead.md` — orchestration, scope, triage, deduplication, completion.
2. `product-ux.md` — workflows, information architecture, friction, microcopy.
3. `visual-design.md` — hierarchy, spacing, typography, color, component polish.
4. `mobile-interaction-accessibility.md` — responsive behavior, touch, keyboard, focus, WCAG-oriented accessibility.
5. `business-functional-qa.md` — invoices, purchases, expenses, stock, numbering, business correctness.
6. `data-sync-integrations.md` — local/cloud state, Drive/Sheets/Gmail ingestion, sync and duplicate prevention.
7. `frontend-architecture-performance.md` — maintainability, boundaries, rendering and performance.
8. `security-privacy.md` — auth, secrets, exposure, external effects and least privilege.
9. `release-regression.md` — verification, browser smoke tests, regression checks, production evidence.

## Conflict order

When recommendations conflict, use this precedence:

`security/privacy > business/data correctness > accessibility/usability > product UX > performance/maintainability > visual polish`

Visual quality matters, but it must never win by breaking business semantics, accessibility, data integrity, or security.

## Shared finding format

Every specialist finding should use the same fields:

- ID
- Severity: P0 / P1 / P2 / P3
- Role owner
- Surface or flow
- Evidence
- User/business impact
- Root cause or likely cause
- Proposed fix
- Regression risk
- Verification method

Do not create duplicate findings for the same root cause. The Quality Lead consolidates them.
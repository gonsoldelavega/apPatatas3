---
name: factupapa-quality-sweep
description: Use when the user asks to inspect, review, improve, polish, modernize, fix, or comprehensively raise the quality of Factupapa Next. Coordinates specialist roles for UX, visual design, mobile/accessibility, business QA, data/sync, architecture/performance, security, and release verification, then implements authorized improvements end to end.
---

# Factupapa Quality Sweep

## Canonical policy

Read `AGENTS.md` first. It owns autonomy, approval gates, validation and completion.

Read:

- `docs/quality/FACTUPAPA_QUALITY_STANDARD.md`
- `.agents/roles/README.md`
- all role cards under `.agents/roles/`

This skill does not add approval gates.

If the user's request is only to inspect/review/audit, operate read-only.
If the user asks to solve, improve, fix, polish, apply or otherwise change Factupapa, the routine project changes needed to address findings are authorized under `AGENTS.md`.

## Goal

Do not merely generate an audit report. When changes are authorized, raise the application to the documented quality bar, validate it, publish it through the canonical deployment workflow, and re-check the result.

## Operating model

If the environment supports parallel subagents/worktrees, specialists may inspect in parallel as long as the Quality Lead consolidates findings before implementation and overlapping files are coordinated.

If parallel agents are unavailable, perform the same specialist passes sequentially. Do not skip a role just because it cannot run as a separate process.

## Phase 0 — Establish scope and evidence sources

1. Determine read-only vs change-authorized intent from `AGENTS.md`.
2. Inspect repository state and recent relevant changes.
3. Inspect the production deployment when accessible.
4. Check available Vercel runtime/build errors and unresolved toolbar feedback.
5. Use browser automation/screenshots for real UI behavior when available.
6. Identify affected business modules and data-sensitive paths.

Do not request a production data token for a purely visual/UX sweep unless the current task genuinely depends on protected data.

## Phase 1 — Specialist inspection passes

Run these lenses:

1. Quality Lead — scope, inventory and eventual consolidation.
2. Product & UX — task flow, IA, labels, friction, empty/error states.
3. Visual Design — hierarchy, typography, spacing, color, cards, tokens and theme consistency.
4. Mobile Interaction & Accessibility — touch, keyboard, safe areas, responsive overflow, focus, semantics and contrast.
5. Business Functional QA — invoices, purchases, expenses, stock, numbering, totals and exports.
6. Data/Sync/Integrations — persistence, merge, registry ingestion, duplicate prevention and failure states.
7. Frontend Architecture & Performance — root causes, module boundaries, CSS/system debt and rendering/network cost.
8. Security & Privacy — auth, secrets, exposure and external effects.
9. Release & Regression — verification strategy and adjacent-risk map.

Each finding must use the shared format from `.agents/roles/README.md`.

## Phase 2 — Consolidate before editing

The Quality Lead must:

- merge duplicate findings by root cause;
- reject findings based only on taste with no evidence;
- assign P0/P1/P2/P3 severity;
- resolve conflicts using the documented precedence;
- group fixes into coherent implementation slices;
- identify shared components/tokens/root causes before one-off patches.

When changes are authorized, do not pause for approval between these internal phases unless an explicit `AGENTS.md` gate applies.

## Phase 3 — Implement in risk order

Default order:

1. P0 safety/data/security blockers.
2. P1 broken core workflows and severe mobile interaction defects.
3. Foundation fixes that unlock multiple visual/UX issues (tokens, shared component behavior, modal geometry, navigation structure).
4. High-confidence P2 UX/accessibility/consistency/performance improvements.
5. Cheap coherent P3 polish only when it does not broaden scope or destabilize the release.

Rules:

- fix root causes rather than stacking local overrides;
- preserve unrelated business behavior;
- do not redesign for novelty;
- do not introduce fake data or placeholder flows as final;
- do not weaken security or data safeguards for aesthetics;
- keep Spanish-first UI and the product identity in `AGENTS.md`.

## Phase 4 — Verification loop

After each coherent implementation slice:

- self-review the diff;
- run the smallest useful targeted check;
- exercise the changed flow when practical;
- continue to the next slice only when the current one is coherent.

Before publication:

- run `node scripts/check-syntax.mjs`;
- run `npm test`;
- run any additional relevant checks;
- test representative narrow mobile widths and desktop when UI changed;
- check both themes when theme/shared visual code changed;
- verify modal/sheet scrolling and keyboard-sensitive flows when forms changed;
- verify adjacent components that share the modified code.

Fix validation failures within scope and rerun. Do not deploy a knowingly broken state.

## Phase 5 — Publish

If application code changed and verification is green, invoke the canonical `.agents/skills/factupapa-deploy/SKILL.md` workflow.

Documentation/role/skill-only changes do not require a production app deployment unless they change served assets.

## Phase 6 — Post-deploy quality check

After production publication:

- confirm the new version is live;
- smoke-test the material changed flows;
- check runtime/build errors relevant to the release;
- verify the exact original weakness is resolved;
- verify no obvious adjacent regression was introduced.

If a defect is discovered, fix it within the authorized scope and repeat validation/publication rather than declaring success prematurely.

## Completion

Use the exit criteria in `docs/quality/FACTUPAPA_QUALITY_STANDARD.md`.

Final reporting should be compact and factual:

- major findings fixed;
- material design/UX/system improvements;
- tests and real-browser checks performed;
- deployment/production evidence;
- only genuine remaining blockers or clearly separated P3 ideas.

Do not finish with a giant wishlist when the user asked you to improve the app.
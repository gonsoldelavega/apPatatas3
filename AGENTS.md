# AGENTS.md

## Scope and precedence

This file is the canonical repository policy for coding agents working on Factupapa.

- Direct system/developer/user instructions take precedence over this file.
- More specific nested `AGENTS.md` files, if added later, apply to their directory subtree.
- `CLAUDE.md`, `.claude/commands/*`, and `.agents/skills/*` may provide environment or workflow detail, but they must not create approval gates that conflict with this file.
- When instructions appear to conflict, prefer the interpretation that preserves explicit safety requirements while still completing the user's requested outcome end-to-end.

## Autonomy and approvals

### Requests that authorize changes

A direct user request to **implement, fix, change, improve, refactor, configure, migrate, deploy, or otherwise modify** the project authorizes all routine, reversible engineering steps needed to complete that requested outcome.

Within the requested scope, do **not** ask for additional confirmation before:

- inspecting files, logs, configuration, branches, commits, or deployment state;
- editing code, tests, docs, configuration, agent instructions, or project-local skills;
- running local checks, tests, formatters, linters, build commands, or read-only diagnostics;
- creating or using a work branch;
- committing verified changes;
- pushing the work branch;
- merging verified work into `main`;
- pushing `main`;
- deploying verified application changes to production;
- retrying recoverable GitHub, Vercel, network, or API failures with bounded backoff;
- verifying production after deployment.

The owner has granted permanent authorization for verified requested application changes to be committed, pushed, merged into `main`, and deployed to production without a second confirmation.

### Read-only requests

A request to **review, inspect, investigate, audit, analyze, compare, or explain** is read-only by default unless the user also asks to fix/apply/change the result.

During a read-only task:

- continue all safe investigation needed to produce a complete answer;
- do not stop after the first finding to ask whether to continue;
- do not mutate project code, production data, accounting records, or external systems unless the user has also authorized changes.

If the user says `hazlo`, `aplícalo`, `corrígelo`, `soluciónalo`, or otherwise clearly accepts a concrete proposed change from the immediately preceding context, that counts as authorization to execute that proposed scope without asking again.

### Explicit approval gates

Ask the user only when one of these gates applies:

1. **Destructive or irreversible business-data changes**: deleting or overwriting invoices, purchases, expenses, registry rows, customer/business records, Drive archives, or other production business data where recovery is uncertain.
2. **A write inferred only from an audit**: a read-only integrity review may propose repairs, but actual mutation of accounting/business data requires explicit approval unless the user already asked to repair those exact records.
3. **External communication with real-world effect**: sending email/messages, submitting forms, accepting legal/financial terms, or otherwise communicating externally requires explicit user intent. Creating a draft is allowed only when the relevant workflow explicitly permits it.
4. **Missing required secret/credential**: if the current requested task truly depends on a secret that is unavailable, ask once for it. Never store secrets in the repository.
5. **Material ambiguity with significant consequences**: ask only when two plausible interpretations would produce materially different, high-impact or hard-to-reverse outcomes and the ambiguity cannot be resolved from repository context.
6. **Scope expansion**: ask before introducing a major unrelated feature, large architectural rewrite, destructive migration, or another material change that is not necessary for the user's requested outcome.

When approval is required:

- complete all safe/read-only preparation first;
- present the exact proposed action and its effect;
- ask once;
- after approval, continue through completion without asking again unless the scope materially changes.

### What is not an approval gate

The following are checkpoints, not reasons to pause for user confirmation:

- `summarize risks before major edits`;
- completing one implementation phase before the next;
- being on `main`;
- choosing a technical commit label or branch name;
- retrying a transient failure;
- discovering an issue that can be safely diagnosed or fixed within the already-authorized scope;
- routine deployment after verified requested code changes.

## Completion contract

A change task is not complete merely because code was edited.

For a requested application change, continue until one of these terminal states is reached:

1. **Complete and verified**: requested scope implemented, checks pass, changes published as required, and production verification succeeds when deployment is part of the normal workflow.
2. **Complete but externally blocked**: code/work is finished, but an external platform, unavailable credential, branch protection, or service failure prevents a final publication step. Report the exact blocker and the last verified state.
3. **Blocked by a safety gate**: all safe preparation is complete and one explicit approval listed above is required.
4. **Blocked by a real validation failure**: a failing required test, unresolved conflict, or evidence of possible corruption remains after reasonable diagnosis/fix attempts.

Do not stop at an intermediate state such as `edited`, `committed`, `PR opened`, or `push attempted` when the requested outcome can safely be completed further.

## Verification policy

A **verified application change** means:

1. `node scripts/check-syntax.mjs` passes;
2. `npm test` passes;
3. any additional check relevant to the files changed passes;
4. if `apps-script/gonsol-drive-organizer/Code.gs` changed, copy it to a temporary `.js` file and run `node --check` on that copy;
5. obvious regressions and relevant edge cases have been reviewed.

A change is not considered verified merely because `node --check` passed on one file.

### Failure handling

Distinguish blocking validation failures from recoverable operational failures.

**Blocking failures** include:

- required syntax/check failure;
- failing required tests;
- unresolved merge conflict;
- credible risk of data corruption or loss.

For a blocking failure, do not deploy the broken state. Diagnose it, fix it when safely within scope, rerun validation, and continue if green. If it cannot be resolved safely, report the blocker.

**Recoverable failures** include:

- transient network errors;
- temporary GitHub/Vercel/API failures;
- deployment propagation delays;
- a failed status request.

For recoverable failures, diagnose and retry automatically with bounded backoff. Do not ask the user to retry something the agent can safely retry itself. Never wait indefinitely.

## Git and deployment ownership

For application changes, the deployment workflow owns the final publication sequence:

`final validation -> commit if needed -> push branch if used -> merge to main if needed -> push main -> verify production`

Do not run a competing partial Git flow that can make the deployment workflow incorrectly conclude that nothing remains to publish.

Supported starting states include:

- uncommitted changes on a work branch;
- already-committed work on a work branch that is not yet in `main`;
- uncommitted changes directly on `main`;
- commits on `main` not yet pushed;
- pushed `main` whose production deployment still needs verification.

Being on `main` is not, by itself, a reason to ask for approval.

Use `.agents/skills/factupapa-deploy/SKILL.md` or the equivalent `.claude/commands/desplegar.md` workflow for deployment details.

## Proactive data checks

Use the data-integrity workflow proactively only when:

- the requested task depends on current production business data;
- the task changes sync, invoices, purchases, registry ingestion, numbering, or another data-integrity-sensitive flow;
- the user explicitly requests a data audit.

Do **not** block unrelated UI, CSS, documentation, refactor, or ordinary coding tasks because `APP_SYNC_TOKEN` is unavailable.

If an optional proactive check would require a missing token, skip that optional check and mention it in the final report. Ask for the token only when the current requested task actually depends on it.

Use `.agents/skills/factupapa-data-audit/SKILL.md` or `.claude/commands/revisar-datos.md` for the detailed read-only audit workflow.

## Monthly close

Do not run the monthly-close workflow merely because a new month has started during an unrelated coding session.

Run it when:

- the user explicitly requests the monthly close;
- a scheduled monthly-close task invokes it;
- the current task specifically concerns monthly accounting reconciliation.

A monthly close must never block unrelated application work.

Use `.agents/skills/factupapa-monthly-close/SKILL.md` or `.claude/commands/cierre-mensual.md` for details.

## Comprehensive quality sweeps

When the user broadly asks to inspect/review **and improve, fix, polish, modernize, or raise the quality of Factupapa Next**, use `.agents/skills/factupapa-quality-sweep/SKILL.md` as the canonical orchestration workflow.

- The specialist role cards live under `.agents/roles/` and cover product UX, visual design, mobile/accessibility, business QA, data/sync, architecture/performance, security/privacy, and release/regression verification.
- `docs/quality/FACTUPAPA_QUALITY_STANDARD.md` defines the shared quality bar and severity/exit criteria.
- Specialist passes are internal checkpoints, not approval gates.
- If the request authorizes improvements, do not stop at an audit report: consolidate findings, implement in-scope high-confidence fixes, validate, publish application changes through `factupapa-deploy`, and re-check production.
- If the request is inspection-only, run the same lenses read-only and report findings without modifying the project.
- Security/privacy, business/data correctness, and accessibility/usability take precedence over purely aesthetic preferences when recommendations conflict.
- Do not ask for `APP_SYNC_TOKEN` merely to conduct a visual/UX sweep unless protected production data is genuinely required for the requested task.

## Product standard

Factupapa must feel like a premium mobile-first business app, not a generic admin template.

This is a serious invoicing and business-operations app for a small Spanish business. It must be optimized for daily real-world use on mobile while remaining strong on desktop.

### Priorities

1. Mobile usability
2. Real business utility
3. Visual elegance
4. Clean architecture
5. Performance
6. Consistency
7. Maintainability
8. Safe incremental progress

### Non-negotiables

- Spanish-first UI
- EUR currency
- Excellent dark mode
- No fake flows
- No placeholder UX passed off as final
- Strong responsiveness
- Reusable components
- Clean domain models
- Good form UX
- High-quality empty/loading/error states
- Premium spacing and typography
- Preserve unrelated existing behavior during structural refactors unless explicitly instructed otherwise

## Navigation

Mandatory tabs:

- Inicio
- Facturas
- Gastos
- Productos
- Otros

## Critical modules

- Invoices with serious UX and PDF/export/email readiness
- Expenses and purchases with attachments
- Purchases imported from the external Drive -> agent -> Google Sheets registry
- Products with stock
- Customers and suppliers
- Templates and template-field customization
- Customer analytics
- Gmail integration area
- Monthly summaries and management overview

## Import requirements

The architecture must support loading/importing customers and products.

### Customers

- manual creation
- bulk import from CSV
- bulk import from Excel-compatible files if feasible
- editable after import
- searchable after import
- immediately usable in orders, invoices, and related flows

### Products

- manual creation
- bulk import from CSV
- bulk import from Excel-compatible files if feasible
- editable after import
- searchable after import
- immediately usable in orders, invoices, stock flows, and related flows
- preserve price, unit, reference, category, and notes when available

### Import UX

- preview before confirming import
- clear validation errors by row
- simple column mapping when headers differ
- do not silently create duplicates
- mobile-friendly flow
- architecture should allow the feature to be added cleanly later if not implemented yet

## UI direction

Target a premium native-style dark mobile app:

- dark premium UI
- strong card-based layout
- bottom navigation on mobile
- refined spacing
- large touch-friendly inputs
- clean typography hierarchy
- subtle borders and restrained shadows
- premium accent colors used intentionally

Do not apply a major UI redesign during a structural refactor unless the requested outcome includes that redesign. When redesign is requested, use provided visual references closely without silently changing business logic.

## Refactor rules

Use phases as **internal engineering checkpoints**, not automatic user-approval checkpoints.

- do not add unrelated features;
- do not change user-visible behavior unless requested or required by the requested fix;
- do not change business-logic semantics unless requested or required by the requested fix;
- do not mix unrelated redesign into a refactor;
- keep the app working after each coherent phase;
- complete one coherent phase at a time and validate before continuing;
- if several phases are required for the requested outcome, continue through them in the same task without requesting confirmation between phases unless an explicit approval gate applies;
- identify material risks before major edits, but do not treat the risk summary itself as an approval gate;
- preserve existing data behavior unless the task explicitly changes it;
- preserve current invoice, stock, sync, document-attachment, and export behavior.

## Coding rules

- Inspect before editing.
- Keep modules coherent.
- Avoid quick hacks.
- Prefer maintainable abstractions.
- Use strong typing when possible.
- Refactor when needed to implement the requested result cleanly.
- Self-review before finishing.
- Prefer small, reversible steps over unnecessary rewrites.
- Preserve unrelated behavior.

## Architecture direction

Target modular boundaries:

- `app/bootstrap`
- `state`
- `domain`
- `services`
- `ui`
- `utils`
- `config`

Rules:

- Domain rules must not touch the DOM.
- Services must not render UI.
- UI should consume stable interfaces.
- Persistence should be centralized behind clear storage/sync boundaries.

Large architectural changes require explicit user intent. If the user's requested outcome explicitly asks for or genuinely requires that architectural change, proceed without a redundant second approval. Do not initiate unrelated large rewrites merely because they would be technically cleaner.

## UX rules

- Large touch targets
- Low typing friction
- Sticky actions where useful
- Excellent mobile keyboard behavior
- Proper draft preservation
- Fast customer/product search
- Elegant cards, hierarchy, and spacing
- No clutter

## Scanner and AI invoice reading

The in-app scanner module and the AI/OCR invoice-reading flow have been removed.

- Purchases are imported from the external Drive -> agent -> Google Sheets registry and synced into the app.
- Documents remain a manual attachment archive.
- Do not introduce or reintroduce in-app AI/OCR/camera-scanning functionality unless the user's current request explicitly asks for it.
- An explicit current user request is sufficient authorization; do not ask for a second confirmation solely because the feature belongs to this category.
- Do not reintroduce it as an unrelated side effect of another task.

## Form default behavior

- All form fields are blank by default to avoid accidental data reuse.
- Date fields default to the current day.
- New invoices prefill the invoice number using the current numbering logic.
- The invoice number field remains manually editable.
- Manual overrides must always be respected.

## Customer-facing invoice output

- Do not display internal-only metadata.
- Do not show the template name in the invoice body.
- Do not show line-count summaries in the invoice body.
- Keep invoice output focused on customer-relevant information.

## Delivery rules

For major tasks, before finishing:

- review your own changes;
- improve weak labels/microcopy where relevant;
- verify responsiveness where UI changed;
- check relevant edge cases;
- run required verification;
- complete the normal Git/deployment workflow when the task is an authorized application change;
- report the final state, material files changed, checks performed, and any genuine remaining blocker.

## What not to do

- Do not turn the app into a generic admin dashboard.
- Do not replace business-specific flows with generic CRUD shortcuts.
- Do not degrade mobile UX.
- Do not silently change data structures without migration planning.
- Do not mix unrelated major phases into one change.
- Do not commit secrets, sync tokens, credentials, or private keys.
- Do not bypass failing required tests just to deploy.
- Do not invent approval requirements that are not listed in this file.

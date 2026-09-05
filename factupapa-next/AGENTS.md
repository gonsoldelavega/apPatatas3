# Factupapa Next — scoped agent policy

This file applies to everything under `factupapa-next/` and supplements the repository root `AGENTS.md`.

## Product identity

`factupapa-next/` is the current React/Vite + API/PostgreSQL rewrite. It is isolated from the legacy/root PWA. Do not modify, deploy, or use the legacy app as evidence for a Factupapa Next task.

The continuity/source branch for current Next work is `codex/factupapa-claude-fixes` unless a newer explicitly documented continuation branch supersedes it.

## Quality execution

For requests to improve, polish, fix, audit-and-fix, or comprehensively review Factupapa Next:

- inspect the actual Next web/API code and private-staging evidence available;
- preserve business correctness over cosmetic preference;
- fix root causes before one-off styling overrides;
- validate mobile ergonomics, accessibility, light/dark behavior, forms, error states, data integrity, and regressions;
- when changes are authorized, do not stop at a wishlist: implement high-confidence P0/P1/P2 findings, validate them, and leave the continuation branch in a reviewable verified state;
- do not create extra approval gates beyond root `AGENTS.md`.

Priority when recommendations conflict:

`security/privacy > business/data correctness > accessibility/usability > product UX > performance/maintainability > visual polish`.

## Purchases and documents

The in-app scanner/camera capture and AI/OCR purchase-reading workflow are **not part of the current product architecture**.

Canonical purchase ingestion:

`Drive/email source -> external agent/organizer -> Google Sheets REGISTRO -> supervised sync into Factupapa Next`.

Rules:

- do not classify an uploaded file into a purchase inside the app;
- do not create purchases automatically from bank receipts, deposits, payment confirmations, issued sales invoices, or arbitrary Gmail attachments;
- manual purchases may attach the original PDF/image as an archive only, without OCR/extraction;
- the original document must remain viewable when attached;
- registry sync must be idempotent and duplicate-safe;
- actual destructive repair of production accounting data remains subject to the root approval gates.

## Invoice numbering

New invoice forms must show the next suggested number from the authoritative server-side sequence and keep it manually editable before issuance.

A manual override must:

- be a positive integer;
- reject duplicates within the same company/series;
- be preserved on the draft;
- advance the server-side sequence when needed so a later automatic invoice cannot reuse it;
- never silently overwrite an issued invoice number.

## Mobile UX

Mobile is the primary interaction target.

- core flows must remain usable around 375–430 CSS px;
- do not autofocus text fields in a way that opens the software keyboard unnecessarily;
- fixed/sticky actions must not hide required fields or controls;
- touch targets must remain comfortably tappable;
- preserve safe-area insets and scroll reachability;
- avoid dense administrative layouts when a progressive/simple flow is possible.

## Staging and deployment

Factupapa Next staging is the private VPS/Tailscale environment documented under `factupapa-next/docs/`. The legacy public Vercel deployment is not proof that Next is deployed.

Control-plane branches used only for staging task/progress JSON must not consume unrelated preview builds or be treated as application source branches.

Never claim a Next deployment is live without evidence from the actual Next staging/target environment.

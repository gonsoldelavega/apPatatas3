# AGENTS.md

## Product standard

This project must feel like a premium mobile-first business app, not a generic admin template.

## Product identity

This is a serious invoicing and business operations app for a small Spanish business.
The app must be optimized for daily real-world use on mobile, while remaining strong on desktop.

## Priorities

1. Mobile usability
2. Real business utility
3. Visual elegance
4. Clean architecture
5. Performance
6. Consistency
7. Maintainability
8. Safe incremental progress

## Non-negotiables

* Spanish-first UI
* EUR currency
* Excellent dark mode
* No fake flows
* No placeholder UX passed off as final
* Strong responsiveness
* Reusable components
* Clean domain models
* Good form UX
* High-quality empty/loading/error states
* Premium spacing and typography
* Preserve existing behavior during structural refactor phases unless explicitly instructed otherwise

## Navigation

Mandatory tabs:

* Inicio
* Facturas
* Gastos
* Productos
* Otros

## Critical modules

* Invoices with serious UX and PDF/export/email readiness
* Expenses and purchases with attachments
* Purchases imported from the external Drive -> agent -> Google Sheets registry
* Products with stock
* Customers and suppliers
* Templates and template-field customization
* Customer analytics
* Gmail integration area
* Monthly summaries and management overview

## Future functional requirements

The app must support loading/importing customers and products.

### Customer import requirements

* manual creation
* bulk import from CSV
* bulk import from Excel-compatible files if feasible
* editable after import
* searchable after import
* immediately usable in orders, invoices, and related flows

### Product import requirements

* manual creation
* bulk import from CSV
* bulk import from Excel-compatible files if feasible
* editable after import
* searchable after import
* immediately usable in orders, invoices, stock flows, and related flows
* preserve price, unit, reference, category, and notes when available

### Import UX requirements

* preview before confirming import
* clear validation errors by row
* simple column mapping when headers differ
* do not silently create duplicates
* mobile-friendly flow
* architecture should allow this feature to be added cleanly later even if not implemented yet

## UI direction

The target visual direction should be close to a premium native-style dark mobile app:

* dark premium UI
* strong card-based layout
* bottom navigation on mobile
* refined spacing
* large touch-friendly inputs
* clean typography hierarchy
* subtle borders and restrained shadows
* premium accent colors used intentionally

Important:

* Do not apply major UI redesign during early structural refactor phases unless explicitly requested
* When the time comes for UI redesign, use provided visual references closely without changing business logic

## Refactor rules

During structural refactor phases:

* do not add new features unless explicitly requested
* do not change user-visible behavior unless explicitly requested
* do not change business logic semantics unless explicitly requested
* do not mix refactor with redesign unless explicitly requested
* keep the app working after each phase
* complete one phase at a time
* summarize risks before major edits
* preserve existing data behavior
* preserve current invoice, stock, sync, scanner, and export behavior

## Coding rules

* Inspect before editing
* Keep modules coherent
* Avoid quick hacks
* Prefer maintainable abstractions
* Use strong typing when possible
* Refactor when needed
* Self-review before finishing
* Prefer small, reversible steps over large rewrites
* Preserve behavior first, improve structure second

## Architecture direction

Target modular boundaries should move toward:

* app/bootstrap
* state
* domain
* services
* ui
* utils
* config

Rules:

* Domain rules must not touch the DOM
* Services must not render UI
* UI should consume stable interfaces
* Persistence should be centralized behind clear storage/sync boundaries

## UX rules

* Large touch targets
* Low typing friction
* Sticky actions where useful
* Excellent mobile keyboard behavior
* Proper draft preservation
* Fast customer/product search
* Elegant cards, hierarchy, and spacing
* No clutter

## Delivery rules

For major tasks, after implementing:

* review own code
* improve weak labels/microcopy
* verify responsiveness
* check edge cases
* report files changed and next best tasks

## Done means

A task is not complete unless:

* the requested scope is fully implemented
* unrelated behavior is preserved
* the app still runs
* regressions are checked
* the result is coherent with the existing architecture and product direction

## What not to do

* Do not turn the app into a generic admin dashboard
* Do not replace business-specific flows with generic CRUD shortcuts
* Do not degrade mobile UX
* Do not silently change data structures without migration planning
* Do not mix multiple major phases into one step
* \## Scanner and AI invoice reading (removed)
* The in-app scanner module and the AI/OCR invoice-reading flow (Anthropic + Tesseract) have been removed.
* Purchases are now imported from the external Drive -> agent -> Google Sheets registry and synced into the app.
* Documents remain as a simple manual attachment archive (no camera capture, no OCR).
* Do not reintroduce in-app camera scanning or AI/OCR invoice reading unless explicitly requested.
* \## Form default behavior rules
* 
* \- All form fields must be blank by default to avoid accidental data reuse
* \- The only exception is date fields, which must default to the current day
* \- New invoices must prefill the invoice number using the current numbering logic
* \- The invoice number field must remain manually editable
* \- Manual overrides must always be respected and never blocked
* \## Customer-facing invoice output rules
* 
* \- Customer-facing invoices must not display internal-only metadata
* \- Do not show template name in the invoice body
* \- Do not show line count summaries in the invoice body
* \- Keep invoice output focused on useful customer information only


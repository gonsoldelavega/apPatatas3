# Factupapa Next — scoped agent policy

This file applies to everything under `factupapa-next/` and supplements the repository root `AGENTS.md`.

## Where Factupapa Next lives (do not get this wrong again)

- Repo `gonsoldelavega/apPatatas3`, branch **`codex/factupapa-claude-fixes`**, folder **`factupapa-next/`**. Nothing else is the source of truth for Next.
- Staging: `https://factupapa-next.46-62-226-95.sslip.io` (private VPS). Deploy = commit on this branch whose message contains `[deploy-staging]`. Proof of deploy: `GET /api/health` -> `version` equals the pushed SHA. `GET /api/ready` reporting `postgresql: incomplete` was observed on 2026-11-02 and is unexplained.
- Any request that just says "Factupapa" means Next. The root PWA (`index.html`, `src/`, `sw.js`, Vercel `ap-patatas3`) is legacy and frozen by the owner's order.
- Before the first edit: `git branch --show-current` must be `codex/factupapa-claude-fixes` and changed files must be under `factupapa-next/`. If a session starts on `main` or `claude/*`, start from `origin/codex/factupapa-claude-fixes` instead.
- Divergence with `codex/factupapa-next-quality-sweep` (to 2026-09-21): **Gestoría (tax forecast) was ported on 2026-11-06** with its two migrations kept byte-identical (`0034_tax_forecasts.sql`, `0035_purchase_tax_deductibility.sql`; this branch's own `0034_delivery_note_editing_and_deletion.sql` coexists because only filenames must be unique). Still NOT ported from that branch: voice assistant, expense-summary helpers, purchase-registry auto-sync on app open + VPS sync timer, multi-product invoice fixes. Never edit an already-applied migration; add a new one.

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

## Access control (roles)

- Roles: `owner` = the single master user (full access, manages partners); `partner` = a partner ("socio") with restricted access. Up to 3 active partners, managed by the master in the app (Otros → Socios, API `/team/members`). Partner e-mails are data in the database, never in the repository.
- Google sign-in no longer auto-creates a company for any account: only existing accounts or e-mails the master authorised can sign in (`google_account_not_authorized` otherwise). Removing a partner revokes sessions and deactivates the account immediately.
- A partner can see dashboard/alerts/pending items and create invoices and delivery notes, only with data from `PARTNER_HISTORY_FROM` (default `2026-11-01`) onward. Prices, customers, suppliers, products, purchases, expenses, stock, imports, integrations, settings, Gestoría and team management are master-only.
- Enforcement is **server-side and deny-by-default**: `apps/api/src/authz/partner-policy.ts` (pure allowlist) + `authz/guard.ts` (runs before every handler). A new endpoint is automatically forbidden to partners; to open one, add it to the allowlist AND a case in `test/partner-policy.test.ts` and `test/integration/team-access.integration.test.ts`. The web hides screens by role (`auth/roles.ts`, `OwnerOnly`) but that is only convenience, not security.
- Date clamps are validated strictly (ISO `YYYY-MM-DD` only); text comparison of dates must never be trusted for access control.

## Shared workspace (orders, tasks, notes, accounts between the two family groups)

- Backend: `apps/api/src/workspace/` (`orders.ts`, `tasks.ts`, `notes.ts`, `ledger.ts`, pure math in `ledger-math.ts`, routes in `routes.ts`). Tables in `packages/database/0037_shared_workspace.sql` (RLS forced, tenant isolation). Web: pages `Orders/Tasks/Notes/Ledger`, widgets in `apps/web/src/workspace/`.
- Open to the master and to partners (see `authz/partner-policy.ts`), with no date cutoff: they are common team data. The master's own dashboard shows fiscal/billing first and these blocks after; partners see orders and tasks first.
- Orders are checklists that can be ticked **by parts**: each line has `quantity_ordered` and `quantity_done`; progress is recorded as events (who/when) and the order completes itself when every line is done (a negative correction reopens it). Units: `kg`, `bolsa`, `unidad`.
- Accounts: two sides (`side_a`, `side_b`, names editable by the master only), 50/50 split. Expense paid by X → the other side owes half; income collected by X → X owes half to the other; `settlement` = payment between sides. All math in integer cents (`ledger-math.ts`); the odd half-cent is carried, never lost. Balance is cumulative; period filters only change the totals. Only the creator or the master can edit/delete an entry (soft delete + audit event). "Saldar cuentas" records the exact settlement.
- `users` is only readable by its own row (RLS), so records store a name snapshot (`created_by_name`, `done_by_name`...) instead of joining users.
- Gestoría (303/130): every confirmed and non-deleted purchase and every issued sales invoice counts (purchase VAT is deductible unless a different `deductible_rate` is set). Delivery notes (sales without invoice) never count.

## Company details (issuer of invoices and delivery notes)

- `companies` holds `name`, `tax_id`, `address` (jsonb: `street`, `postalCode`, `city`), `email`, `website`. The master edits email, website and address in the app (Otros → Empresa, `PUT /company/profile`); name and NIF are not editable there.
- Each invoice stores a **snapshot** of the issuer (`issuer_legal_name`, `issuer_tax_id`, `issuer_address`). The snapshot is refreshed when a *draft* is issued; issued invoices never change. Email and website are contact data: the PDF reads them live from `companies`.
- jsonb does not keep key order: always print addresses through `address()` in `invoices/pdf.ts` (street, postal code, city).

## Reglas de interfaz (aprendidas en móvil)

- Nunca usar `window.confirm` / `window.prompt` / `window.alert`: el navegador los rotula con la dirección técnica del sitio. Usar `askConfirm` / `askText` / `showNotice` de `apps/web/src/ui/dialogs.tsx`.
- Las animaciones de entrada no pueden dejar `transform` activo al terminar (`animation-fill-mode: both` con keyframes de `transform`): un ancestro con transform convierte `position: fixed` en relativo a ese ancestro y la barra «Total + Revisar factura» queda a mitad de la página, tapando el formulario. Usar `backwards`.
- Los formularios largos necesitan `padding-bottom` ≥ 200 px en móvil para que el final suba por encima de la barra fija y la navegación inferior.

## Permisos de los socios sobre el catálogo

Los socios (`partner`) pueden **dar de alta** clientes, proveedores y productos (`POST /contacts`, `POST /products`) y consultarlos; no pueden editarlos, darlos de baja ni fijar precios especiales por cliente. En la web, sus listas (`/catalogo/*`) no enlazan a las ffichas de edición.

## Stock compartido de patata

Todo producto activo **en kg** cuyo nombre contenga «patata», «patatas» o «agria» (sin distinguir mayúsculas) comparte UNA sola existencia de kilos: compras confirmadas − ventas (facturas y albaranes) ± ajustes ± merma de producción, sumadas sobre todo el grupo (incluidos los productos dados de baja, para no perder movimientos). Cada variante muestra esos mismos kilos. Está en `stockCtes` (`apps/api/src/finance/service.ts`); `/stock` devuelve `sharedStock` y los totales (`stockKg`, venta posible, web `utils/stock-totals.ts`) cuentan el grupo una sola vez. No se aplica merma a las ventas: 1 kg vendido descuenta 1 kg.

## Stock en nevera

Tabla `fridge_stock` (migración 0042): recuento por producto de lo ya preparado para entregar (bolsas o kg), con `counted_at`. El valor vigente es el recuento menos las ventas emitidas después (facturas manuales y albaranes). La nevera es un subconjunto de la patata general: no cambia el total, solo reparte entre «en nevera» y «por preparar». API: `POST /stock/fridge` (solo maestro); `/stock` devuelve `fridgeQuantity`, `fridgeCountedAt`, `packageLabel`, `unitsPerPackage`. Pantalla Stock: una sola tarjeta «Patata (stock general)» con la nevera por producto.

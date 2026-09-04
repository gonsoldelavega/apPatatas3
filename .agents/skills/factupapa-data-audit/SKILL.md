---
name: factupapa-data-audit
description: Use to audit Factupapa production data integrity across app state, the REGISTRO Google Sheet, Gmail, and related sources. Read-only: finds duplicates, numbering problems, misclassified purchases, missing invoices, provider issues, and month mismatches, then proposes repairs without applying them.
---

# Factupapa Data Audit

## Authority and write boundary

`AGENTS.md` is the canonical policy.

This skill is **read-only**. Finding a problem is not a reason to stop and is not authorization to mutate business/accounting data.

Complete the full safe audit first. Group proposed repairs at the end. Any actual mutation of invoices, purchases, expenses, registry rows, Drive archives, or other production business data must follow the approval gates in `AGENTS.md`.

## Token handling

The cloud app state may require `APP_SYNC_TOKEN`.

- Read it from the environment if available.
- Never write it to repository files, persistent logs, commits, examples, or docs.
- If this audit was explicitly requested and the token is truly required but unavailable, ask once.
- If the audit is only an optional proactive check for a task that does not depend on data, do not block that unrelated task because the token is absent.
- If an authenticated request returns `unauthorized`, verify the request/env use first; only then request a valid token if the audit cannot proceed without it.

## Sources

Use the sources that are actually available:

1. production app state (`/api/app-state`);
2. Google Sheet `REGISTRO`;
3. Gmail invoice messages when available/relevant;
4. Drive/document locations when read access is available and useful.

Keep temporary downloads outside the repository, e.g. `/tmp`.

Do not label/archive/delete email, move Drive files, reimport invoices, or mutate any source during the audit.

## Audit: sales invoices

In `state.invoices`, check at least:

- duplicate IDs;
- the same `FAC-###/YEAR` assigned to different IDs;
- numbering gaps, with context rather than assuming every gap is wrong;
- date/year inconsistencies;
- patterns suggesting phantom invoices, overwrite, or duplicate sync.

Treat confirmed duplicate IDs/numbers as **Grave**.

## Audit: purchases / REGISTRO

Validate current headers/shape before relying on historical numeric column indexes.

Historical fields include date, type, supplier, NIF, concept, total, and review state.

Check for:

- `Revisado=no` or equivalent;
- missing/invalid totals;
- empty or garbage supplier names containing legal boilerplate (`inscrita`, `registro mercantil`, `tomo`, `folio`, etc.);
- canonical-name mismatch for known NIFs:
  - `A04037677` -> FRUTAS Y PATATAS GAYCA, S.A.
  - `B04854154` -> J. EXPÓSITO CAZORLA E HIJOS, S.L.
  - `B42743211` -> HIGIENLAB 2020 S.L.
- likely duplicates using multiple keys (supplier/NIF, invoice number, total, exact/near date);
- rows assigned to the wrong month;
- sales invoices, bank deposit receipts, or other non-purchase documents misclassified as purchases;
- missing expected purchases when another source provides strong evidence.

A heuristic match is a suspicion, not permission to delete or overwrite.

## Cross-check Gmail

When Gmail is available and relevant, inspect known supplier invoices such as GAYCA and Solred/Repsol.

For a possible missing invoice:

- identify message/document/date;
- collect supplier, invoice number, total, and other reliable identifiers;
- search REGISTRO by several keys;
- classify as `confirmed missing`, `possible missing`, or `present with differing metadata`.

Do not trigger reimport or change message labels in this skill.

## Continue despite findings

Do not stop after the first anomaly.

If one source fails:

- retry recoverable failures with bounded backoff;
- continue with other available sources;
- state exactly what could not be verified.

## Report format

Group findings as:

### Grave
High-confidence integrity issues affecting duplication, numbering, amount, month assignment, or clear misclassification.

### Revisar
Heuristic or incomplete anomalies needing human/evidentiary confirmation.

### OK
Relevant checks that passed.

For each finding include:

- enough evidence to identify it;
- why it matters;
- the concrete recommended repair;
- whether the repair changes data and therefore needs approval.

Then provide one consolidated `Proposed repairs` section so any required approval can be requested once rather than piecemeal.

If nothing is wrong, say so clearly and list the sources/checks actually verified.

## Never do inside this skill

- delete a duplicate row;
- rename/correct a supplier in production data;
- renumber invoices;
- reimport an invoice;
- move/delete Drive documents;
- change Gmail labels;
- alter app state.

Audit first; mutation is a separate authorized action.

---
name: factupapa-monthly-close
description: Use to prepare Factupapa's monthly accounting package for Bongest: reconcile sales, purchases, expenses, Gmail/Drive documents, flag discrepancies, build the attachment checklist, and optionally create a Gmail draft without sending it.
---

# Factupapa Monthly Close

## Authority and scope

`AGENTS.md` is the canonical policy.

This skill is read-only with respect to accounting/business source data:

- do not alter invoices;
- do not alter purchases/expenses;
- do not edit REGISTRO rows;
- do not move/delete Drive documents;
- do not modify production app state.

The only optional write side-effect allowed by this skill is creating a **Gmail draft**. Never send the email from this skill.

Do not invoke a monthly close merely because a calendar month changed during unrelated coding work. Use it when the user explicitly requests it, a user-authorized scheduled workflow invokes it, or the current task is specifically monthly accounting reconciliation.

## Target month

Use the month explicitly given by the user when present.

Otherwise use the last complete natural month unless the immediate context clearly identifies another intended period.

Represent the working month as `YYYY-MM` internally and present it in natural Spanish in the final output.

## Token handling

Cloud state may require `APP_SYNC_TOKEN`.

- Prefer the environment variable.
- Never store the token in the repository.
- If the requested close truly depends on cloud data and no token is available, ask once.
- Continue any parts that can be completed safely from other sources while resolving a missing source.

## Sources

Use available read access to:

1. production app state;
2. Google Sheet `REGISTRO`;
3. Gmail for invoices/reminders/supporting documents;
4. Drive for supporting PDFs/location verification.

Never claim a source/document was verified when it was not.

## Step 1: compile purchases

For the target month:

- filter purchase rows;
- count purchase invoices/documents;
- sum totals;
- group by supplier;
- identify `Revisado=no`/equivalent;
- detect obvious month/date mismatches;
- note likely duplicates or supplier parsing problems.

Known canonical suppliers include:

- `A04037677` -> FRUTAS Y PATATAS GAYCA, S.A.
- `B04854154` -> J. EXPÓSITO CAZORLA E HIJOS, S.L.
- `B42743211` -> HIGIENLAB 2020 S.L.
- Solred/Repsol -> fuel

## Step 2: compile expenses

From the app's expenses for the target month, include the recorded categories that actually exist, such as:

- autónomos;
- gestoría;
- fuel/Solred;
- other business expenses recorded for that month.

Do not invent tax deductibility. If a `deductible total` is presented, state the exact data/criterion used and flag uncertainty rather than presenting an unsupported tax conclusion as fact.

## Step 3: compile sales

Use invoice `issueDate` for the target month and report:

- invoice count;
- total including VAT;
- material numbering/date anomalies that could affect the close.

## Step 4: document reconciliation

When Gmail/Drive access is available, cross-check expected documents, especially recurring providers such as GAYCA, Solred/Repsol, and Bongest.

Classify each relevant discrepancy as:

- document found and recorded;
- document found but apparently missing from REGISTRO/app;
- record exists but supporting document was not located;
- ambiguous match requiring review.

Use the logic from `.agents/skills/factupapa-data-audit/SKILL.md` for integrity checks. Do not stop after the first discrepancy.

## Step 5: monthly summary

Produce a concise table containing at least:

- sales total and count;
- purchases total and count, with supplier breakdown;
- other expenses total;
- pending/manual-review count;
- any useful overall totals clearly labeled.

Separate verified facts from inferred/uncertain items.

## Step 6: discrepancy report

Group all problems into one section, including when applicable:

- unreviewed purchases;
- likely duplicates;
- supplier misassignment;
- email invoices apparently missing from REGISTRO;
- REGISTRO entries whose document could not be found;
- month/date mismatch;
- suspected misclassification.

For each, propose a specific repair but do not apply it inside this skill.

## Step 7: attachment checklist

Build a concrete checklist based on what was actually found, such as:

- purchase PDFs under the verified `02_COMPRAS/<year>/T<quarter>/<month>` location;
- documents still under manual review;
- monthly sales PDF/unified export when available;
- autónomos receipt;
- Solred fuel invoice;
- other relevant documents found during reconciliation.

Do not invent a file or path if it was not verified.

## Step 8: Bongest email draft

Known recipient: `gestion@bongest.es`.

If Gmail is available, look for the month's reminder thread when useful so the draft can reply in context.

Draft content should be brief and include:

- month reference;
- sales summary;
- purchases summary;
- other relevant expenses;
- any pending document/discrepancy;
- a short closing question if Bongest needs to review something.

### Draft permission

Creating a Gmail **draft** is allowed when this monthly-close workflow is user-authorized and the connector supports it.

Creating a draft is not sending.

**Never send the email from this skill.** Sending requires a separate explicit user instruction.

If a draft cannot be created, provide the complete email text ready to paste and continue; do not fail the entire close.

## Final output

Finish with:

1. monthly financial/document summary;
2. discrepancies/pending review;
3. attachment checklist;
4. Gmail draft status or ready-to-paste email text;
5. sources that could not be verified and the exact reason.

The workflow is complete even if a draft cannot be created, provided the accounting package and precise blocker are delivered.

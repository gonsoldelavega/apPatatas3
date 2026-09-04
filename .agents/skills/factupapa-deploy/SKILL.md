---
name: factupapa-deploy
description: Use for publishing Factupapa application changes, resuming an interrupted publish, merging verified work to main, pushing main, or verifying the production deployment. Handles dirty and already-committed states without redundant approvals.
---

# Factupapa Deploy

## Authority

`AGENTS.md` is the canonical policy for autonomy, approvals, validation, and completion.

This skill does not add approval gates. If the user already requested the application change, routine commit, push, merge to `main`, deployment, retry, and production verification are authorized as described in `AGENTS.md`.

Do not ask merely because:

- you are on `main`;
- a work branch needs to be pushed/merged;
- a technical label is missing;
- production needs verification;
- a recoverable network/API operation needs retrying.

## Goal

Keep going until the requested application work reaches the furthest safe terminal state:

- verified and live in production; or
- code published but a precisely diagnosed external deployment blocker remains; or
- a blocking validation/safety issue remains after reasonable diagnosis.

Do not stop at `edited`, `committed`, `PR opened`, `branch pushed`, or `merge attempted` if safe progress is still possible.

## Step 1: inspect actual publication state

Determine:

- current branch;
- uncommitted changes;
- commits on the current branch not in `main`;
- commits on `main` not in `origin/main`;
- current cache token in the relevant ref(s);
- whether production already serves the expected version.

A clean working tree does **not** mean there is nothing to publish.

Pending work can be:

1. uncommitted application changes;
2. already-committed work not yet in `main`;
3. `main` commits not yet pushed;
4. pushed `main` whose production state is not yet verified.

If no pending work exists, perform a short consistency check and report `sin publicación pendiente`.

## Step 2: cache versioning

Factupapa uses a `?v=YYYYMMDD<letter>` asset token and `CACHE_VERSION` in `sw.js`.

Before creating a bump, compare the pending work with its base:

- if the pending work already contains a coherent new cache version, reuse it;
- if application assets/code changed and the pending work does not yet contain a bump, generate one;
- if only repository documentation/agent instructions changed and the served app did not change, do not create a meaningless web cache bump or deployment.

When generating a new bump:

1. read the current token from the repository;
2. use the current system/environment date;
3. same date -> increment letter; new date -> `a`;
4. replace actual occurrences of the previous token in the relevant served files;
5. update `sw.js` to `YYYY-MM-DD<letter>-<short-label>`;
6. verify the real occurrence counts before/after instead of relying on a hard-coded count.

Derive `<short-label>` from the change. If unclear, use `cambios`; do not interrupt the user to name it.

## Step 3: mandatory validation

Follow the verification contract in `AGENTS.md`.

Run at least:

```sh
node scripts/check-syntax.mjs
npm test
```

Also run checks relevant to changed files.

If `apps-script/gonsol-drive-organizer/Code.gs` changed, copy it to a temporary `.js` file outside the repo and run `node --check` on the copy.

### Blocking validation failure

For a real test/syntax/conflict/data-safety failure:

1. diagnose;
2. fix when safely within the authorized scope;
3. rerun the failed and relevant surrounding checks;
4. continue when green.

Never deploy a knowingly broken state just to finish the workflow.

### Recoverable operational failure

For transient GitHub/Vercel/network/status failures:

- retry automatically with bounded backoff (for example 2/4/8/16 seconds);
- diagnose persistent failures;
- never wait indefinitely;
- do not ask the user to manually retry something the agent can safely retry.

## Step 4: publish according to starting state

### Work branch

- commit current-scope changes if necessary;
- push the branch with bounded retries;
- merge verified work into `main` using the repository's intended merge style;
- resolve a conflict only when the resolution is clear and within scope;
- push `main`.

### Already on `main`

- do not ask for approval solely because of the branch;
- commit current-scope changes if necessary;
- push `main` with bounded retries;
- never attempt to merge `main` into itself.

### Work already committed

Publish the existing pending commits. Do not stop merely because there is nothing left to commit.

Do not include unrelated dirty work in the commit. If unrelated local changes exist, preserve them and isolate the current scope when technically possible.

## Step 5: verify production

For changes affecting the deployed web app, verify the expected version is live.

Use at most 15 polling attempts around 8 seconds apart. Never use an unbounded `until` loop.

If the expected version is not visible after the bounded wait:

1. verify the expected commit is in `origin/main`;
2. inspect deployment/build status using available tools;
3. inspect relevant build/runtime failures;
4. distinguish propagation delay from deployment failure.

Report a precise state such as:

- `producción verificada`;
- `main publicado; deployment fallido por <cause>`;
- `main publicado; producción no verificable por <cause>`.

Never claim production success without evidence.

## Step 6: Apps Script when relevant

If Apps Script changed:

- verify JavaScript syntax as above;
- inspect current GitHub Actions/App Script deployment status when available;
- do not assume an old documented `invalid_grant` incident is still current;
- if a genuinely interactive Google authorization remains unavoidable, complete every other safe step and report that exact external blocker.

## Final report

Include only useful completion facts:

- what was published;
- final branch/commit or merge result;
- cache version if changed;
- validation commands and status;
- production status;
- any genuine unresolved blocker.

If a new web cache version was deployed, mention closing/reopening the mobile app only when it is useful for loading the new cache.

## Safety

- Never commit secrets or tokens.
- Never mutate accounting/business data as part of deployment.
- Never bypass required tests.
- Never introduce unrelated product logic during a publish-only invocation.

# Branch protection — ordering-components (ORD-1084)

Enable **after the first green CI run** on GitHub (merge the ORD-1084 PR to `main` first, or push a test commit so workflows register). GitHub only lists status checks that have run at least once.

## Required status check

| Check name | What it runs |
|------------|-------------------|
| **CI Quality Gate** | One billed job: lint + `test:coverage` + 70% average gate |

Do not require extra job names. Lint, Test, and Test Coverage Report are no longer separate billed jobs. Same pattern as [ordering-dashboard](https://github.com/Finitless-com/ordering-dashboard).

## GitHub UI steps (repeat for `main` and `production`)

1. Open [Finitless-com/ordering-components](https://github.com/Finitless-com/ordering-components) → **Settings** → **Branches**.
2. **Add branch protection rule** (or edit existing).
3. **Branch name pattern:** `main` (then repeat for `production`).
4. Enable:
   - **Require a pull request before merging** (recommended; 1 approval if your org requires it).
   - **Require status checks to pass before merging**.
   - **Require branches to be up to date before merging** (recommended).
5. Under **Status checks that are required**, search and select:
   - `CI Quality Gate`
6. Save the rule.

## Verify

1. Open a test PR that intentionally fails lint or drops coverage below 70%.
2. Confirm merge is blocked until **CI Quality Gate** is green.
3. Confirm direct pushes to `main` / `production` are blocked if your org uses PR-only flow.

## Promotion flow (`main` → `production`)

After ORD-1084 ships:

1. Merge feature PR into `main` (CI must be green).
2. Open PR `main` → `production` (or fast-forward per team convention).
3. **CI Quality Gate** must pass on `production` before merge.
4. Consumer apps pin the new submodule SHA (see [CONSUMER_SUBMODULE.md](./CONSUMER_SUBMODULE.md)).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `CI Quality Gate` not in the status-check dropdown | Open a PR so `.github/workflows/ci.yml` runs; wait for the job to finish. This workflow is PR-only. |
| Coverage job fails locally but passes in CI | Run `yarn test:coverage:summary` in this repo; ensure `vitest.config.js` scoped include matches CI. |
| Submodule consumers still on old SHA | Expected — consumers bump SHA in their own PRs after `ordering-components` merges. |

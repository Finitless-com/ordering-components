# Consumer submodule pin workflow

`ordering-components` is embedded as a **git submodule** at `src/@/components` in every consumer app. After this repo merges gated changes to `main`, each consumer updates its **gitlink** (the commit SHA recorded in the parent repo) in a separate PR.

**No consumer CI changes are required for ORD-1084** — apps inherit confidence because the shared repo itself runs the CI Quality Gate.

## Consumer repos

| Repo | Submodule path | Package manager |
|------|----------------|-----------------|
| [website-marketplace-v26](https://github.com/Finitless-com/website-marketplace-v26) | `src/@/components` | pnpm (parent) / yarn (submodule tests) |
| [ordering-app-marketplace-v26](https://github.com/Finitless-com/ordering-app-marketplace-v26) | `src/@/components` | yarn |
| [ordering-app-business-v26](https://github.com/Finitless-com/ordering-app-business-v26) | `src/@/components` | yarn |
| [ordering-app-driver-26](https://github.com/Finitless-com/ordering-app-driver-26) | `src/@/components` | yarn |

## When to bump

Bump the submodule SHA in a consumer when:

- You need a **feature or fix** merged to `ordering-components` `main`.
- You are aligning all apps to the same components release before a deploy.
- A security or breaking-change notice requires consumers to pick up a minimum SHA.

Do **not** bump casually on every `ordering-components` merge unless the consumer actually needs the change — pin intentionally.

## Pin to a specific commit (recommended)

From the **consumer repo root** (not inside the submodule):

```bash
# 1. Fetch latest components
git submodule update --init --recursive
cd src/@/components
git fetch origin
git checkout <COMMIT_SHA>   # e.g. abc1234 from ordering-components main after merge
cd ../../..

# 2. Record the new gitlink in the parent repo
git add src/@/components
git status   # should show: modified: src/@/components (new commits)
```

Commit in the **consumer** repo (English message):

```
chore: bump ordering-components to <COMMIT_SHA>

Picks up <short description or Linear ID, e.g. ORD-1084 CI gate>.
```

Open a PR in the consumer repo. Run that app's usual verify commands (see each repo's `CLAUDE.md`).

## Find the SHA to pin

```bash
# On ordering-components after merge to main
git log origin/main -1 --format='%H %s'

# Or from GitHub: merged PR commit on Finitless-com/ordering-components
```

## Fresh clone (developers)

```bash
git clone --recursive https://github.com/Finitless-com/website-marketplace-v26.git
# or, if already cloned without submodules:
git submodule update --init --recursive
```

## Editing components (contributors)

Logic changes belong in **ordering-components**, not copied into consumer `src/ui`:

1. Work in `ordering-components` (or `src/@/components` submodule checkout on branch `feature/ORD-…`).
2. PR → green **CI Quality Gate** → merge `main` → promote `production` if applicable.
3. Bump submodule SHA in each consumer that needs the change (separate PRs per app).

See [CLAUDE.md](../CLAUDE.md) for controller/UI boundaries and platform entry points.

## Optional localized checkout errors

`OrderingProvider` and `OrderProvider` accept `localizedCheckoutErrors` (off by
default). Enable it only when the consumer's Alert handles the optional
`localizedErrors` prop.
The provider sends `localized_errors=1` on add-product, apply-coupon, place
and reorder requests. It keeps the API result, action returns, alert content
and status separate from the new array of `{index, message}` entries.

Use the optional array only to render matching entries. Keep an existing
consumer translation or override first. Ignore invalid entries and use the
current rendering when the API omits the array or the feature is off.

## CI relationship

| Repo | CI on components code? |
|------|------------------------|
| `ordering-components` | **Yes** — Vitest + 70% scoped gate ([ci-coverage-plan.md](./ci-coverage-plan.md)) |
| Consumer apps | **No** (ORD-1084) — submodule is tested upstream; consumers run their own app CI only |

Future issues (ORD-1078, ORD-1079, …) add CI to each consumer's **app-owned** code (`src/ui`, `src/pages`, etc.), not to re-test the submodule.

## Checklist — consumer bump PR

- [ ] Submodule points to a commit on `ordering-components` `main` (or agreed release branch).
- [ ] That commit had green **CI Quality Gate** on the components repo.
- [ ] Consumer app builds / tests pass (`pnpm build` web, `npx tsc --noEmit` + `yarn test` RN).
- [ ] PR description notes why the bump is needed and links the components PR or Linear issue.

# Phase 3: Build (by group: one phase, or a parallel group)

Expert skills: `executing-plans`, `test-driven-development`, `clean-arquitecture-workflow`. Add `error-handling-patterns` only when this phase touches I/O, an API, payments, auth, or user input. Add the `design.md` surface skill only when the diff changes UI. Add `translate-keys` only after new English UI strings exist.

A new chat for this phase starts from `@.omniflow/<TICKET>/plan.md` and the files it touches (`models.md`).

## Inner loop

1. Linear: mark the phase sub-issue **In Progress**. No comment.
2. Write the failing tests for this phase's QA matrix rows first. Then write the minimum code that passes them.
3. UI: match the approved mockup. Reuse the components named in `## Design read`. Use theme tokens only.
4. Apply the anti-patterns in `SKILL.md`.
5. Run the narrowest checks first, then the repo's lint, types, and tests for the touched files. Keep the evidence. Remove accidental and generated files.
6. **STOP.** Do not write next-phase files, do not commit, and do not launch a review.

No silent scope growth, no unrelated refactors or upgrades. If the plan is wrong, stop and revise it with the user. Fixes that share a file run one after another, never in parallel.

## Cloud Autonomous Loop (when `Ejecución: Cloud`)

Runs when a sub-issue is triggered in Cursor Cloud from Linear. The sub-issue description is the only spec (`linear-contract.md`, Cloud-ready sub-issue body). Read `Goal & Owned files`, `Contracts`, `QA Matrix`, and `Design / Tokens` from it, where the local loop reads the plan file and `## Design read`. Replaces step 6 (`STOP`) of the local Inner Loop:

1. **Branch:** Fetch the `Branch base` and create `feature/<TICKET>-fase-<N>`, or the repo's documented branch pattern.
2. **Build & Verify:** Run steps 2 to 5 of the Inner Loop: load the named `Expert skills` from `.cursor/skills/`, write the failing tests first, implement the minimum code, apply the anti-patterns, and run lint, types, and tests.
3. **Self-Review & Security:** Run `code-review-excellence` and `security-review` on `git diff origin/<base>...HEAD`. Fix any Critical/High security issue or blocker immediately.
4. **Ship Draft PR:** Commit all changes (`<TICKET>: <phase name>`), push to origin, and open a **Draft PR** targeting the repo's base branch with `Fixes <SUB-ISSUE-ID>` and test evidence in the body.
5. **Linear Handoff:** Move the sub-issue to **In Review** and post the completion comment (`## Done` + PR URL + checks run). Stop only after the PR URL is posted.

Edit only the owned files. If the contract is wrong or a non-owned file must change, do not guess: post the blocker as the completion comment, leave the sub-issue **In Progress**, and stop without opening the PR.

The orchestrator (Local) then treats that Draft PR as the phase result: it pulls the branch for the integration check and runs the normal phase gate with the user. The Cloud Agent never marks Done and never merges.

## Parallel group (a plan group with 2 or 3 phases)

Before launching, every UI phase in the group must already have its approved mockup.

1. Linear: mark every phase of the group **In Progress**. The orchestrator does all Linear writes for build; phase agents do not.
2. Phases with `Ejecución: Cloud` are not subagents: trigger them from Linear (`models.md`, Cloud execution). For the `Local` phases, launch one Task subagent per phase in **one message** (`generalPurpose`). Its `model` is the phase's `Modelo` mapped with the slug table in `models.md`. Each prompt is this contract, filled in:

   ```
   Build — <TICKET> — Fase <N>: <nombre> (Grupo <letra>)
   Repo: <path> · Plan: .omniflow/<TICKET>/plan.md (read only "Fase <N>" and "Contracts")
   Owned files (edit only these and their tests): <list>
   Contract: <interfaces this phase provides or consumes>. Consumers build against <mock path>.
   Mockup: <approved screenshot paths, or "no">
   Do: the inner loop above, steps 2 to 5. Expert skills: <the ones this file names for this phase>.
   Never commit, push, stash, reset, or edit files you do not own.
   Run formatters and linters on owned files only (never `--write` on the whole repo). Do not install dependencies, touch lockfiles, generate migrations, or clear caches.
   Shared registries (i18n catalogs, route files, barrel exports, DI providers): do not edit them. Return the exact entries to add under REGISTRY.
   If the contract looks wrong or a non-owned file must change: stop and return CONTRACT or BLOCKED with one line why.
   Return only: Done / CONTRACT / BLOCKED · Files changed · REGISTRY entries · Checks run → result · Not run and why.
   ```

   The agents share the workspace checkout (law 9). That is safe only because every agent edits a disjoint set of files and follows the rules above. Each subagent starts with a fresh context, which already satisfies the new-chat rule in `models.md`.

3. Collect. On CONTRACT or BLOCKED, stop the group and ask the user one question with the proposed contract change. Do not let the agents negotiate between themselves.
4. **Integration check** (orchestrator): add the REGISTRY entries, install dependencies if any phase needs them, swap the mocks for the real interfaces, then run the tests that cross the contract and the repo's full verification once. Fix integration breaks in cascade.
5. One gate for the whole group. Line 1: `✅ Grupo A — Fase 1 + Fase 2`. Question: `¿Apruebas el Grupo A y paso al <siguiente grupo / QA>?`. After approval, write one completion comment on each phase sub-issue.

## Phase gate

1. Linear, status only: parent `Overall` → `completed / total` inside `## Omniflow`. Sub-issue → 100%, **In Review**, never Done.
2. 4-line voice. Line 1 uses the plan's build phase numbers (`✅ Fase 2/4 — <nombre>`), not Omniflow phase numbers. Fill the numbers in the question; on the last build phase, ask for QA instead:
   `¿Apruebas la Fase 2 y paso a la 3? (manda demo o feedback si quieres)`
   `¿Apruebas la Fase 4 y paso a QA? (manda demo o feedback si quieres)`
3. Halt. After approval: one completion comment on that sub-issue (`linear-contract.md`). If the user sent a demo link, include it.

A stubborn bug is not fixed until the original repro fails to reproduce with fresh evidence.

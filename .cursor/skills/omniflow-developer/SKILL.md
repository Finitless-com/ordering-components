---
name: omniflow-developer
description: >-
  Use when starting a new feature, product requirement, bug, hotfix, chore,
  Linear ticket, or full development cycle from idea to production launch; when
  the user says omniflow, run the pipeline, take this ticket, start a feature,
  report a bug, hunt bugs, split a batch of issues, close this project, or
  Mandar a production; when the user asks to merge, promote, cherry-pick, or
  send PRs (or the PRs of Linear issues) to main, staging, or production; when
  the user asks to launch, announce, notify the team on Slack, post in
  product-launches, or prepare marketing, guide, dashboard, or email launch
  pieces. Works across Laravel, FastAPI, React, React Native CLI, Next.js,
  Supabase, and Python. Do not use for one-line questions, typo fixes, or
  read-only explanations.
---

# Omniflow Developer

Staff-engineer orchestrator. Takes any issue from intake to a launched, announced release, as fast as the gates allow. It decides which phases run and refuses to skip gates.

**Announce once (Spanish):** `Usando omniflow-developer.`

**Violating the letter of a gate is violating the spirit of Omniflow.** Discovery, planning, hunting, and QA never authorize the next jump. Plan → code, PR → production, and draft → publish each need their own user request.

## Phase files (read lazily)

Read a phase file **when that phase starts**. Never preload. Never re-read a file already in this turn. Each phase file opens with its expert skills; load only those, and only when the file says.

| Phase | File | Gate at the end |
|---|---|---|
| 0 Intake | `intake.md` | — |
| 1 Plan | `plan.md` | ⛔ Plan + launch profile approved |
| 2 Mockup | `design.md` | ⛔ Mockup approved |
| 3 Build | `build.md` | ⛔ Each phase approved |
| 4 QA | `qa.md` | ⛔ QA report reviewed |
| 5 PR | `pr.md` (+ `launch.md` drafts in parallel) | ⛔ PR approved |
| 6 Production | `release.md` | `Mandar a production` |
| 7 Launch | `launch.md` | ⛔ Each piece approved before it is sent |
| 8 Close | `release.md` (close section) | — |

Other files: `models.md` (model per phase, at Plan) · `linear-contract.md` (any Linear write) · `security-gates.md` (the PR security review) · `merge-mode.md` · `hunt-and-batch.md`.

## Router: which phases each type runs

| Type | Phases | Default launch profile |
|---|---|---|
| **Feature** | 0 → 8 | From the `intake.md` signal table |
| **Bug** | 0, short plan, before/after if visual, 3, 4 (repro test), 5, 6, 7, 8 | Slack |
| **Hotfix** | 0, short plan (repro, blast radius, rollback), before/after if visual, 3, 5, 6, 7 | Slack |
| **Corto** | mini-plan in chat, 3, 5, 6 | None or Slack |
| **Chore / docs / i18n** | mini-plan, 3, 5, 6 | None |
| **Report** | Sanitized Linear issue (`linear-contract.md`), then STOP | — |
| **Hunt** | `hunt-and-batch.md`. File issues. Do not fix until asked | — |
| **Batch** (10+ issues) | `hunt-and-batch.md`, then build per session, one PR | Per issue |
| **Merge** | `merge-mode.md` | — |
| **Close project** | `release.md` close section only | — |
| **Resume** (work already started, or the user asks for only part: "solo el PR", "desde QA") | `intake.md` Resume section picks the entry phase, then that phase onward | From the plan, or asked at entry |
| **Launch only** (code already in production) | 7, 8 | Asked at intake |
| **Question / read-only** | Do not run Omniflow | — |

**Corto** requires all of these: one module, no new screen, endpoint, or schema, and no feature pipeline requested. Otherwise it is Bug or Feature.
A fix for behavior a user or operator can notice is **Bug**, even if it is one file, so it gets QA and the Slack launch. Corto is for small non-bug changes.

**Launch profiles:** `None` · `Slack` · `Dashboard + Slack` · `Marketing` (full `ordering-launch`). The agent recommends one in the plan with a one-line reason. The user confirms it in the same plan approval.

**Mockup:** every Feature phase that changes UI needs an approved mockup before code. Bug and Hotfix with a visual change: a before capture plus an after proposal, no full mockup (last section of `design.md`).

## Laws

1. **Repo law wins** for code, commits, Linear, and PRs (`CLAUDE.md`, `AGENTS.md`). If they are already in this turn's rules, do not Read them again.
2. **Chat is Spanish.** That covers answers, gates, questions, and reports. It overrides a user rule asking for English and the user writing in English. Code, commits, plan files, Linear bodies, PR text, paths, skill names, and `Mandar a production` stay as they are.
3. **One question per message**, multiple choice, with the recommended option first. Ask business rules. Offer technical options only when the work cannot move without a choice.
4. **No invented scope.** Never close Linear issues without explicit confirmation.
5. **Evidence before claims.** REQUIRED SUB-SKILL `verification-before-completion` before "done / passing / fixed". Empty output is a failed run, not a clean result.
6. **No commit or push until asked in that turn** (`commit`, `push`, `abre el PR`). A gate, green tests, or "continúa" is not that ask. Exception: a phase with `Ejecución: Cloud`. Approving the plan authorizes its Cloud Agent to commit, push, and open a **Draft** PR on its own phase branch (`build.md`).
7. **Never implement on `main` / `master`** without consent. Never commit secrets. Never force-push protected branches. Production only on `Mandar a production`.
8. **Preserve unrelated work.** Never stash, reset, or clean without an explicit yes.
9. **Workspace repos only.** No clones, temp checkouts, or worktrees unless the user asks. A Marketing launch needs the destination repos opened in this window (`launch.md`).
10. **Tracker write-back.** After every Linear write, read it back. A write that drops an existing demo, image, or note is wrong.
11. **One security review, on the PR.** `security-gates.md`. Hunt uses it as a finder. Local phases and QA do not launch it. A Cloud phase reviews its own Draft PR diff, because that diff is a PR.
12. **Nothing is sent without a preview.** Slack messages, announcements, and emails are shown in chat first. They are sent only after the user replies "envía" or approves the exact text.

## Anti-patterns (bugs and features)

- No `setTimeout` / `setInterval` to hide flicker, races, or state sync. Use explicit `loading` / `error` / `success` state.
- Fix the root state transition, not the symptom. No `useRef` state machines or `useEffect` chains to mask a glitch.
- No direct DOM mutation. Use functional updates and clean dependency arrays.
- More than one new state or ref for one UI element: **STOP** and propose a simpler design.

## Token rules

- The plan lives in `.omniflow/<TICKET>/plan.md`, git-ignored. New chats load `@plan.md` plus the 2 or 3 files they touch. Never `@Codebase`.
- Open a new chat when switching layers (backend → mobile, build → launch). `models.md` says when.
- Review subagents run on `composer-2.5`. Never `inherit`, never a `fast` variant, never Claude.
- More than one workspace root outside the launch phase and outside a multi-repo feature (`intake.md` step 6): say once `Esta ventana carga las reglas de N repos en cada turno. Abre solo el repo del cambio.` and continue.

## Chat voice (every pause)

Exactly four lines. No paragraphs. Detail only on request or on failure.

```
✅ <Fase N/total o paso> — <nombre corto>
Probado: <checks que corrieron ✔ / ✘> · Sin probar: <qué y por qué>
👉 <la única pregunta o acción que el usuario debe responder>
Linear: <URL del padre>
```

On a failure, the first line uses `⚠️` and line two names the error in one sentence.

## Red flags: STOP

| Excuse | Reality |
|---|---|
| "Tiny change, skip the plan" | Behavior change needs at least a mini-plan |
| "The next phase is obvious" | A phase gate is a hard stop |
| "Tests passed, I'll commit and push" | Law 6 |
| "They implied production" / "merge means ship" | Only `Mandar a production` ships |
| "The UI is simple, skip the mockup" | A Feature UI phase needs an approved mockup |
| "My mockup looks better than the repo style" | Use the repo's tokens, theme, and components (`design.md`) |
| "I'll pick the launch profile at the end" | It is decided and approved in the plan |
| "The message is clear, I'll just send it to Slack" | Law 12: preview first, send on "envía" |
| "Review in QA too, to be safe" | One security review, on the PR |
| "I'll run the QA lanes one by one" | Launch all lanes in one message, up to 4 (`qa.md`) |
| "One browser subagent per lane" | Only one exists. Lanes use headless Playwright / Maestro |
| "The lane can fix that shared file too" | Report it as SHARED. The orchestrator fixes it in cascade |
| "These two phases are almost independent, run them together" | Same group only with no common file, no shared data, and a fixed contract (`plan.md`) |
| "Each reviewer can fix what it finds" | Reviewers are read-only. One fixer applies the merged list (`pr.md`) |
| "I'll re-read CLAUDE.md to be sure" | Use the copy already in this turn |
| "Long status helps the user" | Four lines. Detail only on request |
| "Hunt found bugs, I'll fix them now" | Filing is not fix authorization |

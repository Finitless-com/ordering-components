# Phase 0: Intake

Expert skills: none. Keep it cheap: classify, check git, check Linear, and move on.

1. Classify the type with the router in `SKILL.md`. State it in one line, in Spanish.
2. In the active repo:

   ```bash
   git branch --show-current
   git status --short
   git rev-parse --show-toplevel
   ```

   Dirty tree or not on the default branch: tell the user and stop. Do not switch, reset, or stash.
3. Detect the stack from the repo (Laravel, FastAPI, React, React Native CLI, Next.js, Supabase, Python). Never assume a stack the repo contradicts.
4. Detect the Linear team, prefix, branch pattern, and PR title format from `CLAUDE.md` / `AGENTS.md`. Fallback branch: `feature/<TICKET>-<slug>`.
5. Search Linear for duplicates before creating anything (`linear-contract.md`). Enrich an existing parent instead of cloning it.
6. Multi-repo: logic goes in the upstream repo. Independent products (app + API + site) get one plan with one section per repo, built in separate chats. When a feature crosses several repos, recommend opening a **multi-root workspace** with every repo involved from Phase 1 (Plan) onward. That gives the plan model full context of each layer's contracts and tokens. The heavy phases then run in Cursor Cloud (`Ejecución: Cloud`), so the local machine is not overloaded. Say it once: `Este feature cruza <repos>. Abre un workspace multi-root con ellos antes del plan.`
7. Draft the launch profile recommendation for the plan. Use the router default for the type, adjusted by who notices the change:

   | Signal in the issue | Profile |
   |---|---|
   | Internal, refactor, CI, or no user notices it | `None` |
   | Bug fix, minor improvement, the team should know | `Slack` |
   | Operators must see or act on it in the dashboard | `Dashboard + Slack` |
   | Integration, new product or sales channel, big customer-facing feature | `Marketing` |

   Do not ask yet. The recommendation goes into the plan.
8. **Plan model check.** If the issue crosses stacks (Laravel ↔ FastAPI ↔ RN), touches payments or auth, or changes the architecture, and the current chat is not `Opus 5.5` in Plan mode (or the agent cannot tell which model or mode it is running), stop after intake and send only this:

   ````
   ⚠️ Este plan pide Opus 5.5 en modo Plan.
   Abre un chat nuevo con Opus 5.5 en modo Plan y pega esto:
   ```
   omniflow, planea <TICKET o resumen en una línea>.
   Intake: tipo <tipo> · stack <stack> · repos <lista> · duplicados <ninguno / ID>.
   Lanzamiento sugerido: <perfil> — <motivo>.
   ```
   👉 ¿Lo abres en Opus, o sigo aquí con <modelo actual>?
   ````

   The pasted prompt carries the intake result. When a prompt starts with `omniflow, planea` and includes an `Intake:` line, skip steps 1 to 8 and start at `plan.md`. If the user says to continue here, continue.

**Launch only** (the code is already in production): skip to `launch.md`. Ask for the profile there.

## Resume (work already started)

Use this instead of steps 2 and 5 when a branch, commits, a PR, or a plan already exist, or when the user names a part ("solo el PR", "desde QA", "solo el lanzamiento"). A dirty tree on the feature branch is the work itself: do not stop, stash, or reset it. Stop only if the dirty files clearly belong to something else.

Detect the state cheaply. Do not re-read code that is not needed for the entry phase:

```bash
git branch --show-current
git status --short
git log --oneline origin/<default>..HEAD
gh pr view --json url,state,isDraft,reviewDecision,statusCheckRollup
ls .omniflow/*/plan.md
```

Also read the Linear issue when one is known.

The phase the user names wins. If that phase skips QA ("solo el PR"), still run the repo's verification commands before the PR and put the result in the PR test plan. "Lanzarlo" or "sacarlo" means the whole tail: PR, then production, then launch. Otherwise use the first row that matches:

| State | Entry phase |
|---|---|
| PR merged and in production | 7 Launch |
| PR open | 5 PR, from step 3 (post-PR review and `security-review`, if they were not done) |
| Code done, no PR | 4 QA, then 5 PR |
| Code half done | Short plan of the remaining work, then 3 Build |
| Only an issue or an idea | Normal flow from 1 Plan |

Fill only what the entry phase needs:

- **No plan file:** write a short plan of the remaining work only. Do not rebuild the full plan.
- **No QA matrix at QA:** derive a mini matrix from the branch diff (`git diff origin/<default>...HEAD --stat`) and the issue's acceptance criteria.
- **No launch profile before 5 or 7:** ask it once, as one multiple-choice question with the recommended option first.

Earlier phases are not re-run. Line 2 of the voice names what they skipped (`Sin probar: fases previas no verificadas por Omniflow`). Every gate from the entry phase onward still applies, including law 6, `Mandar a production`, and the Slack preview.

First message: one line with the detected state and the proposed entry phase, then `👉 ¿Arranco desde <fase>?`

Output in chat: the type, the stack, and the duplicate result, in the 4-line voice. Then go to `plan.md`, the router's next step, or the Resume entry phase.

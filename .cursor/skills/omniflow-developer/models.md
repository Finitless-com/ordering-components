# Models per phase

Read at Plan. Assign `Modelo:` to every phase from this table. The names are the ones in Cursor's model picker; subagent slugs are listed below the table. Do not ask the user to choose. The user switches models in Cursor. The agent never switches its own model.

| Work | Model in chat |
|---|---|
| Orchestration: intake, gates, Linear, copy, i18n, Slack text | `Composer 2.5` |
| Laravel / FastAPI standard module, no payments or auth: migrations, Eloquent models, Pydantic schemas, CRUD endpoints | `Grok 4.7` medium |
| Laravel / FastAPI heavy logic: queues, jobs, complex queries, async pipelines | `Grok 4.7` high |
| React / React Native CLI: full screens, navigation, global state, API wiring | `Sonnet 5.5` |
| React / React Native: styles, small components, visual tweaks | `Composer 2.5` |
| React Native native layer (Gradle, Pods, native modules): diagnosis of build logs only | `GPT-5.6`, then apply the fix with `Sonnet 5.5` |
| Architecture, cross-stack (Laravel ↔ FastAPI ↔ RN), payments, auth: **Plan mode only**, writes `plan.md` with API contracts, webhooks, and error states. No code | `Opus 5.5` |
| Execution of a critical plan (payments, Sanctum / OAuth / JWT, webhooks) | `Sonnet 5.5`, new chat, `@plan.md` plus the touched files only |
| UI mockups (`design.md`) | `Sonnet 5.5` |
| Review subagents, PHPStan / Pint, Pytest / Ruff, TypeScript checks | `composer-2.5` |

Subagent slugs (Task `model`): `composer-2.5` for every review. When a subagent must diagnose a native build, use `gpt-5.6-sol-medium`. Never `inherit`, never `-fast`, never a Claude slug for reviews.

Parallel build and launch agents map `Modelo` to a slug:

| Modelo | Task `model` |
|---|---|
| `Composer 2.5` | `composer-2.5` |
| `Grok 4.7` medium or high | `grok-4.7-high` (the only Grok slug) |
| `Sonnet 5.5` | `claude-sonnet-5-5-high` |

`Opus 5.5` is never a build agent: it only plans. If a slug is missing from the current list, use `composer-2.5` and say so in the gate.

## Cloud execution

Every phase with `Ejecución: Cloud` triggers an independent Cursor Cloud Agent from its Linear sub-issue, instead of a local parallel subagent. It runs the Cloud Autonomous Loop in `build.md` with the phase's `Modelo`.

- **One Cloud phase per repository at a time.** A second Cloud phase on the same repo waits until the first one's Draft PR is posted. Cloud phases on different repos may run at the same time.
- Before triggering, the sub-issue must pass the Cloud-ready check in `linear-contract.md`.
- Before the first Cloud phase in a repo, check that `<repo>/.cursor/skills/` holds every skill the sub-issue's `Expert skills` line names. If any is missing, tell the user once: `👉 Corre scripts/sync-skills.sh <repo> --full y mergea ese PR antes de la fase Cloud.` A Cloud Agent without its skills works silently without them.
- **Automatic trigger.** When a group with `Ejecución: Cloud` phases enters build, the local orchestrator triggers each Cloud Agent itself through the Linear MCP, one sub-issue at a time and respecting the one-per-repo limit:
  1. `save_issue` with `id: <sub-issue>` and `delegate: "Cursor"` (the Cursor integration agent).
  2. If delegation is unavailable in that workspace, post one comment on the sub-issue with `save_comment`: `@cursor <phase name>: follow the Cloud Autonomous Loop in this description.`
  3. Read the sub-issue back and confirm that the delegate is set or that the Cursor agent answered. API success is not proof (law 10).
- **Manual fallback, only** when the Linear MCP call fails or the integration needs a manual confirmation in that workspace: `👉 Lanza el agente Cloud desde <sub-issue URL> y avísame.`
- The `@cursor` trigger comment is a technical action, an explicit exception to the comment limit in `linear-contract.md`. It never counts toward that limit and never replaces the completion comment.
- A Cloud phase does not need `Chat: nuevo`: the Cloud Agent always starts with a fresh context.

## New-chat rule

Put `Chat: nuevo` on a phase when either is true:

- It changes layer compared with the previous phase (backend → React, React → RN native, build → launch).
- Its model is `Sonnet 5.5` executing a plan written by `Opus 5.5`.

A new chat starts with: the parent issue URL, `@.omniflow/<TICKET>/plan.md`, the phase number, and the 2 or 3 files it touches.

## React Native CLI native builds

If a Gradle, Podfile, permission, or dependency build fails, stop the loop. Paste only the stack trace into a `GPT-5.6` chat to get the cause, then apply the fix with `Sonnet 5.5`. Do not let an agent read dozens of native files looking for it.

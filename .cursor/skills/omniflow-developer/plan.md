# Phase 1: Plan

Expert skills: `writing-plans` and `clean-arquitecture-workflow`. Add `brainstorming` for Feature only. Add a domain skill only on signal: auth or RBAC → `auth-implementation-patterns`; Postgres or Supabase schema → `sql-optimization-patterns`. Read `models.md` now.

Bug, Hotfix, Corto, and Chore use the **short plan**: no plan file, 10 lines or fewer, kept in chat and in the Linear issue. It has: the fix, the files, `Modelo`, a mini QA matrix (the repro test plus the rows the fix touches), the manual checks if any, and the `Lanzamiento` line. It still ends with the plan gate. Create a **QA guiada** sub-issue only when there are manual checks.

Multi-repo change: one Linear parent, one branch and one PR per repo, and one `## <repo>` section per repo in the plan file.

## 1. Discovery

Read the issue, the relevant code, and recent commits. Then ask the open **business** questions, one per message. No plan before they are answered.

## 2. Plan file

Write `.omniflow/<TICKET>/plan.md` in English. Keep it out of git without touching the repo's `.gitignore`:

```bash
mkdir -p .omniflow/<TICKET>
grep -qx '.omniflow/' .git/info/exclude || echo '.omniflow/' >> .git/info/exclude
```

Required sections, in this order:

1. **Goal and success criteria.** In scope and out of scope.
2. **Phases**, in execution order. Long-running collection first, irreversible steps last. Each phase has: goal and Definition of Done · files and interfaces · failing test first · this repo's verification commands · rollback · Security DoD (rows that apply from the Security DoD table in `security-gates.md`; read only that table) · `Módulos: uno|varios` · `Modelo:` from `models.md` · `Mockup: sí|no` · `Ejecución: Local|Cloud` · `Grupo: <letra>`.
   **Ejecución** is required on every phase. Use `Local` for phases with `Mockup: sí`, quick hotfixes, and the final integration. Use `Cloud` for backend, frontend, or mobile implementation phases whose contract is already closed in **Contracts**. A `Cloud` phase runs as a Cursor Cloud Agent from its Linear sub-issue (`build.md`, `models.md`).
   **Groups.** Phases with the same letter build in parallel (`build.md`). Group phases only when all of these hold: they edit no common file, they share no test data or migration, and every interface between them is fixed in **Contracts**. Otherwise give each phase its own letter. Groups run in letter order. At most 3 phases per group.
2b. **Contracts** (only when a group crosses layers). For each interface: endpoint or function, request and response JSON, error codes and states, and the mock the consumer phase builds against (`<path to mock or fixture>`).
3. **QA matrix, grouped by phase.** One concise line per check: `Caso · Pasos · Espera · Tipo`. Cover the happy path, validation errors, permissions and roles, edge cases, and abuse cases (tampered IDs, replay, wrong tenant, oversized input). Mark a row `manual` only when it needs a person (a real device, a real payment, a visual judgment). Under each phase, list its **owned files** and the test data it creates. QA lanes use both (`qa.md`).
4. **Guided QA checklist.** The `manual` rows only, written as steps a person follows: where to open, what to do, what to expect.
5. **Launch.** The profile with a one-line reason. For `Marketing`, the recommended channels (marketing page, email, Product Launch news, guide, dashboard, Slack), each with its reason. For `Dashboard + Slack`, the dashboard announcement scope.
6. **Risks.** Authorization, data exposure, rollback, observability.

Count modules as feature folders, not files. `Checkout/index.tsx` and `Checkout/layouts/X` are one module.

## 3. Linear

Read `linear-contract.md`. Create or enrich the parent. Add one sub-issue per phase at 0%. Add one **QA guiada** sub-issue holding the guided checklist, only when there are manual rows. The `QA — Fase N` lane sub-issues are created at QA, not here. Read everything back.

## 4. Gate

Show the plan in chat, one phase per line:

```
Fase N — <nombre> — Módulos: uno|varios — Modelo: <modelo> — Mockup: sí|no — Ejecución: Local|Cloud — Grupo: <letra>
```

When any group has more than one phase, add one line: `En paralelo: Grupo A (Fase 1 + Fase 2) · <n> agentes`.

Then two lines: `Lanzamiento: <perfil> — <motivo>` and, for Marketing only, `Canales: <lista>`.

Close with the 4-line voice. Its question is:
`¿Apruebas el plan y el lanzamiento? (o dime qué cambiar)`

Approval of this message confirms the phases, the launch profile, and the channels. Record the confirmed channels in the plan file, because `ordering-launch` reads them later and does not ask again.

After approval: create the branch from the updated default branch (`git fetch origin`), then write the plan comment on the parent once (`linear-contract.md`).

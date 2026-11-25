# Phase 4: QA (parallel lanes)

Runs after every build phase is approved. Expert skills: `e2e-testing-patterns` (Playwright, Cypress, Detox, Maestro) and `systematic-debugging` for failures. Read `e2e-testing-patterns` once here; lanes do not read it. `security-review` does not run here; it runs once, on the PR.

Bug and Hotfix: one lane only, made of the repro test plus the rows the fix touches. Skip to section 3.

## 1. Prepare (orchestrator)

1. **Lanes.** One lane per plan phase, each with that phase's QA matrix rows. Merge two phases into one lane only when both **edit** the same file or use the same test data. Importing a common util is not sharing. A merged lane owns the union of the phases' files, including the shared ones; its sub-issue is `QA — Fases 2+3 — <nombre>`. At most **4 lanes** run at once; extra lanes wait for a free slot.
2. **Environment.** Local first: the repo's dev server and a test database. Start the dev server once and share its URL with every lane; lanes never restart it. Staging only for what local cannot do (payment sandbox, webhooks), and only after the user's OK.
3. **Data isolation.** Each lane creates its own data with the prefix `qa-L<n>-<TICKET>-`. Backend test suites use the repo's isolated test DB (in-memory, transaction rollback, or one schema per lane). A lane never deletes data without its prefix.
4. **Browser.** UI lanes run headless Playwright (web) or Maestro / Detox (React Native), so each lane has its own browser. Do not use the browser subagent for lanes, because only one runs at a time. If the repo has no e2e tool, ask once: `¿Agrego Playwright como devDependency para las pruebas?`. If the answer is no, UI rows go to guided QA.
5. **Linear.** Create one sub-issue per lane, `QA — Fase N — <nombre>`, under the parent (`linear-contract.md`). Its description is the lane checklist.
6. Run the repo's full verification commands once (tests, lint, typecheck, build) before launching lanes. Fix red results first.

## 2. Launch the lanes

Launch every lane in **one message**, as parallel Task subagents (`generalPurpose`, `model: composer-2.5`). Each prompt is this contract, filled in, and nothing more:

```
QA lane L<n> — <TICKET> — Fase <N>: <nombre>
Repo: <path> · Dev server: <url> · Data prefix: qa-L<n>-<TICKET>-
Owned files (you may edit only these and their tests): <list from plan>
Linear sub-issue: <ID>
Checks (Caso · Pasos · Espera):
- <one line per row>

Do:
1. Write each check as an automated test in the repo's e2e/unit folder (`<TICKET>-fase-<N>`), then run it. Tests stay in the repo.
2. On failure: find the root cause. If the fix is inside owned files, write the fix, re-run until green, and record before/after screenshots. If it needs any other file, a migration, a server restart, or touches payments/auth: do not fix it, report it as SHARED.
3. Save screenshots in .omniflow/<TICKET>/qa/L<n>/. Upload ONE screenshot per plan phase in this lane (the main happy path; for backend, the test output or API response) to the Linear sub-issue and check its boxes. Preserve the existing description.
4. Never commit, push, stash, or reset. Never touch data without your prefix.
Return only:
| Caso | Resultado ✔/✘/🔧 | Evidencia |
Fixed: <file: one line each> · SHARED: <bug + files> · Linear: <updated / failed + reason>
```

`🔧` marks a check that failed, was fixed in-lane, and passes now.

If a lane cannot reach Linear, it returns its results and screenshot paths, and the orchestrator writes that sub-issue. Each lane owns its own sub-issue, so writes never collide.

## 3. Collect (orchestrator)

1. Do not re-read lane files. Trust each lane's table, but verify any `✔` that has empty evidence (law 5).
2. **SHARED bugs:** fix them one at a time, in cascade, with `systematic-debugging` and the model the plan assigned to that phase. Then re-run the lanes whose tests touch those files.
3. Re-run the full verification commands once, after all fixes.
4. Report one table, plus the 4-line voice:

```
| Fase | Casos | ✔ | 🔧 | ✘ | Linear |
|---|---|---|---|---|---|
| 1 API puntos | 6 | 5 | 1 | 0 | ORD-12 |
| 2 Pantalla | 8 | 8 | 0 | 0 | ORD-13 |
```

## 4. Guided QA (human-only checks)

Only rows that need a person (a real device, a real payment, a visual judgment). Use the **QA guiada** sub-issue. Send one check at a time:

```
🧪 Prueba <n>/<total> — <nombre>
Dónde: <URL o pantalla, entorno y proyecto de prueba>
Haz: <pasos cortos y numerados>
Espera: <resultado observable>
👉 ¿Pasó? (sí / no + qué viste / skip)
```

Record each answer in the checklist. A `no` goes to `systematic-debugging` before the next check.

Gate question: `QA completa: <x> ✔, <y> 🔧, <z> ✘, <w> sin probar. ¿Paso a preparar el PR?`

A "fixed" claim without this run is a false report. Send the phase back to In Progress.

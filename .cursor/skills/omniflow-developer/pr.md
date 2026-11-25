# Phase 5: PR

Expert skills: `code-review-excellence`, `finishing-a-development-branch`. Subagents: `pr-reviewer-and-autofixer` and `security-review`, both on `composer-2.5`. The parent does not read those two skills.

Run these steps in order. Skipping step 3 after a PR exists is a gate violation.

1. `code-review-excellence` on the full branch diff. Fix blockers on this branch.
2. **Only if the user asked to commit or open the PR in this turn** (law 6): commit, push, and open the PR in the repo format, with the Linear id in the title and `Fixes TEAM-123` in the body. The body has: summary, test plan (the QA report table), Linear links, risk and rollback, checks run, and checks not run. Without that ask, stop with the dirty tree and show the PR draft in chat.
3. **Parallel review, read-only.** In the same turn, once a PR exists, send **one message** that does all of these:
   - Subagent R1: `pr-reviewer-and-autofixer` in **report-only** mode. The prompt says: `Report findings only. Do not edit, commit, or push.`
   - Subagent R2: **one** `security-review` on PR head vs base (`security-gates.md`).
   - A background shell, not a subagent: `gh pr checks <url> --watch`.
4. **Merge the findings** into one deduplicated list: `Archivo:línea · Problema · Fix · Origen (R1/R2/CI)`. A Critical or High security finding blocks the PR.
5. **One fixer.** Apply the merged list on the PR head branch. With 3 or fewer small fixes, the orchestrator applies them. Otherwise use one fixer subagent (`composer-2.5`); fixes that touch payments or auth use the plan's model for that phase. A fix of the CI output goes through `systematic-debugging` first. Push only if the user already asked to push in this turn.
6. **Security re-check, once.** Re-run R2 only on the files the fixer changed, and only when R2 had a Critical or High finding, or the fixer touched auth, input handling, queries, or secrets. Never loop.
7. Linear → **In Review**, no comment.

Multi-repo change: one PR per repo, and steps 3 to 6 run per PR. All PRs' review agents launch together in one message, up to 6 subagents.

## Launch drafts in parallel

When the approved profile is `Marketing` or `Dashboard + Slack`, start the launch drafts as soon as the PR is open (`launch.md`, Drafts section). Drafts never wait for the merge. Publishing still does.

## Gate

4-line voice. Line 2 reads: `Revisión: <aprobado / correcciones> · Seguridad: <aprobado / bloqueado> · CI: <verde / rojo>`. The question is:
`El PR está listo: <url>. Para publicar, escribe exactamente: Mandar a production.`

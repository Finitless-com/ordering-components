# Omniflow security gates

Companion to `omniflow-developer`. Load this file when a security gate starts. At Plan, read only the Security DoD table. Do not preload it at Intake.

**Expert skill:** `security-review`  
**Skill file:** `~/.cursor/skills/.agents/skills/security-review/SKILL.md`  
**Repo copy, when it exists (prefer it, first match wins):** `.cursor/skills/security-review/SKILL.md`, then `.agents/skills/security-review/SKILL.md`. Cloud Agents only see the repo copy.

This is the OWASP expert skill (confidence-based reporting + reference files). It is **not** optional, and it is **not** replaced by `pr-reviewer-and-autofixer`, `code-review-excellence`, or the Cursor `review-security` subagent.

Announce (Spanish, to the user): `Ejecutando security-review en <PR | Hunt | Merge> (<mode>).`

The parent launches **one** subagent with Task `model: composer-2.5` (Token rules in `SKILL.md`). That subagent reads this file and the expert skill. The parent does not load the OWASP reference files. A phase gate and QA do not launch this gate.

---

## How to run

1. Read `security-review` `SKILL.md`.
2. Scope the review:
   - **the PR phase (Feature, Corto, Bug, Hotfix, Chore, Batch):** PR head vs base, in parallel with the report-only `pr-reviewer-and-autofixer` (`pr.md` step 3). One review for the whole PR. After the single fixer runs, re-check only the files it changed, under the conditions in `pr.md` step 6.
   - **Hunt:** the in-scope file list. This is a finder, not a second PR review.
   - **Merge:** `origin/<target>...HEAD` on the promotion PR. Do not also review before that PR exists.
   - **Phase gate / QA:** do not run.
3. From the expert skill's Detect Context / Language / Infrastructure tables, read **only** the matching `references/`, `languages/`, and `infrastructure/` files for this diff.
4. Research the codebase before flagging. Report HIGH confidence only. Use the expert skill's output format.
5. Empty output is a failed run (Operating law 10). A real clean result is the sentence: `No high-confidence vulnerabilities identified.`
6. Apply Critical/High fixes on the **current Omniflow branch**. Do not open a side branch. Re-run `security-review` once on the same scope after those fixes. Do not loop.
7. Medium / Needs verification: investigate now. If still unclear, list them as residual risk at the gate. Do not silently drop them.
8. Blockers that need human context (crypto choice, auth product rules, data-retention): stop. Do not guess.

Do not invent findings. Do not pad with LOW/theoretical issues. Do not skip because the mode is "small".

---

## Mode matrix (the PR gate is not optional; a phase is not a second gate)

| Mode | Security gate |
|---|---|
| **Feature** | the PR phase only |
| **Corto** | the PR phase only |
| **Bug** | the PR phase only |
| **Hotfix** | Compressed Plan still names blast radius, rollback, and authz/data exposure. The review is the PR phase only |
| **Report** | No code review. Sanitize Linear attach. Add **Security notes** (data exposed, auth boundary, attacker trigger) on the issue. STOP |
| **Audit / Hunt** | `security-review` is a required finder lens on in-scope files. File one Linear issue per confirmed HIGH-confidence vuln. Filing is not a fix authorization |
| **Batch** | One review of the shared PR at the PR phase. Not one review per issue |
| **Chore / docs / i18n** | the PR phase only. If the diff has **no executable or config change**, record `Security review: no executable diff` and continue. Markdown-only copy is not a skip of the gate — it is a proven empty executable scope |
| **Merge** | One review, on the promotion PR |
| **Close project** | No new review unless leftover unreleased code is shipping |

Question / read-only mode never enters Omniflow.

---

## What "cared for in security terms" means per phase

Every coding phase already has a Definition of Done. Add a **Security DoD** for the files that phase touches. Pick only the rows that apply:

| Phase touches | Security DoD |
|---|---|
| API, routes, RPC, jobs | Authn/authz on every new or changed path. No IDOR. Parameterized queries. No mass assignment |
| UI / HTML / markdown render | No XSS (`dangerouslySetInnerHTML`, unsanitized HTML). CSRF on state-changing actions |
| Uploads, paths, archives | No path traversal. Content-type and size checks |
| Tokens, secrets, crypto, cookies | No hardcoded secrets. Safe randomness. No secrets in logs |
| External HTTP / webhooks | No user-controlled SSRF. Allowlists. Timeouts |
| Money, entitlements, workflows | No replay / race / skip-a-step bypass |
| Schema, RLS, storage | Least privilege. No public buckets with user objects unless designed |
| Config, CI, Docker, deps | No debug-in-prod, wildcard CORS, or unpinned risky installs |

Discovery (Plan) must name these risks **before** the plan. A plan with no security DoD on a coding phase is incomplete. This table is plan text. It does not launch a review.

---

## Findings → gate

| Result | Phase gate / PR |
|---|---|
| Critical or High, unfixed | **Blocked.** Fix or get an explicit user accept-the-risk |
| Medium, understood | Fix now or write residual risk in the Linear comment |
| Needs verification | Investigate before claiming clean |
| No high-confidence vulns (skill sentence present) | Pass |
| Empty / missing review output | **Failed run.** Repeat the review |

Put the review Summary (and Findings, if any) in the the PR phase chat gate. Do not add a Linear comment for the review. Sanitize secrets and PII first.

---

## Order with other reviews

```
code-review-excellence
  → finishing-a-development-branch (PR URL)
  → in one message: pr-reviewer-and-autofixer (report-only) ‖ security-review ‖ gh pr checks
  → one fixer applies the merged list
  → security-review re-check on the fixer's files, only if pr.md step 6 applies
```

Architecture review does not satisfy this gate. Security review does not satisfy architecture review.

The Cursor `review-security` subagent is an optional **second opinion** at the PR phase only. It never replaces reading and executing `security-review`.

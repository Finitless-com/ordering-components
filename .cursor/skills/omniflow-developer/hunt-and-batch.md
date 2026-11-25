# Hunt and Batch contracts

Loaded by `omniflow-developer` when the mode is **Hunt / audit** or **Batch**.

## Hunt contract (audit mode)

Scout read-only first. Present finder areas, verification depth, and cost. Get approval before any expensive fan-out.

Scope:

- Exclude vendored code, generated artifacts, and submodules owned elsewhere.
- Misuse of an out-of-scope API by in-scope code still counts; cite the in-scope file.

Finders:

- **REQUIRED SUB-SKILL:** `security-review` as a finder lens on in-scope files (`security-gates.md`). Run it as one subagent with `model: composer-2.5`. The parent does not load the OWASP references. Confirmed HIGH-confidence vulns are real bugs; file them.
- Report **only real bugs** with a concrete failure scenario (input, state, or user action). Not bugs: style, hypotheticals, "could refactor", missing polish.
- Zero findings is valid; never pad.
- Cost lever: three lenses (code / trigger / impact) for small batches or money paths; one lens when the batch is large and a human will review.

Verification:

- Deduplicate by file+line or near-identical summary. Cap what goes to verification and **report anything dropped**.
- Verify with skepticism. Default to refuted when uncertain. A finding files only with a reachable trigger.
- If verification returned no votes, reread each cited line yourself. Empty confirmed + empty votes = verification never ran (law 10).

Filing:

- One Linear issue per confirmed bug (`linear-contract.md` bug template) into the existing parent/project; create the parent first if missing.
- **Filing does not authorize fixing.** Stop after filing and wait for an explicit fix request.

## Overlap contract (batch mode)

- Build a file-overlap graph across the issues. A connected component is atomic: the same file must not sit in two parallel sessions.
- Balance sessions by effort, severity, and area. Reduce parallelism when overlap makes the requested session count unsafe.
- Unknown paths are risks, not invented files.
- Investigate in parallel. Edit shared files in cascade.
- Session prompts name **repository-relative** ownership and the exact issue IDs.
- Do not start execution from the split plan; each session runs the micro-flow on its own issues.
- One shared branch, one atomic commit per issue (`Fixes TEAM-123`), one PR. Each issue stays revertable in isolation.
- No worktrees or clones per session (law 12); sessions work in the workspace checkout in cascade, or the user explicitly asks for isolation.

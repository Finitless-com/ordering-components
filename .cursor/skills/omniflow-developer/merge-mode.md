# Merge mode — promote PRs to a branch

Loaded by `omniflow-developer` when the user asks to merge, promote, cherry-pick, or send PRs to a branch.
Inputs may be a list of PRs (URLs or `#123`) or one or more Linear issues whose PRs must be resolved.
Chat stays Spanish. Commits, branch names, and PR bodies stay English.

Announce (Spanish): `Modo Merge: voy a promover PRs a <rama>.`

```
Resolve inputs → Plan table → [APPROVAL 1]
  → Integration branch in the workspace repo → cherry-pick in order → verify
  → Promotion PR → pr-reviewer-and-autofixer → security-review → [APPROVAL 2]
  → Merge: non-production on explicit yes · production only on "Mandar a production"
  → Linear close-out (release.md)
```

## Laws specific to this mode

1. **Workspace repos only.** Every git command runs inside a repo already open in the VS Code workspace (`git rev-parse --show-toplevel`). No worktrees, no clones, no temp dirs. If a PR belongs to a repo that is not in the workspace: stop, list it, ask the user to open it. Never clone.
2. **Never rewrite the source PRs.** Do not retarget, rebase, squash, or force-push an existing PR. Promotion happens on a **new** integration branch with a **new** PR.
3. **Cherry-pick, never `merge <branch>`,** when the target differs from the PR base. Merging `main` into `production` drags unrelated work along.
4. **No feature code.** The only allowed edits on the integration branch are conflict resolutions and the mechanical fixes that make the picked code compile against the target. Anything else is a new Omniflow run.
5. **Order matters.** Pick in the order the PRs were merged into their base (oldest `mergedAt` first). Open PRs go after merged ones, in the order the user gave.
6. **Stop on the first unresolved conflict.** Never `--skip`, never resolve by taking one side blindly, never `reset --hard`. Ask one question.
7. **Production still needs the phrase.** Target `production` (or the repo's documented production branch) merges only on the exact text `Mandar a production`. Any other target merges on an explicit Spanish yes to the merge question.

## 1. Resolve inputs

Read `CLAUDE.md` / `AGENTS.md` first for branch names, merge method, release docs, and Linear team.

For each input:

| Input | Resolution |
|---|---|
| PR URL or `#123` | `gh pr view <ref> --json number,title,url,state,baseRefName,headRefName,mergedAt,mergeCommit,commits,isDraft,statusCheckRollup,reviewDecision,body` (or the forge MCP) |
| Linear issue ID | Read the issue and its sub-issues. Collect PRs from: issue attachments (GitHub integration), links in description and comments, and PRs whose branch or title contains the issue ID (`gh pr list --search "<ID>" --state all`). Ask when zero or ambiguous |
| Linear parent with sub-issues | Resolve PRs of every sub-issue. Report sub-issues that have no PR |

Group PRs by repository. One integration branch and one promotion PR **per repo**. Repos run in cascade, never in parallel.

Determine the **target branch**:

- Stated by the user → use it verbatim.
- Not stated → ask (Spanish, multiple choice) with the repo's real branches, e.g. `main`, `staging`, `production`.

Determine **what to pick** per PR:

| PR state vs target | Commits to pick |
|---|---|
| Merged into its base with a merge commit | the merge commit with `-m 1` |
| Merged by squash | the single squash commit on the base |
| Merged by rebase | the rebased commit range, oldest first |
| Open, base == target | do not cherry-pick; merge the PR itself in step 5 (after checks and reviews) |
| Open, base != target | ask: merge to its base first, or pick its head commits now (`headRefName` range vs merge-base) |
| Already contained in target (`git branch --contains` / `git cherry`) | skip and report as already present |

Check dependencies: if a picked commit touches files also changed by a PR that is **not** in the list and not in the target, name it and ask whether to include it. Do not add it silently.

## 2. Plan table and Approval 1

Show, in Spanish, one table per repo before touching git:

```
Repo: <name>  ·  Rama destino: <target>  ·  Rama de integración: <integration branch>

| # | PR | Título | Estado | Commits a aplicar | Linear |
|---|----|--------|--------|-------------------|--------|
| 1 | #123 | ... | merged (squash) | abc1234 | ORD-45 |
| 2 | #130 | ... | open → base main | (merge directo) | ORD-47 |

Excluidos: <PR + motivo: ya está en destino / repo fuera del workspace / sin PR>
Dependencias detectadas: <PR faltante + archivos> o "ninguna"
```

Integration branch name: `release/<target>-<YYYY-MM-DD>` for production, `promote/<target>-<YYYY-MM-DD>` otherwise, or the repo's documented pattern. Add `-<slug>` when the user names the release.

**Hard gate (Spanish):** `Este es el plan de merge. ¿Confirmas los PRs, el orden y la rama destino para crear la rama de integración?`
No git writes before a yes. If the user changes the list, redo the table.

## 3. Integration branch and cherry-pick

In the workspace checkout of that repo:

```bash
git status --short                  # must be clean; otherwise stop and ask (law 11)
git fetch origin <target> <base...>
git switch -c <integration-branch> origin/<target>
```

For each PR in order:

```bash
git cherry-pick -x -m 1 <merge-sha>          # merge commits
git cherry-pick -x <sha> [<sha>...]          # squash or rebased commits
```

`-x` keeps the origin SHA in the message; do not drop it.

On conflict:

1. `git status --short` and the conflicting hunks.
2. If the resolution is mechanical and obvious (import order, adjacent lines, lockfile), resolve, `git add`, `git cherry-pick --continue`, and record it for the PR body.
3. Otherwise **stop** and ask (Spanish, one question): resolve as proposed / skip this PR / abort the run. Show the proposed resolution as a diff before applying it.
4. Never leave the repo mid-cherry-pick when the turn ends. `git cherry-pick --abort` only after the user picks abort.

Keep a log: PR → commits picked → conflicts → how resolved.

## 4. Verify the integration branch

- Run the repo's real verification commands from `CLAUDE.md` (install, lint, typecheck, unit tests, build). Fail → `systematic-debugging`; fix only what the pick broke; never edit unrelated code.
- `git diff origin/<target>...HEAD --stat` and confirm every changed file traces back to a PR in the table. Unexplained files mean a wrong commit was picked: fix before pushing.
- Do not run `security-review` here. Source PRs were reviewed against their own base. Conflict resolutions and combined behavior are reviewed once, on the promotion PR (section 5).

## 5. Promotion PR

```bash
git push -u origin <integration-branch>
gh pr create --base <target> --head <integration-branch> --title "<title>" --body-file <tmp>
```

Title: repo format if documented, else `Release <target> YYYY-MM-DD` or `Promote to <target>: <slug>`.

Body (English):

```markdown
## Promotion to `<target>`

Source: `<base>` → `<target>` · Integration branch `<name>`

## PRs included (in pick order)
- #123 <title> — picked `abc1234` — ORD-45
- #130 <title> — picked `def5678` — ORD-47

## Linear
- [ORD-45](<url>), [ORD-47](<url>)

## Conflicts
- `<file>` — <one line on how it was resolved> (or "None")

## Excluded
- #140 — already in `<target>` (or "None")

## Verification
- `<command>` → <result>
- security-review → <Pass / findings fixed>

## Not run
- <what and why>

## Rollback
Revert the merge commit of this PR on `<target>`. Each pick carries its source SHA (`-x`).
```

Open PRs whose base is the target and are **not** cherry-picked: they merge directly in step 6, listed in the body under `## Direct merges` with their check and review status.

Then, same turn (laws 13–14):

- Announce: `Ejecutando pr-reviewer-and-autofixer en <PR url>.` Launch it as a subagent with `model: composer-2.5` (Token rules in `SKILL.md`). Auto-fixes stay on the integration branch and only touch conflict-resolution code; anything deeper goes back to the source PR's author as a comment, not a fix here.
- Announce: `Ejecutando security-review en el PR <url> (Merge).` One subagent, same model, head vs `<target>`. This is the only security pass of the promotion.

**Hard gate (Spanish):** `El PR de promoción está arriba: <url>. Revisión post-PR: <aprobado / correcciones subidas>. Revisión de seguridad: <aprobado / correcciones subidas / bloqueado>. ¿Hago el merge a <target>?`

For a production target replace the question with: `Para publicar, escribe exactamente: Mandar a production.`

Linear: move the involved issues to **In Review**. No comment.

## 6. Merge

Preconditions with fresh evidence: CI green (`gh pr checks`), required reviews present, `security-review` Pass, target branch unchanged since the last pick (`git fetch` and compare; re-verify if it moved).

- Non-production target and an explicit yes → merge with the repo's documented method (`--merge` by default so the release stays one revertable commit; never `--rebase` for release branches). Direct-merge PRs first, then the promotion PR, or the order the user approved.
- Production target and exactly `Mandar a production` → same merge, then read `release.md` for release docs (CalVer, changelog, tags), then `launch.md` (ask the launch profile first, as in Launch only), then the Close section: leftover triage with **one** approval, Linear 100% / Done with read-back, retro on each parent.
- Merge failure → stop, report, do not force-push, do not close Linear.

After a non-production merge: Linear stays **In Review**. Say which environment received the code and paste the merged PR URL.

## Chat voice for this mode

The 4-line voice from `SKILL.md`. Line 1: `✅ Merge — <paso> → <target>`. Line 2 includes `Seguridad: <aprobado / bloqueado>`.

## Red flags — STOP

| Excuse | Reality |
|---|---|
| "I'll merge `main` into `production`, it's faster" | Cherry-pick only the approved PRs |
| "I'll retarget the PR to production" | New integration branch, new PR |
| "A worktree keeps things clean" | Workspace checkout only. Ask if the tree is dirty |
| "The conflict is easy, I'll take theirs" | Show the resolution or ask |
| "The PRs were already reviewed" | Conflict resolutions and combined diff were not. Run both reviews |
| "Merge to staging means they want production too" | Each target is its own approval; production needs the phrase |
| "The Linear issue has no PR attached, I'll guess the branch" | Search by ID; if still ambiguous, ask |
| "I'll fix that small bug while I'm here" | Out of scope. Note it, do not touch it |

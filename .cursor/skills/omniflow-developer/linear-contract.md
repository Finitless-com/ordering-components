# Linear contract

Loaded by `omniflow-developer` before any Linear create, update, or comment.
Use Linear MCP or Linear CLI. If neither works, paste the Markdown in chat and wait.

## Before creating anything

1. Resolve the team from repo docs (`FINDASH`, `FINMKT`, `ORD`, …). Confirm the product label when the repo requires it.
2. Search for an existing parent/project. Enrich it by appending; never clone it for a clean description.
3. Tag issues where the **fix lives**, not where the symptom shows.
4. One sub-issue per phase, parented, at **0%**, not Done.
5. After every write: read parent + children back. Confirm pre-existing description, demos, and images are intact. Paste the parent URL in chat.

## Preserve the existing description

Linear replaces `description` with the full string sent. Sending only the plan deletes demos, images, videos, and notes.

1. Read the issue. Copy the current description exactly, including image markdown, video links, and demo URLs.
2. A **new** issue with an empty description may use the template as its whole body.
3. An issue with content keeps it unchanged. Append the plan under a `## Omniflow` heading at the bottom. Do not rewrite, summarize, reorder, or drop anything above it.
4. If `## Omniflow` exists, update only that block (`Overall`, phase lines, status). Never append a second copy.
5. Read back. If any demo link or image is gone, restore the previous description before any other Linear write.

The sent `description` is always `previous body + plan`, never the plan alone.

## Parent template

```markdown
<existing description, unchanged>

## Omniflow
Mode: Feature | Bug | Hotfix | Chore | Hunt | Batch | Merge
Overall: 0%
Status: Waiting for plan approval

## Original request
> <verbatim user text, typos cleaned, never paraphrased>

## Launch
Profile: None | Slack | Dashboard + Slack | Marketing — <one-line reason>
Channels: <confirmed list, Marketing only>

## Phases
- [ ] Phase 1 — <name> — Módulos: uno — Modelo: Grok 4.7 medium — Mockup: no — Ejecución: Cloud — 0%
- [ ] Phase 2 — <name> — Módulos: varios — Modelo: Sonnet 5.5 — Mockup: sí — Ejecución: Local — 0%
- [ ] QA guiada — 0% (only when there are manual checks)
- [ ] QA — Fase N — <name> (added at QA, one per lane)
```

Each phase sub-issue keeps the phase name as its title. Its description starts with the same `Módulos`, `Modelo`, `Mockup`, and `Ejecución` lines from `plan.md` and `models.md`.

### Cloud-ready sub-issue body (required when `Ejecución: Cloud`)

Because `.omniflow/` is excluded from git, Cloud Agents cannot read local plan files. Every sub-issue marked `Ejecución: Cloud` must contain its full execution spec inside its Linear description:

```markdown
Repo: <org/repo-name>
Branch base: <main | develop>
Módulos: <uno|varios> · Modelo: <modelo> · Mockup: <sí|no> · Ejecución: Cloud
Expert skills: <exact list of skills to load from .cursor/skills/>

## Goal & Owned files
<phase goal and Definition of Done>
- Owned files (edit only these and their tests): <file list>

## Contracts
<the exact endpoints, JSON payloads, types, and mocks this phase provides or consumes>

## QA Matrix (TDD targets)
<this phase's QA matrix rows>

## Design / Tokens (if UI)
<tokens, components to reuse, and the approved mockup reference>
```

Copy each block verbatim from the plan file. Never write "see plan.md": the Cloud Agent cannot open it. Read the sub-issue back and confirm every block is present before triggering the agent.

The **QA guiada** sub-issue description is the guided checklist from the plan, one checkbox per check: `- [ ] <nombre> — Dónde · Haz · Espera`.

Each **QA lane** sub-issue (`QA — Fase N — <nombre>`, created at QA) is owned by one lane agent. Its description:

```markdown
Lane: L<n> · Data prefix: qa-L<n>-<TICKET>-
- [ ] <Caso> — <Pasos> — <Espera>

## Evidence
<one uploaded screenshot for the phase>
## Result
✔ <n> · 🔧 <n> · ✘ <n> · SHARED: <none / list>
```

The lane checks its boxes, uploads one screenshot (`prepare_file_upload`), and fills `Evidence` and `Result`. These are description updates, not comments. Only the owning lane or the orchestrator writes a lane sub-issue.

## Bug / report template

One issue per independent problem. On an existing issue, append; do not replace.

```markdown
# <symptom-focused title>

## Summary
## Reproduction
## Expected behavior
## Actual behavior
## Technical findings
- Scope:
- Location: <file:line only when confirmed>
- Root cause: <confirmed or "Not confirmed">
## Acceptance criteria
- [ ] <observable outcome>
- [ ] Relevant automated checks pass
## Evidence
<sanitized or "unavailable">
## Security notes
- Data exposed:
- Auth boundary:
- Attacker trigger:
```

**Sanitize before any attach:** strip tokens, cookies, auth headers, private URLs, customer/PII, extra terminal dumps, local home paths. If it cannot be redacted safely, stop and ask for a replacement. Keep confirmed facts separate from proposed fixes. Never invent a root cause for code you cannot see.

## Comments

Each issue gets at most two comments. Status changes are not comments. Exception: the `@cursor` trigger comment on a Cloud sub-issue (`models.md`, Cloud execution) does not count toward this limit.

| When | Where | What |
|---|---|---|
| Plan approved, before coding | Parent, once | Short plan |
| Phase sub-issue done and approved | That sub-issue, once | What that phase shipped |
| Launched to `main` or `production` | Parent, once | What shipped |

No comment on the parent when a phase finishes. No comment for a gate, PR opening, CI, security review, or "in review". An issue without sub-issues gets the plan comment and the launch comment only.

Plan comment (do not paste the whole blueprint if the description has it):

```
## Plan
- Phase 1 — <name> — Módulos: uno — Modelo: Grok 4.7 medium
- Phase 2 — <name> — Módulos: varios — Modelo: Sonnet 5.5
Launch: <profile>
```

Completion comment (PR and demo lines only when the links exist; every PR and issue id is a markdown link):

```
## Done
<what shipped, a few lines>

PR: [<repo>#<number>](<url>)
Demo: <url>
```

One completion comment covers the launch. No second note for the SHA or the other environment. Read the comment back after writing it.

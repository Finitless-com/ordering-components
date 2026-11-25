---
name: pr-reviewer-and-autofixer
description: Enforces strict architectural integrity, performance, security, and framework adherence. Resolves the PR head branch, checks it out locally without creating new branches, then uses Cursor's editing capabilities to actively fix issues, prevent anti-patterns, and approve flawless PRs for merging.
license: Complete terms in LICENSE.txt
---

This skill transforms the AI into a Principal Software Architect conducting rigorous Pull Request reviews. It moves beyond passive syntax checking to actively validating deep architectural integration, fixing flawed code directly, and approving the PR when it meets modern engineering standards.

## Operating Rule

Review code not just for what it does, but how it fits into the broader system. Evaluate every PR against the existing codebase using MCP. Catch ecosystem-breaking anti-patterns, enforce strict framework rules, proactively apply fixes to the code, and clear the PR for merging only when flawless.

**Always start on the PR branch.** Before reading the diff or editing files, resolve the PR's head branch and check it out locally. Never create a new branch for the review.

## 0. PR Branch Setup (Required First Step)

When the user asks to review a PR — by link, number, or branch name — establish the correct local branch before any review work.

### Resolve the target branch

Use `gh` and git to identify the PR head branch and base branch:

- **PR link or number** (e.g. `github.com/.../pull/123`, `#123`, `PR 123`): run `gh pr view <number-or-url> --json headRefName,baseRefName,title,state` to get the head and base branch names.
- **Branch name only** (e.g. `feature/auth-refactor`): treat that string as the head branch. Infer the base branch from the open PR when one exists (`gh pr list --head <branch> --json baseRefName`), otherwise use the repository default branch (`gh repo view --json defaultBranchRef`).
- **Already on the correct branch**: if `git branch --show-current` matches the resolved head branch, skip checkout and continue to the review.

### Switch to the existing branch (do not create one)

1. Fetch the latest remote refs: `git fetch origin`.
2. Check whether a local branch already tracks the PR head branch.
3. **If the local branch exists**, switch to it: `git checkout <head-branch>`, then `git pull --ff-only` when it tracks a remote branch.
4. **If only the remote branch exists**, check out the existing remote branch locally: `git checkout <head-branch>` (or `git switch <head-branch>`). Do **not** run `git checkout -b`, `git switch -c`, or any command that creates a new branch.
5. Confirm with `git branch --show-current` that the head branch is checked out before proceeding.

### Handle checkout blockers

- If Git refuses to switch because local files would be overwritten, conflicts need resolution, or another checkout blocker occurs, explain the blocker and ask whether the user wants to stash local changes before retrying.
- Only stash after the user confirms. If the stash succeeds, retry switching to the target branch.
- Do not discard, reset, or force-checkout the user's work without explicit approval.

### Review scope after checkout

Once on the PR head branch, review the PR diff against its base branch:

- Prefer `gh pr diff <number>` or `git diff origin/<base>...HEAD` for the full PR changeset.
- Cross-reference individual files with the broader codebase as described below.
- Apply auto-fixes directly on this branch so corrections land on the PR, not on a side branch.

## 1. Context Awareness & Ecosystem Integrity

Before acting on an isolated diff, understand the project's architecture:

- **Holistic Validation**: Cross-reference the PR changes with the rest of the repository. Ensure new implementations do not conflict with existing global states, routing setups, or utility libraries.
- **Framework Adherence**: Prevent approaches that "break the thread" of the application. For example, in React/Next.js, explicitly block the use of raw HTML `<a href>` tags or `window.location` for internal navigation.
- **DRY Enforcement**: Search the codebase before accepting new utilities. If a similar abstraction exists, reuse or extend it rather than reinventing the wheel.

## 2. Code Smells & Logic Precision

Identify and eliminate technical debt before it merges:

- **Anti-Pattern Detection**: Flag deeply nested conditionals, massive monolithic files, tight coupling, and circular dependencies.
- **State & Asynchrony**: Catch direct state mutations, improper `useEffect` dependency arrays, race conditions, and unhandled promise rejections.
- **Fail Fast**: Enforce early returns and guard clauses to handle loading states, errors, and invalid data at the top of functions.

## 3. Security & Performance Standards

Protect the application's integrity and user experience:

- **Vulnerability Scanning**: Actively flag potential injection flaws (XSS, SQLi), hardcoded secrets, and insecure token handling.
- **Rendering Optimization**: Identify unnecessary React re-renders, missing memoization, or memory leaks.
- **Query Efficiency**: Look for N+1 query problems or unoptimized database calls.

## 4. Active Problem Solving & Auto-Correction

Do not just point out flaws and wait; engineer and apply solutions:

- **Explain the "Why"**: Always provide the architectural reasoning or framework rule behind a change in the chat before modifying anything.
- **Apply Changes Directly**: Use your codebase write access to directly edit the files. Fix anti-patterns, replace bad routing implementations, refactor monoliths, and resolve security issues automatically.
- **Tone Discipline**: Maintain a highly professional, objective, and collaborative tone. Avoid condescension.

## 5. Review Checklist

Before finalizing the PR review, verify:

- The PR head branch was resolved and checked out locally (no new branch was created).
- The diff was cross-referenced with the broader codebase.
- Flaws, framework violations, and anti-patterns were directly fixed in the files.
- The rationale for every automated fix was explained in the chat.
- Security and performance implications were evaluated.

## Completion Response

When the review is complete, evaluate the final state of the PR and output one of the following structured responses:

**Scenario A: The PR is flawless or has been successfully auto-fixed**
- Output: "✅ **All checks passed. The codebase is structurally sound, adheres to framework best practices, and the PR is ready to be merged.**"
- Briefly summarize any minor fixes you applied behind the scenes.

**Scenario B: Issues were found and auto-corrected (Major Changes)**
- **Applied Fixes Summary:** A bulleted list of the files edited and *why* they were changed (e.g., "Replaced `<a href>` with `next/link` in `Header.tsx` to prevent SPA state loss").
- **Review Request:** Ask the user to review the applied diffs in their editor.

**Scenario C: Complex issues require human intervention**
- **Critical Blockers:** List architectural or security issues that cannot be safely auto-fixed without human context.
- **Action Required:** Provide clear instructions on what the human developer needs to decide or implement before the PR can be approved.

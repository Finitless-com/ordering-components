# Phase 6: Production and Phase 8: Close

Expert skills: `changelog-generator`, only if the repo uses a changelog.

## Production

Runs only after the exact phrase `Mandar a production`. "ship it", "merge", or "deploy" get the reply: `Para publicar, escribe exactamente: Mandar a production.`

1. Confirm with fresh evidence: the PR is approved, CI is green, and the PR `security-review` passed.
2. Merge to the integration branch (`main`) with the repo's required merge method.
3. If the repo uses a production branch, open or update the `main` → `production` release PR (or the Merge-mode promotion PR) and merge it with the documented method.
4. Follow the repo's release docs when they exist (CalVer, changelog, tags).
5. Verify the deploy reached the target environment when the repo exposes a way to check.
6. Go to `launch.md` with the approved profile. Profile `None` skips straight to Close.

If the production merge fails: stop, debug, do not force-push, and do not close anything in Linear.

## Close

Runs after the launch (or right after production when the profile is `None`). For `Close project` without production, run steps 1 to 3 only. Never close a container whose work never started.

1. Triage leftovers in **one** table, get **one** approval, then execute:

   | Case | Action |
   |---|---|
   | Done with evidence | Mark Done |
   | Superseded | Cancel, with the reason in the body |
   | Duplicate | Mark duplicate and link the survivor |
   | Follow-up without a date | Leave it open outside this parent, or ask where it should live. Copy its DoD verbatim |
   | Follow-up with a date | Move it with the due date |
   | Live child of a closing parent | Detach it first. Never close by inheritance |

2. Set the parent and completed children to 100% and **Done**. Write one completion comment on the parent (`linear-contract.md`), including the launch links. Read the statuses back.
3. Write a short retro on the parent: what was delivered, what was not, cancellations, and follow-ups. Do not polish failures away.
4. Delete `.omniflow/<TICKET>/` only if the user agrees. Clean up the local branch only if the repo workflow says so.
5. If Marketing repos were opened for the launch, remind the user once to close them.

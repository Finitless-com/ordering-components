# Phase 7: Launch

Uses the launch profile approved in the plan. Nothing is published or sent without a chat preview and an explicit "envía" (law 12). Model: `Composer 2.5` for Slack text; a new chat for Marketing (`models.md`).

| Profile | Drafts (start when the PR opens) | After production |
|---|---|---|
| `None` | — | Go to Close |
| `Slack` | — | Slack message |
| `Dashboard + Slack` | Dashboard announcement PR | Merge it, then the Slack message |
| `Marketing` | `ordering-launch` package | Marketing approves and publishes, then the Slack message |

**Launch only** (no plan): ask the profile with one multiple-choice question, recommended option first, before any draft.

## Drafts

### Dashboard announcement

Repo `ordering-dashboard`, registry `src/@/components-dashboard/src/utils/featureAnnouncements.js`. Reuse the feature's announcement ID when one exists. Write both locales, `until`, `when(context)`, and the permission check. Open a **draft** PR. Follow the Dashboard section of `ordering-launch`'s `references/destinations.md`.

### Marketing (`ordering-launch`)

**REQUIRED SUB-SKILL:** `ordering-launch`. Load it from the installed plugin or from `plugins/ordering-launches/skills/ordering-launch/` in `ordering-internal-plugins-and-skills`.

1. Ask the user once to open these repos in this window (multi-root), and to close them when the launch ends:
   `orderingco-website-blog`, `ordering-docs`, `ordering-dashboard` (only the ones the confirmed channels need).
2. Start a new chat for the launch. It begins with: the Linear parent URL, `@.omniflow/<TICKET>/plan.md`, and the sentence `Canales confirmados: <lista del plan>`. The plan's confirmed channels count as the developer's explicit selection, so `ordering-launch` does not ask again.
3. `ordering-launch` prepares the drafts, the draft PRs per repo, PostHog measurement, and pre-announcement QA. Omniflow does not duplicate any of it.
   Use the repos opened in this window as the checkout `ordering-launch` asks for. Do not create worktrees or clones. In each repo, check `git status --short` first, then branch from its updated default branch. If that repo's tree is dirty, stop and ask.
4. **Parallel destinations.** The launch chat first writes the ficha and the ES/EN content once (`ordering-launch` steps 5 and 6). Then, for the integration step, it launches one Task subagent per destination in **one message**:

   | Lane | Repo | Task `model` |
   |---|---|---|
   | Marketing page | `orderingco-website-blog` | `claude-sonnet-5-5-high` |
   | Guide | `ordering-docs` | `composer-2.5` |
   | Dashboard notice | `ordering-dashboard` | `composer-2.5` |
   | Measurement (only if events are missing) | the feature repo | `composer-2.5` |

   Each prompt holds: the release ID, the ficha, the approved content for that piece only, the repo path, and the matching section of `ordering-launch`'s `references/repo-integration.md` and `references/destinations.md`. Each lane opens one **draft** PR in its repo, reads it back, and returns only: `PR URL · draft state · preview route · checks → result · blockers`. Lanes never merge, publish, or touch another repo.
   After all lanes return, the launch chat runs pre-announcement QA once and checks the cross-links between pieces (page → guide, dashboard → page).
5. Gate: one line per piece (`<canal> — <link ES/EN o PR> — <estado>`), then the 4-line voice. Its question is: `¿Apruebas estas piezas para que marketing las revise?`

Marketing approves and sends emails. The agent never publishes a marketing piece or sends an email.

## Slack: `#product-launches`

Destination: `#product-launches` (`C0C6D5S3TE2`). Verify the Slack connector and the channel with `slack_search_channels` before sending. If the connector fails, stop and ask to reconnect. Do not switch to another route.

Write it only after the code is in production (or on the environment the user names). Use Slack mrkdwn: `*bold*`, `•` bullets, links as `<url|texto>`. Spanish.

```
:rocket: *<Producto o área>: <qué cambió, en una frase>*

Ya en producción:
• *<Área>:* <cambio visible para el usuario> (<TEAM-123>).
• *<Área>:* <cambio visible para el usuario>.
Pruébalo: <url|texto corto>, <pasos concretos y proyecto de prueba>.
PRs: <url|repo #N> y <url|#N>.
```

Rules:

- The title says the product or app and the user-visible change. Do not use internal jargon.
- One bullet per user-visible change, with its Linear ids in parentheses. Drop any bullet without a fact behind it.
- `Pruébalo:` only when a real URL or screen and test project exist. Otherwise omit the line.
- `PRs:` with every real PR merged for this change.
- Optional last line: what is still pending and where it is tracked.
- Never leave a placeholder or bracket in the final text.

Preview it in chat inside a code block, followed by one line:
`👉 ¿Lo envío a #product-launches? (envía / cambia: …)`

Send only on "envía". Read the posted message back and paste its link. When the user asks to also DM someone (`avísale a X`), send the same approved text to that person.

## After launch

Record each piece's state as Draft PR, Published, or Sent, with its link, in the plan file and on the Linear parent. Then go to the Close section of `release.md`.

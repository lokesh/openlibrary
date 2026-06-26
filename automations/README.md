# Lokesh's Open Library automations

Personal routines to cut manual GitHub work for the front-end / design-system lead role
on `internetarchive/openlibrary`. **Nothing here runs in the official repo.** These are
private jobs that run on your own account, read GitHub, and draft email to you — they
push nothing upstream unless you explicitly opt in.

## How to run these: Claude Code Routines

Each file in `playbooks/` is a **self-contained prompt** for a [Claude Code
Routine](https://code.claude.com/docs/en/routines). Routines run on Anthropic's cloud
**even when your laptop is closed**, on your account only.

**Setup (once per playbook):**
1. Go to https://claude.ai/code/routines → **New routine**.
2. Paste the playbook file's contents as the prompt.
3. Add the repository named in the playbook header (read-only for the digests; your fork
   `lokesh/openlibrary` for the pot-fixer).
4. Keep the **Gmail** connector; remove the others.
5. Set the **Schedule** trigger from the playbook header (min cadence is 1 hour).
6. **Create.** Use **Run now** to test it immediately.

By default a routine can only push to `claude/`-prefixed branches, so the official repo
is never modified. (`/schedule` from a terminal session does the same thing
conversationally — but it's disabled inside web sessions.)

**Prefer fully local?** Create the routine as **Local** in the desktop app
([Desktop scheduled tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks)), or
run `claude -p "$(cat automations/playbooks/<file>.md)"` from a cron/launchd job against
a local clone. Local jobs only fire while your machine is on — fine for the pot-fixer,
not ideal for the morning digests, which is why those belong in the cloud.

## The playbooks

| Playbook | Cadence | Removes |
|---|---|---|
| `playbooks/daily-review-digest.md` | weekday morning | Hunting GitHub for "what front-end PR needs me" |
| `playbooks/weekly-pr-shepherd.md` | Monday morning | Babysitting your own ~12 open PRs / stale drafts |
| `playbooks/design-review-sweep.md` | weekday mid-morning | The repetitive design-system review of newcomer PRs |
| `playbooks/messages-pot-fixer.md` | daily / on demand | The recurring `messages.pot` merge-conflict tax |

## Why these four (and not more)

The repo **already automates** a lot — don't rebuild it: `new_pr_labeler` /
`pr_update_labeler` (PR labeling), `issue_refinement` (AI issue refinement),
`pm_stale_ticket_labeler`, `new_comment_digest`, `weekly_status_report` (team Slack
digest). And CI **already enforces** the mechanical design rules via `.stylelintrc.json`
(no hex / named colors; tokens required for `color`/`background-color`/`z-index`/
`font-family`). So these four deliberately fill the *gaps*: a personal review queue, your
own-PR hygiene, the *judgment* part of design review the linters can't do, and the
i18n conflict tax — all delivered to your inbox, not a team channel.

## Constraints worth knowing

- **Gmail = drafts, not sends.** Each routine drafts an email; you open it to read.
- **Routines act as you.** Commits/comments use your GitHub identity; connector actions
  use your linked accounts. Scope each routine's repos/connectors to what it needs.
- **Daily run cap.** Routines share a per-account daily run allowance; one-off runs don't
  count against it. See claude.ai/code/routines for current limits.
- **Design review is a daily sweep, not per-PR.** A true per-PR GitHub trigger needs the
  Claude GitHub App installed on `internetarchive/openlibrary` (org-admin only) — that's
  the "official repo" path you're avoiding. The sweep reads the day's PRs and drafts
  notes instead.

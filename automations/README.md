# Lokesh's Open Library automations

Personal routines to cut manual GitHub work, scoped to the front-end / design-system
lead role. Built after an audit of @lokesh's activity on `internetarchive/openlibrary`.

## What the repo ALREADY automates (don't rebuild these)

The repo has a mature automation suite in `.github/workflows/`. Before adding anything,
note these already exist:

| Workflow | Does |
|---|---|
| `new_pr_labeler` / `pr_update_labeler` | Auto-labels PRs, assigns lead from linked issue |
| `issue_refinement` (agentic) | AI refines + labels new issues from staff |
| `pm_stale_ticket_labeler` | Flags stale tickets |
| `new_comment_digest` | Digest of new contributor comments |
| `weekly_status_report` | Scheduled **Slack** digest for leads |
| `codegen_api_docs` | Auto-generates web-component API docs |

And **CI already enforces** the mechanical design rules (`.stylelintrc.json`):
no hex / named colors, and tokens-required for `color`/`background-color`/`z-index`/
`font-family`. A bot re-checking those would be noise.

## What's net-new here

### 1. `design_review.md` — agentic PR design-system reviewer  *(durable, runs in Actions)*

Lives at `.github/workflows/design_review.md`. Follows the repo's gh-aw agentic pattern
(same as `issue_refinement.md`). On front-end PRs it posts the **judgment** feedback the
linters can't: "use `<ol-button>`", "spacing should use a token", "no new jQuery", BEM,
a11y basics. This removes the most repetitive part of Lokesh's manual reviews.

**Activation:** like the other agentic workflows, the `.md` must be compiled to a
`.lock.yml` (the team uses [`gh aw`](https://github.com/githubnext/gh-aw):
`gh aw compile design_review`). It only runs once merged to `internetarchive/openlibrary`,
so it goes up as a normal PR for staff review.

### 2–4. Gmail digest routines  *(run as scheduled Claude Code-on-web sessions)*

The existing `weekly_status_report` posts to a **team Slack** — these three are
**personal** triage aids delivered to lokesh.dhakar@gmail.com. They're written as
prompt playbooks in `playbooks/` to paste into a scheduled Claude Code session
(Settings → schedule, on this repo). Each run produces a **Gmail draft** (the Gmail
integration can draft but not auto-send — open the draft to read it).

| Playbook | Cadence | Removes |
|---|---|---|
| `playbooks/daily-review-digest.md` | weekday morning | Hunting GitHub for "what front-end PR needs me" |
| `playbooks/weekly-pr-shepherd.md` | Monday morning | Babysitting your own ~12 open PRs / stale drafts |
| `playbooks/messages-pot-fixer.md` | on demand / daily | The recurring `messages.pot` merge-conflict tax |

## Constraints worth knowing

- **Gmail = drafts, not sends.** Each routine drafts an email; you open it to read.
- **In-session crons are ephemeral.** Claude's `CronCreate` jobs die with the session
  and expire in 7 days — fine for a live demo, not for standing automation. For durable
  scheduling use Claude Code-on-web scheduled sessions (digests) or GitHub Actions
  (the design reviewer).
- **Scope.** The Gmail routines only read GitHub + draft email. They never push or
  comment unless you change the playbook to allow it.

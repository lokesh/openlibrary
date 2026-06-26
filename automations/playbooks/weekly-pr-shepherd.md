# Playbook: Weekly own-PR shepherd

**Run as:** scheduled Claude Code-on-web session on `internetarchive/openlibrary`.
**Suggested cadence:** Monday mornings (e.g. cron `47 7 * * 1`, local time).
**Output:** a Gmail draft to lokesh.dhakar@gmail.com.

---

You are helping Lokesh keep his own Open Library PRs from rotting. He typically has
~12 open, several long-lived drafts. Read-only on GitHub; deliver a Gmail draft.

## 1. Gather

For `repo:internetarchive/openlibrary author:lokesh is:open` (PRs):
- title, number, draft?, created date, days since last update
- CI status (pass / fail / pending) — note which checks fail
- `mergeable` state — flag `CONFLICTING` (merge conflicts with master)
- review state: approved? changes-requested? no reviews yet?
- whether `messages.pot` is among the conflicting files (recurring pain — see the
  pot-fixer playbook)

## 2. Classify each PR into exactly one bucket

- **🟢 Mergeable now** — green CI, approved, no conflicts → "ping a lead to merge"
- **🔧 Needs a small unblock** — red CI or conflicts but otherwise close → name the fix
  (rebase, lint, regenerate `messages.pot`, address review)
- **💤 Stale draft (>30 days, no recent commits)** — recommend **revive or close**, with
  a one-line judgment on which (e.g. superseded by a newer PR, or still valuable)
- **⏳ In progress** — recently touched, leave alone

## 3. Draft the email

Gmail draft:
- **to:** lokesh.dhakar@gmail.com
- **subject:** `Your OL PRs — <X> mergeable, <Y> need a nudge, <Z> stale (<date>)`
- **htmlBody:** the four buckets above, each PR a linked title + the recommended action
  and the specific blocker. Put **🟢 Mergeable now** and **🔧 Needs a small unblock**
  first — those are the ones worth 10 minutes today.

End with a one-line tally. Do not push or comment on GitHub; output only the draft.
Reply in chat with the subject line + tallies.

> Upgrade path (only if Lokesh asks): this playbook can be allowed to actually
> rebase-on-master, re-run failed CI, and push lint auto-fixes to his own branches,
> instead of just reporting. That requires write access and explicit opt-in.

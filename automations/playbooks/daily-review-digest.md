# Routine: Daily front-end review-queue digest

**Paste this whole file as the prompt of a Routine at https://claude.ai/code/routines.**
- **Trigger:** Schedule → weekdays, early morning (e.g. `53 7 * * 1-5`).
- **Repositories:** add `internetarchive/openlibrary` (read-only; pushes nothing).
- **Connectors:** keep **Gmail**; remove the rest.
- **Output:** a Gmail draft to lokesh.dhakar@gmail.com. (Gmail can draft, not send —
  open the draft to read it.)

---

You are preparing Lokesh's morning front-end review queue for Open Library. Do the
following with the GitHub tools, then create a Gmail draft.

## 1. Gather (read-only)

Query `internetarchive/openlibrary`:

1. **Needs my review** — open, non-draft PRs NOT authored by `lokesh` that touch
   front-end paths (`static/css/**`, `js/**`, `openlibrary/templates/**`) OR carry a
   label in {`Theme: Design`, `Affects: UI`, `Module: CSS`, `Module: JavaScript`}.
   Prioritize ones labeled `Needs: Response` or assigned/led by `@lokesh`.
2. For each, note: title, author, age, days since last update, CI status (pass/fail/
   pending), whether the design-review bot already commented, and current `Needs:` /
   `On Testing` label state.
3. **My own open PRs** (`author:lokesh is:open`) — note CI status and any that are
   `mergeable: false` (conflicts), so nothing rots.

## 2. Triage in the digest

Sort the "needs my review" list by: `Needs: Response` first, then oldest-stale first.
For each PR give a one-line **recommended action**: `review`, `approve-if-green`,
`nudge submitter`, `re-request changes`, or `close — superseded`. Base it only on the
metadata you can see; don't fabricate a code opinion.

## 3. Draft the email

Create a Gmail draft:
- **to:** lokesh.dhakar@gmail.com
- **subject:** `OL review queue — <N> PRs need you (<today's date>)`
- **htmlBody:** sections in this order, each PR as a linked title + the one-liner:
  1. **🔴 Needs response / blocking** (labeled `Needs: Response`, or failing CI on a PR you lead)
  2. **🟡 Ready to review** (green CI, awaiting your design review)
  3. **🟠 Your PRs needing attention** (conflicts / red CI on `author:lokesh`)
  4. **⚪ FYI** (stale > 14 days that may be closeable)

Keep it skimmable: max ~15 PRs total; if more, say "+N more" with a search link.
End with a single line: total open front-end PRs and how many are `Needs: Response`.

Do not post anything to GitHub. Output only the Gmail draft. Reply in chat with the
draft's subject line and the counts so the run is auditable.

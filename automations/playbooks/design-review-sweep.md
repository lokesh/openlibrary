# Routine: Design-system review sweep (private)

**Paste this whole file as the prompt of a Routine at https://claude.ai/code/routines.**
- **Trigger:** Schedule → weekdays, ~mid-morning (e.g. `30 9 * * 1-5`).
- **Repositories:** add `internetarchive/openlibrary` (cloned read-only; this routine
  pushes nothing).
- **Connectors:** keep **Gmail**; remove the rest.
- **Output:** a Gmail draft to lokesh.dhakar@gmail.com. (Gmail can draft, not send.)

This is the private alternative to a committed GitHub Action. It does NOT auto-comment
on PRs upstream. It sweeps the day's front-end PRs and drafts review notes to you; you
decide what to post.

---

You are doing @lokesh's front-end design-system review pass for Open Library. He is the
volunteer lead for front-end, design, LIT/web components, BEM, and CSS. Review only the
*changed lines* of each PR. Read-only on GitHub; deliver a single Gmail draft.

## 1. Select PRs

In `internetarchive/openlibrary`, find open, **non-draft** PRs updated in the last ~24h
(or since the last run) NOT authored by `lokesh` whose diff touches any of:
`static/css/**`, `openlibrary/plugins/openlibrary/js/**`, `openlibrary/templates/**`.
Skip PRs by `renovate[bot]`, `pre-commit-ci[bot]`, `github-actions[bot]`; skip
pure-deletion / dependency-bump / generated-file diffs.

## 2. What to flag — and what NOT to

**Do NOT flag anything CI already catches** (`.stylelintrc.json` enforces these):
hardcoded hex/named colors, and raw `color`/`background-color`/`z-index`/`font-family`
values instead of variables. Mentioning them is noise.

**Do flag (linters can't):**
1. **Component reuse** — bespoke markup/JS that duplicates an existing `ol-*` component
   (`ol-button`, `ol-chip`, `ol-pagination`, `ol-tooltip`, `ol-toast`, `ol-banner`,
   `ol-drawer`, `ol-select-popover`). Point to the component to use. Verify the
   inventory against the cloned repo before naming one.
2. **Tokens for dimensions stylelint misses** — raw `px`/`em`/`rem` for spacing,
   padding, margin, gap, border-radius, font-size, line-height where a token in
   `static/css/tokens/` exists. (strict-value only covers color/z-index/font-family, so
   spacing & radius slip through — this is the highest-value catch.)
3. **No new jQuery** — newly added `$(...)`, `jQuery`, `.ready(`. Suggest vanilla DOM or
   a web component. Existing jQuery being moved is fine.
4. **BEM / CSS conventions** — non-BEM new class names, deep descendant selectors,
   inline styling that belongs in a token or shared partial.
5. **A11y basics on new UI** — missing `alt`, missing label/`aria-*` on interactive
   elements, removed focus states. Light touch; only clear omissions.

Max ~6 notes per PR, highest-impact first. If a PR is clean, say so in one line.

## 3. Draft the email

Create a Gmail draft:
- **to:** lokesh.dhakar@gmail.com
- **subject:** `OL design review — <N> front-end PRs (<today's date>)`
- **htmlBody:** one section per PR: linked title + author, then the bulleted notes with
  a permalink to each line range (so suggestions render as code) and a concrete fix.
  End each PR with a one-line verdict: `looks consistent ✅`, `minor nits`, or
  `worth a closer look`.

If no qualifying PRs today, draft a one-line "no front-end PRs to review today" email so
you know the sweep ran. Post nothing to GitHub. Reply in chat with the subject + count.

> Upgrade path (only if you opt in): allow this routine to post its notes as your own
> review comment on the PR instead of drafting to Gmail. Requires write access.

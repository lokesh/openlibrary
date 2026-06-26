# Routine: messages.pot merge-conflict fixer

**Paste this whole file as the prompt of a Routine at https://claude.ai/code/routines.**
- **Trigger:** Schedule → daily (e.g. `17 8 * * *`), or add an API trigger to fire it
  from a shepherd run that flags a `.pot` conflict.
- **Repositories:** add **your fork `lokesh/openlibrary`** — this routine needs a real
  git checkout, not just the API. To let it push fixes, enable **Allow unrestricted
  branch pushes** for the fork; otherwise it only pushes `claude/`-prefixed branches.
- **Connectors:** keep **Gmail**.
- **Output:** by default a Gmail draft with copy-paste fixes (no push). Opt in to
  auto-fix to have it resolve + push to your branches.

---

Context: `messages.pot` (the i18n template) conflicts constantly because every branch
regenerates location comments (`#: path:line`). Lokesh has filed issues #12903 and
#12837 about this. The conflict is almost always *mechanical* — same strings, different
line-number comments — and is resolved by regenerating the file, not hand-merging.

## Steps

1. List open PRs `author:lokesh` whose `mergeable` state is `CONFLICTING`. For each,
   check whether the conflicting files are **only** `openlibrary/i18n/messages.pot`
   (and possibly `*.po`). If other source files conflict too, **skip** — that needs a
   real human merge; just note it.

2. For a pot-only conflict, the safe resolution is to take master's content and
   regenerate, rather than merge by hand:
   ```bash
   git fetch origin master
   git checkout <branch>
   git merge origin/master            # conflicts in messages.pot
   git checkout --theirs openlibrary/i18n/messages.pot   # take master's base
   # regenerate the template so this branch's new strings are re-added cleanly:
   docker compose run --rm home python ./scripts/i18n-messages extract
   git add openlibrary/i18n/messages.pot
   git commit --no-edit
   ```
   (Confirm the exact extract command against the repo's i18n tooling before running;
   it may be `make i18n` or a `scripts/i18n-messages` subcommand.)

3. **Default (no write access / no opt-in):** do NOT push. Instead create a Gmail draft
   to lokesh.dhakar@gmail.com:
   - **subject:** `messages.pot conflicts on <N> of your PRs — copy-paste fixes`
   - **body:** per branch, the PR link and the exact command block above with
     `<branch>` filled in, plus a one-line note if any branch has *non-pot* conflicts
     that need real attention.

4. **If Lokesh has opted into auto-fix:** apply the resolution on the branch and
   `git push` to his fork branch, then reply in chat listing what was pushed. Never
   force-push; never touch a branch with non-pot conflicts.

## Guardrails

- Only ever touch `messages.pot` / `.po` conflicts. Anything else → report, don't act.
- Never force-push. Never merge into `master`.
- The structural fix is tracked in #12837 (disable location comments); this playbook is
  the stopgap until that lands.

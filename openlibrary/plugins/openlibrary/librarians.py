"""Librarian tool pages: the "What is this?" page for editing mode and the
review page a queued batch links to. JSON lives in openlibrary/fastapi/librarians.py.
"""

from infogami.utils import delegate
from infogami.utils.view import render_template
from openlibrary import accounts
from openlibrary.core import batch_ops
from openlibrary.core.librarian_batches import LibrarianBatches


def _librarian():
    user = accounts.get_current_user()
    return user if (user and user.is_librarian_or_higher()) else None


class librarians_editing(delegate.page):
    path = "/librarians/editing"

    def GET(self):
        user = accounts.get_current_user()
        return render_template(
            "librarians/page",
            "librarians/editing.html.jinja",
            is_librarian=bool(user and user.is_librarian_or_higher()),
            is_super=bool(user and user.is_super_librarian_or_higher()),
            actions=[(a.name, a.label, sorted(a.applies_to), a.super_only) for a in batch_ops.ACTIONS.values() if a.name in batch_ops.ENABLED_ACTIONS],
        )


class librarians_batch(delegate.page):
    path = r"/librarians/batch/(\d+)"

    def GET(self, batch_id):
        user = _librarian()
        if not user:
            return render_template("permission_denied", "/librarians/batch", "Librarians only")
        batch = LibrarianBatches.get(int(batch_id))
        if not batch:
            raise delegate.notfound()
        return render_template(
            "librarians/page",
            "librarians/batch.html.jinja",
            batch=batch,
            is_super=bool(user.is_super_librarian_or_higher()),
            username=user.key.split("/")[-1],
        )


def setup():
    pass

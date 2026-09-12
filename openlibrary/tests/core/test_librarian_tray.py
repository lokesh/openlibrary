"""Tests for openlibrary.core.librarian_tray against a dict-backed fake store."""

from unittest.mock import MagicMock

import pytest

from openlibrary.core import librarian_tray as tray
from openlibrary.utils.request_context import site


@pytest.fixture(autouse=True)
def fake_store():
    store = {}
    s = MagicMock()
    s.store.get = lambda key, default=None: dict(store[key]) if key in store else default
    s.store.__setitem__ = lambda self_, key, doc: store.__setitem__(key, doc)
    site.set(s)
    return store


def test_add_remove_clear_roundtrip(fake_store):
    view = tray.add_items("lokesh", ["/works/OL1W", "/books/OL1M", "/works/OL1W"])
    assert [it["key"] for it in view["items"]] == ["/works/OL1W", "/books/OL1M"]
    assert fake_store["/people/lokesh/librarian-tray"]["type"] == "librarian-tray"
    view = tray.remove_items("lokesh", ["/works/OL1W"])
    assert [it["key"] for it in view["items"]] == ["/books/OL1M"]
    assert tray.clear("lokesh")["items"] == []


def test_notes_done_and_saved_trays():
    tray.add_items("lokesh", ["/works/OL1W"])
    view = tray.update_item("lokesh", "/works/OL1W", note="check the isbn", done=True)
    assert view["items"][0]["note"] == "check the isbn"
    assert view["items"][0]["done"] is True
    view = tray.save_as("lokesh", "Conrad dupes")
    saved_id = view["saved"][0]["id"]
    tray.clear("lokesh")
    assert tray.get_tray("lokesh")["items"] == []
    view = tray.load_saved("lokesh", saved_id)
    assert [it["key"] for it in view["items"]] == ["/works/OL1W"]
    view = tray.rename_saved("lokesh", saved_id, "Conrad")
    assert view["saved"][0]["name"] == "Conrad"
    assert tray.delete_saved("lokesh", saved_id)["saved"] == []


def test_tray_caps_items():
    keys = [f"/works/OL{i}W" for i in range(tray.MAX_ITEMS + 20)]
    view = tray.add_items("lokesh", keys)
    assert len(view["items"]) == tray.MAX_ITEMS

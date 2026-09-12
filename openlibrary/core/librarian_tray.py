"""The librarian tray: a persistent, per-account working set of records.

Stored as one infobase store document per user, the same mechanism as account
preferences, so it needs no table and no migration. Not a list: lists are
public, versioned documents and would spam the edit feed.

Document shape::

    {
      "type": "librarian-tray",
      "items": [{"key": "/works/OL1W", "added_at": "...", "note": "", "done": false}, ...],
      "saved": [{"id": "abc123", "name": "Conrad dupes", "items": [...], "created": "..."}, ...],
    }
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Any

from openlibrary.utils.request_context import site

MAX_ITEMS = 500
MAX_SAVED = 50


def _key(username: str) -> str:
    return f"/people/{username}/librarian-tray"


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def empty_tray() -> dict[str, Any]:
    return {"type": "librarian-tray", "items": [], "saved": []}


def get_tray(username: str) -> dict[str, Any]:
    doc = site.get().store.get(_key(username)) or empty_tray()
    doc.setdefault("items", [])
    doc.setdefault("saved", [])
    return doc


def save_tray(username: str, doc: dict[str, Any]) -> dict[str, Any]:
    doc = dict(doc)
    doc["type"] = "librarian-tray"
    doc["_rev"] = None
    doc["items"] = doc.get("items", [])[:MAX_ITEMS]
    doc["saved"] = doc.get("saved", [])[:MAX_SAVED]
    site.get().store[_key(username)] = doc
    return public_view(doc)


def public_view(doc: dict[str, Any]) -> dict[str, Any]:
    return {"items": doc.get("items", []), "saved": doc.get("saved", [])}


def add_items(username: str, keys: list[str | dict[str, Any]]) -> dict[str, Any]:
    """Add records. An entry may be a key or {"key", "edition"}: the edition a listing surfaced for a work."""
    doc = get_tray(username)
    have = {it["key"] for it in doc["items"]}
    for entry in keys:
        key, edition = (entry, None) if isinstance(entry, str) else (entry["key"], entry.get("edition"))
        if key not in have and len(doc["items"]) < MAX_ITEMS:
            item: dict[str, Any] = {"key": key, "added_at": _now(), "note": "", "done": False}
            if edition:
                item["edition"] = edition
            doc["items"].append(item)
            have.add(key)
    return save_tray(username, doc)


def remove_items(username: str, keys: list[str]) -> dict[str, Any]:
    doc = get_tray(username)
    drop = set(keys)
    doc["items"] = [it for it in doc["items"] if it["key"] not in drop]
    return save_tray(username, doc)


def clear(username: str) -> dict[str, Any]:
    doc = get_tray(username)
    doc["items"] = []
    return save_tray(username, doc)


def update_item(username: str, key: str, note: str | None = None, done: bool | None = None) -> dict[str, Any]:
    doc = get_tray(username)
    for it in doc["items"]:
        if it["key"] == key:
            if note is not None:
                it["note"] = note[:500]
            if done is not None:
                it["done"] = bool(done)
    return save_tray(username, doc)


def save_as(username: str, name: str) -> dict[str, Any]:
    doc = get_tray(username)
    doc["saved"].insert(
        0,
        {"id": secrets.token_hex(4), "name": name[:80] or "Untitled", "items": list(doc["items"]), "created": _now()},
    )
    return save_tray(username, doc)


def load_saved(username: str, saved_id: str, replace: bool = True) -> dict[str, Any]:
    doc = get_tray(username)
    for s in doc["saved"]:
        if s["id"] == saved_id:
            if replace:
                doc["items"] = list(s["items"])
            else:
                have = {it["key"] for it in doc["items"]}
                doc["items"].extend(it for it in s["items"] if it["key"] not in have)
            break
    return save_tray(username, doc)


def delete_saved(username: str, saved_id: str) -> dict[str, Any]:
    doc = get_tray(username)
    doc["saved"] = [s for s in doc["saved"] if s["id"] != saved_id]
    return save_tray(username, doc)


def rename_saved(username: str, saved_id: str, name: str) -> dict[str, Any]:
    doc = get_tray(username)
    for s in doc["saved"]:
        if s["id"] == saved_id:
            s["name"] = name[:80] or s["name"]
    return save_tray(username, doc)

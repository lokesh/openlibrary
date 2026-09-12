"""FastAPI endpoints behind editing mode: the tray, batch operations, record
context and the lookup panel. See openlibrary/core/{librarian_tray,batch_ops,
record_context,lookup}.py for the logic; this file is routing, validation and
the role split.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from openlibrary.accounts import get_current_user
from openlibrary.core import batch_ops, librarian_tray, lookup, record_context
from openlibrary.core.librarian_batches import LibrarianBatches
from openlibrary.fastapi.auth import LibrarianDep  # noqa: TC001
from openlibrary.utils.request_context import req_context, site, web_ctx_ip

router = APIRouter(tags=["librarians"])


def _user():
    user = get_current_user()
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def _username(auth: Any) -> str:
    return auth.username


def _error(e: batch_ops.BatchError) -> HTTPException:
    return HTTPException(status_code=e.status, detail={"error": e.message, **e.extra})


# ── Preferences ──────────────────────────────────────────────────────


class PreferencesBody(BaseModel):
    editing_mode: Literal["on", "off"] | None = None
    librarian_tools: Literal["tray", "classic"] | None = None
    tray_docked: Literal["open", "collapsed"] | None = None
    tray_width: int | None = Field(default=None, ge=280, le=640)


@router.post("/librarians/preferences.json")
def set_preferences(_: LibrarianDep, body: PreferencesBody) -> dict[str, Any]:
    user = _user()
    prefs = {k: v for k, v in body.model_dump().items() if v is not None}
    if prefs:
        user.save_preferences(prefs)
    current = user.preferences()
    return {
        "editing_mode": current.get("editing_mode", "off"),
        "librarian_tools": current.get("librarian_tools", "classic"),
        "tray_docked": current.get("tray_docked", "open"),
        "tray_width": current.get("tray_width"),
    }


# ── Tray ─────────────────────────────────────────────────────────────


class TrayItem(BaseModel):
    key: str
    added_at: str | None = None
    note: str = ""
    done: bool = False


class TrayBody(BaseModel):
    items: list[TrayItem] = Field(default_factory=list)
    saved: list[dict[str, Any]] = Field(default_factory=list)


class TrayAdd(BaseModel):
    """A record to add; `edition` is the edition a search result surfaced for a work (its cover in the tray)."""

    key: str
    edition: str | None = None


class TrayItemsBody(BaseModel):
    add: list[str | TrayAdd] = Field(default_factory=list)
    remove: list[str] = Field(default_factory=list)
    clear: bool = False
    note: dict[str, str] | None = None  # {"key": ..., "text": ...}
    done: dict[str, Any] | None = None  # {"key": ..., "value": bool}


class SavedTrayBody(BaseModel):
    op: Literal["save", "load", "merge", "delete", "rename"]
    name: str | None = None
    id: str | None = None


def _norm_keys(keys: list[str]) -> list[str]:
    out = []
    for k in keys:
        if nk := record_context.normalize_key(k):
            out.append(nk)
    return out


@router.get("/librarians/tray.json")
def get_tray(auth: LibrarianDep) -> dict[str, Any]:
    return librarian_tray.public_view(librarian_tray.get_tray(_username(auth)))


@router.put("/librarians/tray.json")
def put_tray(auth: LibrarianDep, body: TrayBody) -> dict[str, Any]:
    items = [it.model_dump() for it in body.items if record_context.normalize_key(it.key)]
    for it in items:
        it["key"] = record_context.normalize_key(it["key"])
    return librarian_tray.save_tray(_username(auth), {"items": items, "saved": body.saved})


@router.post("/librarians/tray/items.json")
def tray_items(auth: LibrarianDep, body: TrayItemsBody) -> dict[str, Any]:
    u = _username(auth)
    result = None
    if body.clear:
        result = librarian_tray.clear(u)
    if body.add:
        adds: list[str | dict[str, Any]] = []
        for a in body.add:
            key, edition = (a, None) if isinstance(a, str) else (a.key, a.edition)
            if nk := record_context.normalize_key(key):
                adds.append({"key": nk, "edition": record_context.normalize_key(edition or "")})
        result = librarian_tray.add_items(u, adds)
    if body.remove:
        result = librarian_tray.remove_items(u, _norm_keys(body.remove))
    if body.note and (k := record_context.normalize_key(body.note.get("key", ""))):
        result = librarian_tray.update_item(u, k, note=body.note.get("text", ""))
    if body.done and (k := record_context.normalize_key(body.done.get("key", ""))):
        result = librarian_tray.update_item(u, k, done=bool(body.done.get("value")))
    return result or librarian_tray.public_view(librarian_tray.get_tray(u))


@router.post("/librarians/tray/saved.json")
def tray_saved(auth: LibrarianDep, body: SavedTrayBody) -> dict[str, Any]:
    u = _username(auth)
    if body.op == "save":
        return librarian_tray.save_as(u, body.name or "")
    if not body.id:
        raise HTTPException(status_code=400, detail="id is required")
    if body.op == "load":
        return librarian_tray.load_saved(u, body.id, replace=True)
    if body.op == "merge":
        return librarian_tray.load_saved(u, body.id, replace=False)
    if body.op == "delete":
        return librarian_tray.delete_saved(u, body.id)
    return librarian_tray.rename_saved(u, body.id, body.name or "")


# ── Records (hydration for tray rows) ───────────────────────────────


def _cover_url(cover_id: int | None, kind: str, key: str) -> str | None:
    if kind == "author":
        return f"https://covers.openlibrary.org/a/olid/{record_context.olid(key)}-M.jpg?default=false"
    if cover_id and cover_id > 0:
        return f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"
    return None


@router.get("/librarians/records.json")
def records(_: LibrarianDep, keys: Annotated[str, Query(max_length=20000)]) -> dict[str, Any]:
    wanted = _norm_keys(keys.split(","))[:500]
    docs, resolved, missing = record_context.load_docs(wanted)
    author_keys: set[str] = set()
    for d in docs.values():
        author_keys.update(record_context.ref_keys(d.get("authors")))
    author_docs: dict[str, dict[str, Any]] = {}
    if author_keys:
        author_docs, _r, _m = record_context.load_docs(sorted(author_keys))
        # resolved author keys → name
        for k, v in _r.items():
            if v in author_docs:
                author_docs[k] = author_docs[v]
    out = []
    for key, d in docs.items():
        kind = record_context.TYPE_BY_TYPEKEY.get(record_context.doc_type(d) or "")
        if not kind:
            continue
        refs = [author_docs[a] for a in record_context.ref_keys(d.get("authors")) if a in author_docs]
        covers = d.get("covers") or []
        entry: dict[str, Any] = {
            "key": key,
            "type": kind,
            "title": d.get("title") or d.get("name") or "",
            "subtitle": d.get("subtitle") or "",
            "authors": [a.get("name", "") for a in refs],
            # Keyed form for the tray's author editor: who is on the record, by identity.
            "author_refs": [{"key": a["key"], "name": a.get("name", ""), "birth_date": a.get("birth_date"), "death_date": a.get("death_date")} for a in refs],
            "revision": d.get("revision"),
            "cover": _cover_url(next((c for c in covers if c and c > 0), None), kind, key),
        }
        if kind == "edition":
            entry["year"] = record_context.year_of(d.get("publish_date"))
            entry["publishers"] = d.get("publishers") or []
            entry["work"] = next(iter(record_context.ref_keys(d.get("works"))), None)
            entry["isbn"] = (d.get("isbn_13") or d.get("isbn_10") or [None])[0]
            entry["ocaid"] = d.get("ocaid")
            entry["language"] = [record_context.olid(lang) for lang in record_context.ref_keys(d.get("languages"))]
            entry["by_statement"] = d.get("by_statement")
        elif kind == "author":
            entry["dates"] = " - ".join(x for x in (d.get("birth_date"), d.get("death_date")) if x)
        out.append(entry)
    _add_solr_counts(out)
    return {"records": out, "resolved": resolved, "missing": missing}


def _add_solr_counts(entries: list[dict[str, Any]]) -> None:
    """Year and edition/work counts live in Solr, not on the doc; one query for all works and authors."""
    keys = [e["key"] for e in entries if e["type"] in ("work", "author")]
    if not keys:
        return
    q = " OR ".join(f'"{k}"' for k in keys)
    by_key = {d["key"]: d for d in record_context._solr_select(f"key:({q})", ["key", "first_publish_year", "edition_count", "work_count"], rows=len(keys))}
    for e in entries:
        if not (d := by_key.get(e["key"])):
            continue
        if e["type"] == "work":
            e["year"] = d.get("first_publish_year")
            e["edition_count"] = d.get("edition_count")
        elif e["type"] == "author":
            e["work_count"] = d.get("work_count")


# ── Batches ──────────────────────────────────────────────────────────


class BatchItem(BaseModel):
    key: str
    expected_revision: int | None = None


class BatchBody(BaseModel):
    action: str
    items: list[BatchItem] = Field(default_factory=list)
    params: dict[str, Any] = Field(default_factory=dict)
    dry_run: bool = True
    overrides: list[str] = Field(default_factory=list)
    comment: str | None = Field(default=None, max_length=500)


@router.post("/librarians/batch.json")
def batch(_: LibrarianDep, body: BatchBody) -> dict[str, Any]:
    if body.action not in batch_ops.ENABLED_ACTIONS:
        raise HTTPException(status_code=400, detail={"error": f"Action {body.action!r} is not enabled yet."})
    user = _user()
    with web_ctx_ip(req_context.get().x_forwarded_for or "127.0.0.1"):
        try:
            return batch_ops.run(
                user,
                body.action,
                [it.model_dump() for it in body.items],
                body.params,
                dry_run=body.dry_run,
                overrides=body.overrides,
                comment=body.comment,
            )
        except batch_ops.BatchError as e:
            raise _error(e) from e


@router.get("/librarians/batches.json")
def batches(auth: LibrarianDep, mine: bool = True, status: str | None = None, limit: int = 30, offset: int = 0) -> dict[str, Any]:
    user = _user()
    username = _username(auth) if (mine or not user.is_super_librarian_or_higher()) else None
    rows = LibrarianBatches.list_batches(username=username, status=status, limit=min(limit, 100), offset=offset)
    return {"batches": rows}


@router.get("/librarians/batch/{batch_id}.json")
def batch_detail(_: LibrarianDep, batch_id: int) -> dict[str, Any]:
    row = LibrarianBatches.get(batch_id)
    if not row:
        raise HTTPException(status_code=404, detail="Batch not found")
    return row


class BatchDecisionBody(BaseModel):
    comment: str | None = Field(default=None, max_length=500)


@router.post("/librarians/batch/{batch_id}/apply.json")
def batch_apply(_: LibrarianDep, batch_id: int, body: BatchDecisionBody | None = None) -> dict[str, Any]:
    user = _user()
    with web_ctx_ip(req_context.get().x_forwarded_for or "127.0.0.1"):
        try:
            return batch_ops.apply_requested(user, batch_id, comment=body.comment if body else None)
        except batch_ops.BatchError as e:
            raise _error(e) from e


@router.post("/librarians/batch/{batch_id}/decline.json")
def batch_decline(_: LibrarianDep, batch_id: int, body: BatchDecisionBody | None = None) -> dict[str, Any]:
    user = _user()
    if not user.is_super_librarian_or_higher():
        raise HTTPException(status_code=403, detail="Only super-librarians can decline batches")
    try:
        return batch_ops.decline_requested(user, batch_id, comment=body.comment if body else None)
    except batch_ops.BatchError as e:
        raise _error(e) from e


class RevertBody(BaseModel):
    key: str | None = None


@router.post("/librarians/batch/{batch_id}/revert.json")
def batch_revert(_: LibrarianDep, batch_id: int, body: RevertBody | None = None) -> dict[str, Any]:
    user = _user()
    with web_ctx_ip(req_context.get().x_forwarded_for or "127.0.0.1"):
        try:
            return batch_ops.revert(user, batch_id, key=body.key if body else None)
        except batch_ops.BatchError as e:
            raise _error(e) from e


# ── Context ──────────────────────────────────────────────────────────


@router.get("/librarians/context.json")
def context(_: LibrarianDep, key: str) -> dict[str, Any]:
    nk = record_context.normalize_key(key)
    if not nk:
        raise HTTPException(status_code=400, detail="Not a record key")
    return record_context.health(nk)


@router.get("/librarians/checks.json")
def checks(_: LibrarianDep, action: str, keys: str) -> dict[str, Any]:
    """Pre-flight checks for actions that happen elsewhere (the merge pages)."""
    if action not in ("merge_works", "merge_authors"):
        raise HTTPException(status_code=400, detail="Unknown check")
    wanted = _norm_keys(keys.split(","))[:100]
    docs, resolved, missing = record_context.load_docs(wanted)
    warnings = record_context.checks_for(action, docs, {})
    warnings.extend({"level": "warn", "code": "missing", "text": f"{record_context.olid(k)} does not exist.", "key": k} for k in missing)
    return {"action": action, "warnings": warnings, "resolved": resolved, "keys": list(docs)}


# The lookup panel (Wikidata, VIAF, LC Names, archive.org) is a second-release
# feature: its endpoints stay off until the tray shows the panel.
LOOKUP_ENABLED = False


@router.get("/librarians/duplicates.json")
def duplicates(_: LibrarianDep, key: str) -> dict[str, Any]:
    if not LOOKUP_ENABLED:
        raise HTTPException(status_code=404, detail="Not enabled")
    nk = record_context.normalize_key(key)
    if not nk:
        raise HTTPException(status_code=400, detail="Not a record key")
    return record_context.duplicates_for(nk)


@router.get("/librarians/lookup.json")
def lookup_json(_: LibrarianDep, q: str = "", sources: str = "ol,wikidata", kind: str | None = None, key: str | None = None) -> dict[str, Any]:
    if not LOOKUP_ENABLED:
        raise HTTPException(status_code=404, detail="Not enabled")
    if kind not in (None, "author", "work", "edition"):
        kind = None
    result: dict[str, Any] = {"prefill": lookup.prefill_for(key)} if key else {}
    if q:
        result.update(lookup.lookup(q, sources, kind))
    else:
        result.update({"q": "", "results": []})
    return result


@router.get("/librarians/whoami.json")
def whoami(auth: LibrarianDep) -> dict[str, Any]:
    user = _user()
    prefs = user.preferences()
    return {
        "username": auth.username,
        "is_super": bool(user.is_super_librarian_or_higher()),
        "editing_mode": prefs.get("editing_mode", "off"),
        "librarian_tools": prefs.get("librarian_tools", "classic"),
        "site": site.get().name if site.get() else None,
    }

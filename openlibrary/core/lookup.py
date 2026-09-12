"""The lookup panel's sources: Open Library, Wikidata, VIAF, Library of Congress
Names and the Internet Archive, normalised to one result shape so the tray can
render and act on them the same way.

Every external call is short-timeout, cached, and turns failures into a
``{"source": ..., "error": ...}`` entry rather than an exception: the panel
says "couldn't check", it never blocks.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import requests

from openlibrary.core import cache, ia
from openlibrary.core.record_context import WD_BIRTH, WD_DEATH, WD_VIAF, _escape, _solr_select, _wd_ids, _wd_year, normalize_key, olid
from openlibrary.core.wikidata import get_wikidata_entity

logger = logging.getLogger("openlibrary.lookup")

UA = {"User-Agent": "OpenLibrary.org librarian lookup (https://openlibrary.org)"}
TIMEOUT = 5
SOURCES = ("ol", "wikidata", "viaf", "lc", "ia")
OCAID_RE = re.compile(r"^[A-Za-z0-9._-]{4,100}$")
ISBN_RE = re.compile(r"^(97[89])?\d{9}[\dXx]$")


def _result(source: str, rid: str, title: str, subtitle: str = "", url: str = "", **meta: Any) -> dict[str, Any]:
    return {"source": source, "id": rid, "title": title, "subtitle": subtitle, "url": url, **meta}


def _error(source: str, text: str = "couldn't check") -> dict[str, Any]:
    return {"source": source, "error": text}


def _get_json(url: str, params: dict[str, Any]) -> Any:
    r = requests.get(url, params=params, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


# ── Sources ──────────────────────────────────────────────────────────


def ol_search(q: str, kind: str | None) -> list[dict[str, Any]]:
    eq = _escape(q)
    out: list[dict[str, Any]] = []
    if kind in (None, "author"):
        for d in _solr_select(
            f'type:author AND (name:"{eq}" OR alternate_names:"{eq}" OR name:({eq}*))',
            ["key", "name", "birth_date", "death_date", "work_count", "top_work"],
            rows=6,
        ):
            years = " · ".join(x for x in (d.get("birth_date"), d.get("death_date")) if x)
            sub = " · ".join(x for x in (years, f"{d.get('work_count', 0)} works", (f"top: {d['top_work']}" if d.get("top_work") else "")) if x)
            out.append(_result("ol", d["key"], d.get("name", ""), sub, d["key"], kind="author", actions=["tray", "open"]))
    if kind in (None, "work"):
        for d in _solr_select(f'type:work AND title:"{eq}"', ["key", "title", "author_name", "first_publish_year", "edition_count", "cover_i"], rows=6):
            by = ", ".join(d.get("author_name") or [])
            sub = " · ".join(x for x in (by, str(d.get("first_publish_year") or ""), f"{d.get('edition_count', 0)} editions") if x)
            out.append(_result("ol", d["key"], d.get("title", ""), sub, d["key"], kind="work", cover_i=d.get("cover_i"), actions=["tray", "open"]))
    return out


def _wikidata(q: str, kind: str | None) -> list[dict[str, Any]]:
    data = _get_json(
        "https://www.wikidata.org/w/api.php", {"action": "wbsearchentities", "search": q, "language": "en", "format": "json", "limit": 6, "type": "item"}
    )
    out = []
    for hit in data.get("search", []):
        qid = hit["id"]
        sub = hit.get("description") or ""
        meta: dict[str, Any] = {}
        if kind in (None, "author"):
            try:
                if ent := get_wikidata_entity(qid, fetch_missing=True):
                    b, d = _wd_year(ent, WD_BIRTH), _wd_year(ent, WD_DEATH)
                    if b or d:
                        sub = f"{sub} · {b or '?'}-{d or ''}" if sub else f"{b or '?'}-{d or ''}"
                    if viaf := _wd_ids(ent, WD_VIAF):
                        meta["viaf"] = viaf[0]
                        sub += f" · VIAF {viaf[0]}"
            except Exception:  # noqa: BLE001
                pass
        out.append(
            _result(
                "wikidata",
                qid,
                hit.get("label", qid),
                sub,
                f"https://www.wikidata.org/wiki/{qid}",
                kind="author",
                actions=["use_id"],
                id_field="wikidata",
                **meta,
            )
        )
    return out


def _viaf(q: str) -> list[dict[str, Any]]:
    data = _get_json("https://viaf.org/viaf/AutoSuggest", {"query": q})
    out = []
    for hit in (data or {}).get("result") or []:
        if hit.get("nametype") not in (None, "personal", "corporate"):
            continue
        vid = hit.get("viafid")
        if not vid:
            continue
        sub = " · ".join(x for x in ((hit.get("nametype") or ""), (f"LC {hit['lc']}" if hit.get("lc") else "")) if x)
        out.append(
            _result("viaf", vid, hit.get("term", vid), sub, f"https://viaf.org/viaf/{vid}/", kind="author", actions=["use_id"], id_field="viaf", lc=hit.get("lc"))
        )
    return out[:6]


def _lc(q: str) -> list[dict[str, Any]]:
    data = _get_json("https://id.loc.gov/authorities/names/suggest2", {"q": q, "count": 6})
    out = []
    for hit in (data or {}).get("hits") or []:
        uri = hit.get("uri") or ""
        lccn = uri.rsplit("/", 1)[-1]
        out.append(
            _result(
                "lc",
                lccn,
                hit.get("aLabel") or hit.get("suggestLabel") or lccn,
                hit.get("vLabel") or "",
                uri,
                kind="author",
                actions=["use_id"],
                id_field="lc_naf",
            )
        )
    return out


def _ia(q: str) -> list[dict[str, Any]]:
    out = []
    if OCAID_RE.match(q) and " " not in q:
        meta = ia.get_metadata(q) or {}
        if meta:
            sub = " · ".join(str(x) for x in (meta.get("creator"), meta.get("publisher"), meta.get("date")) if x)
            out.append(
                _result(
                    "ia",
                    q,
                    meta.get("title") or q,
                    sub,
                    f"https://archive.org/details/{q}",
                    kind="edition",
                    actions=["use_id"],
                    id_field="ocaid",
                    isbn=meta.get("isbn"),
                )
            )
            return out
    clean = q.replace("-", "")
    query = f"isbn:{clean}" if ISBN_RE.match(clean) else f'title:("{q}") AND mediatype:texts'
    data = _get_json(
        "https://archive.org/advancedsearch.php", {"q": query, "fl[]": ["identifier", "title", "creator", "date", "publisher"], "rows": 6, "output": "json"}
    )
    for d in (data.get("response") or {}).get("docs") or []:
        creator = d.get("creator")
        creator = ", ".join(creator) if isinstance(creator, list) else creator
        sub = " · ".join(str(x) for x in (creator, d.get("publisher"), (d.get("date") or "")[:4]) if x)
        out.append(
            _result(
                "ia",
                d["identifier"],
                d.get("title") or d["identifier"],
                sub,
                f"https://archive.org/details/{d['identifier']}",
                kind="edition",
                actions=["use_id"],
                id_field="ocaid",
            )
        )
    return out


def _run_source(source: str, q: str, kind: str | None) -> list[dict[str, Any]]:
    try:
        if source == "ol":
            return ol_search(q, kind)
        if source == "wikidata":
            return _wikidata(q, kind)
        if source == "viaf":
            return _viaf(q)
        if source == "lc":
            return _lc(q)
        if source == "ia":
            return _ia(q)
    except Exception:
        logger.warning("lookup source %s failed for %r", source, q, exc_info=True)
        return [_error(source)]
    return []


def lookup_uncached(q: str, sources: str, kind: str | None) -> dict[str, Any]:
    q = (q or "").strip()[:200]
    wanted = [s for s in sources.split(",") if s in SOURCES] or ["ol", "wikidata"]
    if not q:
        return {"q": q, "results": []}
    results: list[dict[str, Any]] = []
    for s in wanted:
        results.extend(_run_source(s, q, kind))
    return {"q": q, "sources": wanted, "results": results}


lookup = cache.memcache_memoize(lookup_uncached, key_prefix="librarians.lookup", timeout=10 * cache.MINUTE_SECS)


def prefill_for(key: str | None) -> dict[str, Any]:
    """What the panel's search box starts with on a given page."""
    k = normalize_key(key or "")
    if not k:
        return {}
    from openlibrary.core.record_context import resolve_key

    rkey, doc, _c = resolve_key(k)
    if not doc:
        return {}
    if doc.get("name"):
        q = doc["name"]
        if doc.get("birth_date"):
            q += f" {doc['birth_date'][-4:]}"
        return {"q": q, "kind": "author", "key": rkey}
    q = doc.get("title") or olid(rkey)
    kind = "edition" if rkey.startswith("/books/") else "work"
    ocaid = doc.get("ocaid")
    return {"q": ocaid or q, "kind": kind, "key": rkey, "ocaid": ocaid}

/**
 * Fetch wrappers for the /librarians endpoints (openlibrary/fastapi/librarians.py).
 * Every call resolves to parsed JSON and rejects with an Error carrying
 * `.status` and, when the server sent one, `.detail`.
 */

async function send(url, init = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) },
        ...init,
    });
    let body = null;
    try { body = await response.json(); } catch { /* empty */ }
    if (!response.ok) {
        const detail = body && body.detail;
        const message = (detail && (detail.error || detail)) || response.statusText;
        const error = new Error(typeof message === 'string' ? message : JSON.stringify(message));
        error.status = response.status;
        error.detail = detail;
        throw error;
    }
    return body;
}

export const api = {
    getTray: () => send('/librarians/tray.json'),
    trayItems: (body) => send('/librarians/tray/items.json', { method: 'POST', body: JSON.stringify(body) }),
    traySaved: (body) => send('/librarians/tray/saved.json', { method: 'POST', body: JSON.stringify(body) }),
    records: (keys) => send(`/librarians/records.json?keys=${encodeURIComponent(keys.join(','))}`),
    batch: (body) => send('/librarians/batch.json', { method: 'POST', body: JSON.stringify(body) }),
    batches: (params = {}) => send(`/librarians/batches.json?${new URLSearchParams(params)}`),
    batchApply: (id, comment) => send(`/librarians/batch/${id}/apply.json`, { method: 'POST', body: JSON.stringify({ comment }) }),
    batchDecline: (id, comment) => send(`/librarians/batch/${id}/decline.json`, { method: 'POST', body: JSON.stringify({ comment }) }),
    batchRevert: (id, key) => send(`/librarians/batch/${id}/revert.json`, { method: 'POST', body: JSON.stringify({ key }) }),
    context: (key) => send(`/librarians/context.json?key=${encodeURIComponent(key)}`),
    checks: (action, keys) => send(`/librarians/checks.json?action=${action}&keys=${encodeURIComponent(keys.join(','))}`),
    duplicates: (key) => send(`/librarians/duplicates.json?key=${encodeURIComponent(key)}`),
    lookup: (params) => send(`/librarians/lookup.json?${new URLSearchParams(params)}`),
    preferences: (body) => send('/librarians/preferences.json', { method: 'POST', body: JSON.stringify(body) }),
    myLists: (username) => send(`/people/${username}/lists.json?limit=100`),
    addSeeds: (username, listOlid, keys) => send(`/people/${username}/lists/${listOlid}/seeds.json`, {
        method: 'POST',
        body: JSON.stringify({ add: keys.map((key) => ({ key })), remove: [] }),
    }),
};

/** "OL1W", "/works/OL1W" or a URL → "/works/OL1W"; null when it isn't a record. */
export function normalizeKey(value) {
    if (!value) return null;
    const m = String(value).match(/\/(works|books|authors)\/(OL\d+[WMA])/);
    if (m) return `/${m[1]}/${m[2]}`;
    const olid = String(value).trim().match(/^OL\d+([WMA])$/);
    if (olid) return `/${{ W: 'works', M: 'books', A: 'authors' }[olid[1]]}/${olid[0]}`;
    return null;
}

export function keyType(key) {
    if (!key) return null;
    return { '/works': 'work', '/books': 'edition', '/authors': 'author' }[key.slice(0, key.lastIndexOf('/'))] || null;
}

export function olid(key) {
    return key ? key.slice(key.lastIndexOf('/') + 1) : '';
}

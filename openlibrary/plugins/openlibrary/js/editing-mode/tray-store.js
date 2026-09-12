/**
 * The tray's client-side state: the account's working set, mirrored from
 * /librarians/tray.json and written through on every change.
 *
 * A sessionStorage copy lets the page paint the tray before the server
 * answers; the server copy is the truth and replaces it on load. Every
 * mutation is optimistic — applied locally, sent, and rolled back to the
 * server's answer on failure — and fires `change` with the new items.
 */
import { api, normalizeKey } from './api.js';

const CACHE_KEY = 'ol-librarian-tray';

export class TrayStore extends EventTarget {
    constructor() {
        super();
        this.items = [];
        this.saved = [];
        this.loaded = false;
        try {
            const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
            if (cached && Array.isArray(cached.items)) {
                this.items = cached.items;
                this.saved = cached.saved || [];
            }
        } catch { /* ignore */ }
    }

    get keys() {
        return new Set(this.items.map((it) => it.key));
    }

    has(key) {
        return this.items.some((it) => it.key === key);
    }

    byType() {
        const out = { work: [], edition: [], author: [] };
        for (const it of this.items) {
            const type = { '/works': 'work', '/books': 'edition', '/authors': 'author' }[it.key.slice(0, it.key.lastIndexOf('/'))];
            if (type) out[type].push(it);
        }
        return out;
    }

    async load() {
        try {
            this._apply(await api.getTray());
        } catch (e) {
            this.dispatchEvent(new CustomEvent('error', { detail: e }));
        } finally {
            this.loaded = true;
        }
        return this.items;
    }

    _apply(doc) {
        this.items = doc.items || [];
        this.saved = doc.saved || [];
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ items: this.items, saved: this.saved })); } catch { /* ignore */ }
        this.dispatchEvent(new CustomEvent('change', { detail: { items: this.items, saved: this.saved } }));
    }

    async _mutate(localFn, body) {
        const before = { items: this.items, saved: this.saved };
        localFn();
        this._apply({ items: this.items, saved: this.saved });
        try {
            this._apply(await api.trayItems(body));
        } catch (e) {
            this._apply(before);
            this.dispatchEvent(new CustomEvent('error', { detail: e }));
            throw e;
        }
    }

    /**
     * @param {Array<string|{key: string, edition?: string}>} entries keys, or
     *   objects carrying the edition a listing surfaced for a work (its cover in the tray)
     */
    add(entries) {
        const wanted = new Map();
        for (const e of entries) {
            const key = normalizeKey(typeof e === 'string' ? e : e.key);
            if (!key || this.has(key) || wanted.has(key)) continue;
            const edition = typeof e === 'string' ? null : normalizeKey(e.edition);
            wanted.set(key, edition && edition !== key ? edition : null);
        }
        if (!wanted.size) return Promise.resolve();
        const now = new Date().toISOString();
        const items = [...wanted].map(([key, edition]) => ({ key, added_at: now, note: '', done: false, ...(edition ? { edition } : {}) }));
        return this._mutate(
            () => { this.items = [...this.items, ...items]; },
            { add: [...wanted].map(([key, edition]) => (edition ? { key, edition } : key)) },
        );
    }

    remove(keys) {
        const drop = new Set(keys.map(normalizeKey).filter(Boolean));
        if (!drop.size) return Promise.resolve();
        return this._mutate(
            () => { this.items = this.items.filter((it) => !drop.has(it.key)); },
            { remove: [...drop] },
        );
    }

    toggle(key, edition = null) {
        const k = normalizeKey(key);
        return this.has(k) ? this.remove([k]) : this.add([{ key: k, edition }]);
    }

    clear() {
        return this._mutate(() => { this.items = []; }, { clear: true });
    }

    setNote(key, text) {
        return this._mutate(
            () => { this.items = this.items.map((it) => (it.key === key ? { ...it, note: text } : it)); },
            { note: { key, text } },
        );
    }

    setDone(key, value) {
        return this._mutate(
            () => { this.items = this.items.map((it) => (it.key === key ? { ...it, done: !!value } : it)); },
            { done: { key, value: !!value } },
        );
    }

    async savedOp(body) {
        try {
            this._apply(await api.traySaved(body));
        } catch (e) {
            this.dispatchEvent(new CustomEvent('error', { detail: e }));
            throw e;
        }
    }
}

/**
 * The selection engine for editing mode.
 *
 * One provider, the markup contract: any element carrying `data-ol-key` is a
 * record; `data-ol-edition` on a work row names the edition the listing
 * surfaced, which travels with the key so the tray shows that cover. Block elements (a result row, an editions-table cell, a carousel
 * card) get a checkbox; inline author links get a small "+" button. The
 * checkbox is the only click target — a row click never selects, which is the
 * bug the ILE's invisible hit area kept producing.
 *
 * The tray store is the source of truth: the engine reflects it onto the page
 * and forwards toggles to it. Shift-click extends the selection across the
 * siblings between the last clicked row and this one (the ILE's range logic,
 * ported off jQuery). A MutationObserver decorates rows that arrive later
 * (DataTables paging, lazy carousels).
 */
import { normalizeKey } from './api.js';

const SELECTABLE = '[data-ol-key]';
const INLINE_TAGS = new Set(['A', 'SPAN']);

export class SelectionEngine {
    /**
     * @param {import('./tray-store.js').TrayStore} store
     * @param {{ labels: Object }} options
     */
    constructor(store, { labels }) {
        this.store = store;
        this.labels = labels;
        this.lastClicked = null;
        this.focused = null;
        this.enabled = false;
        this.onStoreChange = this.onStoreChange.bind(this);
        this.onKeydown = this.onKeydown.bind(this);
        this.observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches?.(SELECTABLE)) this.decorate(node);
                    node.querySelectorAll?.(SELECTABLE).forEach((el) => this.decorate(el));
                }
            }
        });
    }

    enable() {
        if (this.enabled) return;
        this.enabled = true;
        document.body.classList.add('editing-mode');
        document.querySelectorAll(SELECTABLE).forEach((el) => this.decorate(el));
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.store.addEventListener('change', this.onStoreChange);
        document.addEventListener('keydown', this.onKeydown);
        this.reflect();
    }

    disable() {
        if (!this.enabled) return;
        this.enabled = false;
        document.body.classList.remove('editing-mode');
        this.observer.disconnect();
        this.store.removeEventListener('change', this.onStoreChange);
        document.removeEventListener('keydown', this.onKeydown);
        document.querySelectorAll('.ol-select, .ol-select-inline').forEach((el) => el.remove());
        document.querySelectorAll('.ol-selectable').forEach((el) => {
            el.classList.remove('ol-selectable', 'ol-selectable--selected', 'ol-selectable--focused', 'ol-selectable--touched');
            el.removeAttribute('data-ol-selected');
        });
    }

    /** All selectable elements on the page, in document order. */
    rows() {
        return [...document.querySelectorAll(`${SELECTABLE}.ol-selectable`)];
    }

    keysOnPage() {
        return [...new Set(this.rows().map((el) => normalizeKey(el.dataset.olKey)).filter(Boolean))];
    }

    /** Selectable records on the page as store entries, editions included. */
    entriesOnPage() {
        return this.rows().map((el) => SelectionEngine.entry(el)).filter((e) => e.key);
    }

    static entry(el) {
        return { key: normalizeKey(el.dataset.olKey), edition: normalizeKey(el.dataset.olEdition) };
    }

    decorate(el) {
        if (!this.enabled || el.classList.contains('ol-selectable')) return;
        const key = normalizeKey(el.dataset.olKey);
        if (!key) return;
        el.classList.add('ol-selectable');
        const title = (el.querySelector('.booktitle, .title, h3, .details a, .name') || el).textContent.trim().slice(0, 80);
        if (INLINE_TAGS.has(el.tagName)) {
            // An x-small circle ol-button; the components bundle upgrades it.
            const button = document.createElement('ol-button');
            button.className = 'ol-select-inline';
            button.setAttribute('size', 'x-small');
            button.setAttribute('shape', 'circle');
            button.setAttribute('variant', 'secondary');
            button.setAttribute('aria-label', `${this.labels.toTray}: ${title}`);
            button.title = this.labels.toTray;
            button.innerHTML = '<ol-icon name="plus" size="sm"></ol-icon>';
            button.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.store.toggle(key);
            });
            el.after(button);
        } else {
            const label = document.createElement('label');
            label.className = 'ol-select';
            if (el.tagName === 'TD') label.classList.add('ol-select--cell');
            if (el.classList.contains('carousel__item')) label.classList.add('ol-select--card');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'ol-select__input';
            input.setAttribute('aria-label', `${this.labels.add}: ${title}`);
            input.addEventListener('click', (ev) => this.onToggle(ev, el));
            label.appendChild(input);
            label.addEventListener('click', (ev) => ev.stopPropagation());
            if (getComputedStyle(el).position === 'static') el.classList.add('ol-selectable--anchor');
            el.prepend(label);
        }
        this.reflectOne(el, key);
    }

    onToggle(ev, el) {
        // The checkbox has already flipped; the store decides the real state.
        const { key, edition } = SelectionEngine.entry(el);
        if (ev.shiftKey && this.lastClicked && this.lastClicked !== el) {
            ev.preventDefault();
            this.selectRange(this.lastClicked, el, !this.store.has(key));
        } else {
            this.store.toggle(key, edition);
        }
        this.lastClicked = el;
        this.focused = el;
    }

    /**
     * Rows between a and b within their common ancestor (up to three levels),
     * mirroring the ILE's getSelectableRange.
     */
    rangeBetween(a, b) {
        let ca = a;
        let cb = b;
        let common = null;
        for (let i = 0; i < 4 && ca && cb; i++) {
            if (ca === cb) { common = ca; break; }
            ca = ca.parentElement;
            cb = cb.parentElement;
        }
        if (!common) return [b];
        const rows = [...common.querySelectorAll(`${SELECTABLE}.ol-selectable`)].filter((el) => !INLINE_TAGS.has(el.tagName));
        const ia = rows.indexOf(a);
        const ib = rows.indexOf(b);
        if (ia < 0 || ib < 0) return [b];
        return rows.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
    }

    selectRange(a, b, selected) {
        const entries = this.rangeBetween(a, b).map((el) => SelectionEngine.entry(el)).filter((e) => e.key);
        return selected ? this.store.add(entries) : this.store.remove(entries.map((e) => e.key));
    }

    onStoreChange() {
        this.reflect();
    }

    reflect() {
        for (const el of this.rows()) this.reflectOne(el, normalizeKey(el.dataset.olKey));
    }

    reflectOne(el, key) {
        const on = this.store.has(key);
        el.classList.toggle('ol-selectable--selected', on);
        if (on) el.setAttribute('data-ol-selected', ''); else el.removeAttribute('data-ol-selected');
        const input = el.querySelector(':scope > .ol-select > .ol-select__input');
        if (input) input.checked = on;
        const inline = el.nextElementSibling;
        if (inline?.classList.contains('ol-select-inline')) {
            inline.setAttribute('variant', on ? 'primary' : 'secondary');
            inline.title = on ? this.labels.inTray : this.labels.toTray;
            inline.innerHTML = `<ol-icon name="${on ? 'check' : 'plus'}" size="sm"></ol-icon>`;
        }
    }

    // ── Keyboard: j/k move, x toggle, shift+x group, a add page ─────────

    onKeydown(ev) {
        if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
        const target = ev.target;
        const inField = target && (target.closest('input, textarea, select, [contenteditable], ol-librarian-tray, ol-dialog, dialog') || target.isContentEditable);
        if (inField) return;
        const rows = this.rows().filter((el) => !INLINE_TAGS.has(el.tagName));
        if (!rows.length) return;
        switch (ev.key) {
        case 'j':
        case 'k': {
            ev.preventDefault();
            const i = rows.indexOf(this.focused);
            const next = ev.key === 'j' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
            this.focusRow(rows[next]);
            break;
        }
        case 'x':
        case 'X': {
            if (!this.focused) return;
            ev.preventDefault();
            const { key, edition } = SelectionEngine.entry(this.focused);
            if (ev.shiftKey && this.lastClicked && this.lastClicked !== this.focused) {
                this.selectRange(this.lastClicked, this.focused, !this.store.has(key));
            } else {
                this.store.toggle(key, edition);
            }
            this.lastClicked = this.focused;
            break;
        }
        case 'a':
            ev.preventDefault();
            this.store.add(this.entriesOnPage());
            break;
        case 'Enter':
            if (this.focused) {
                const link = this.focused.querySelector('a[href]');
                if (link) { ev.preventDefault(); link.click(); }
            }
            break;
        case '?':
            document.dispatchEvent(new CustomEvent('ol-editing-help'));
            break;
        default:
        }
    }

    focusRow(el) {
        if (!el) return;
        this.focused?.classList.remove('ol-selectable--focused');
        this.focused = el;
        el.classList.add('ol-selectable--focused');
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'nearest' });
    }
}

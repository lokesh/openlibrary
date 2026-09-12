import { LitElement, html, css, nothing } from 'lit';
import { translate } from './utils/labels.js';
import { DEFAULT_LABELS, labelsFromElement } from './librarian-tray-labels.js';
import { api, keyType, normalizeKey, olid } from '../../plugins/openlibrary/js/editing-mode/api.js';
import { showToast } from './OlToastRegion.js';
import './OlIcon.js';
import './OLButton.js';
import './OLChip.js';
import './OlBookCover.js';
import './OlSegmentedControl.js';
import './OlMenuPopover.js';
import './OlBatchPreview.js';
import './OlTrayLookup.js';
import './OlTraySplit.js';
import './OlAutocomplete.js';

const TYPE_LABEL = { work: 'works', edition: 'editions', author: 'authors' };
const MERGE_LABEL = { work: 'mergeWorks', author: 'mergeAuthors', edition: 'mergeEditions' };
const SET_FIELDS = ['publishers', 'publish_date', 'publish_places', 'languages', 'physical_format', 'number_of_pages', 'edition_name', 'series'];
/**
 * First release: the loop librarians already run (subjects, merges, lists) plus
 * the two edits that replace the classic drag-and-drop. Everything else stays
 * built but hidden until it is added here; the server refuses the same actions
 * (ENABLED_ACTIONS in core/batch_ops.py). Notes and saved trays wait on their
 * own dialogs, so their controls are gated too.
 */
const V1_ACTIONS = new Set(['manageSubjects', 'merge', 'moveEditions', 'setAuthor', 'addToList']);
const V1_ONLY = true;
const TABS = V1_ONLY ? ['tray', 'batches'] : ['tray', 'lookup', 'batches'];

/** Docked width bounds: below the min the action rows wrap; above the max the page stops being usable. */
const WIDTH_DEFAULT = 340;
const WIDTH_MIN = 280;
const WIDTH_MAX = 640;
const WIDTH_STEP = 16;

/**
 * The librarian tray: the persistent working set, docked to the right of
 * every page in editing mode (a bottom sheet on narrow screens), with the
 * batch actions grouped by what it holds and disabled with a reason rather
 * than hidden.
 *
 * A view. editing-mode/index.js owns the store and hands the tray its
 * `items`; the tray asks for changes through `ol-tray-*` events and opens the
 * batch preview, split view and lookup panels itself. Composed from the
 * design-system controls: ol-segmented-control for the tabs, ol-menu-popover
 * for the settings menu, ol-book-cover for rows, ol-button everywhere a
 * control is a button.
 *
 * @element ol-librarian-tray
 *
 * @prop {Array} items - [{ key, added_at, note, done }] from the store
 * @prop {Array} saved - Saved trays [{ id, name, items, created }]
 * @prop {Array} pageKeys - Record keys selectable on this page
 * @prop {String} pageKey - The page's own record, if it is a work/edition/author page
 * @prop {String} username - The signed-in librarian (for list endpoints)
 * @prop {Boolean} canApply - Super-librarian: applies instead of requesting
 * @prop {Boolean} active - Editing mode on
 * @prop {Boolean} collapsed - Docked panel collapsed to a pill
 * @prop {Number} width - Docked panel width in px, between 280 and 640 (and 60vw). Resizable
 *     from its left edge by pointer or arrow keys; double-click or Enter resets it.
 * @prop {Object} labels - Translated strings; read from data-i18n when absent
 *
 * @fires ol-tray-add - detail: { keys }
 * @fires ol-tray-remove - detail: { keys }
 * @fires ol-tray-clear
 * @fires ol-tray-note - detail: { key, text }
 * @fires ol-tray-done - detail: { key, value }
 * @fires ol-tray-saved - detail: { op, name?, id? }
 * @fires ol-tray-add-page
 * @fires ol-tray-collapse - detail: { collapsed }
 * @fires ol-tray-resize - detail: { width, commit } — commit is true once the drag ends (persist it)
 * @fires ol-tray-classic
 * @fires ol-tray-manage-subjects - detail: { keys }
 * @fires ol-batch-applied - re-emitted from the preview: { batch_id, action, keys, dropFromTray }
 */
export class OlLibrarianTray extends LitElement {
    static properties = {
        items: { type: Array },
        saved: { type: Array },
        pageKeys: { type: Array },
        pageKey: { type: String, attribute: 'page-key' },
        username: { type: String },
        canApply: { type: Boolean, attribute: 'can-apply', reflect: true },
        active: { type: Boolean, reflect: true },
        collapsed: { type: Boolean, reflect: true },
        width: { type: Number },
        labels: { type: Object },
        _tab: { state: true },
        _records: { state: true },
        _paste: { state: true },
        _form: { state: true },
        _batches: { state: true },
        _busy: { state: true },
        _lists: { state: true },
        _confirmClear: { state: true },
    };

    static styles = css`
        :host {
            --tray-width: 340px;
            display: none;
            font-family: var(--font-family-body);
            font-size: var(--font-size-body-small);
            color: var(--color-text);
            z-index: var(--z-index-fixed);
        }
        :host([active]) { display: block; }
        .panel {
            position: fixed;
            inset: 0 0 0 auto;
            width: var(--tray-width);
            max-width: 100vw;
            display: flex;
            flex-direction: column;
            background: var(--color-surface);
            border-left: var(--border-width) solid var(--color-border-muted);
            box-shadow: var(--box-shadow-raised);
        }
        :host([collapsed]) .panel { display: none; }
        /* The resizable left edge: a wide hit area, a hairline that thickens on hover,
           focus and while dragging. A separator, so keyboard users get it too. */
        .resizer {
            position: absolute;
            inset: 0 auto 0 -3px;
            width: 7px;
            cursor: col-resize;
            touch-action: none;
            z-index: var(--z-index-local-1);
        }
        .resizer::before {
            content: "";
            position: absolute;
            inset: 0 auto 0 3px;
            width: 1px;
            background: var(--color-border-muted);
        }
        @media (hover: hover) and (pointer: fine) {
            .resizer:hover::before { width: 3px; inset-inline-start: 2px; background: var(--color-primary); }
        }
        .resizer:focus-visible { outline: none; }
        .resizer:focus-visible::before, :host([dragging]) .resizer::before { width: 3px; inset-inline-start: 2px; background: var(--color-primary); }
        :host([dragging]) { user-select: none; }
        @media (max-width: 1099px) { .resizer { display: none; } }
        .pill { position: fixed; right: var(--spacing-md); bottom: var(--spacing-md); display: none; }
        :host([collapsed]) .pill { display: block; }
        .pill .n { margin-left: var(--spacing-2xs); font-variant-numeric: tabular-nums; opacity: 0.85; }
        header { display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs) var(--spacing-sm); border-bottom: var(--border-width) solid var(--color-border-muted); }
        header h2 { margin: 0; font-size: var(--font-size-title-small); font-family: var(--font-family-heading); font-weight: var(--font-weight-semibold); }
        header .count { color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
        header .sp { flex: 1; }
        .tabs { padding: var(--spacing-xs) var(--spacing-sm) 0; }
        .body { flex: 1; overflow: auto; padding: var(--spacing-sm); display: grid; gap: var(--spacing-sm); align-content: start; }
        .empty { color: var(--color-text-secondary); margin: 0; }
        h3 { margin: 0 0 var(--spacing-2xs); font-size: var(--font-size-overline); font-weight: var(--font-weight-overline); letter-spacing: var(--letter-spacing-overline); text-transform: var(--text-transform-overline); color: var(--color-text-muted); display: flex; gap: var(--spacing-xs); align-items: baseline; }
        h3 .n { font-variant-numeric: tabular-nums; }
        ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--spacing-3xs); }
        .it { display: grid; grid-template-columns: auto 26px 1fr auto; gap: var(--spacing-xs); align-items: center; padding: var(--spacing-2xs) var(--spacing-xs); border-radius: var(--border-radius-md); }
        /* No row hover: only the checkbox, title and remove button are actionable. */
        .it[data-done] .t { text-decoration: line-through; color: var(--color-text-muted); }
        .it ol-book-cover { width: 26px; height: 36px; }
        .it .t { font-weight: var(--font-weight-medium); line-height: var(--line-height-snug); }
        .it .t a { color: inherit; text-decoration: none; }
        .it .t a:hover { text-decoration: underline; }
        .it .s { color: var(--color-text-secondary); font-size: var(--font-size-label-medium); line-height: var(--line-height-snug); }
        .it .note { font-size: var(--font-size-label-medium); color: var(--color-text-muted); font-style: italic; }
        .it .acts { display: inline-flex; gap: var(--spacing-3xs); }
        .it input[type="checkbox"] { margin: 0; accent-color: var(--color-primary); }
        .paste { display: grid; gap: var(--spacing-2xs); }
        textarea, input[type="text"], select { font: inherit; font-size: 16px; padding: var(--spacing-xs); border: var(--border-input); border-radius: var(--border-radius-input); background: var(--color-surface); width: 100%; box-sizing: border-box; }
        textarea:focus-visible, input:focus-visible, select:focus-visible { outline: none; border: var(--border-input-focused); box-shadow: var(--box-shadow-focus); }
        /* 16px stops iOS zooming on focus; a mouse-driven screen gets body size. */
        @media (hover: hover) and (pointer: fine) { textarea, input[type="text"], select { font-size: var(--font-size-body-medium); } }
        textarea { resize: vertical; min-height: 40px; }
        .row { display: flex; gap: var(--spacing-2xs); align-items: center; flex-wrap: wrap; }
        .confirm { padding: var(--spacing-2xs) var(--spacing-xs); border-radius: var(--border-radius-md); background: var(--color-surface-sunken); }
        .confirm span { flex: 1; }
        .actions { border-top: var(--border-width) solid var(--color-border-muted); padding: var(--spacing-xs) var(--spacing-sm) var(--spacing-sm); display: grid; gap: var(--spacing-2xs); }
        /* Action rows: a full-width ol-button with the label left and the reason
           (a count, or why it is disabled) right. The parts are the theming API. */
        .act::part(control) { justify-content: flex-start; text-align: left; }
        .act::part(label) { flex: 1; display: flex; align-items: center; gap: var(--spacing-xs); }
        .act__why { margin-left: auto; font-size: var(--font-size-label-small); color: var(--color-text-muted); font-weight: var(--font-weight-regular); font-variant-numeric: tabular-nums; }
        .form { display: grid; gap: var(--spacing-xs); padding: var(--spacing-xs); border-radius: var(--border-radius-md); background: var(--color-surface-sunken); }
        .form label { display: grid; gap: var(--spacing-3xs); font-size: var(--font-size-label-medium); color: var(--color-text-secondary); }
        .form .check { display: flex; gap: var(--spacing-xs); align-items: center; }
        .form .lbl { font-size: var(--font-size-label-medium); color: var(--color-text-secondary); }
        .form input[type="radio"] { margin: 0; accent-color: var(--color-primary); }
        .form .btns { display: flex; gap: var(--spacing-2xs); justify-content: flex-end; }
        .form .authors { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--spacing-3xs); }
        .form .author-row { display: grid; grid-template-columns: 1fr auto auto; gap: var(--spacing-2xs); align-items: center; padding: var(--spacing-2xs) var(--spacing-xs); border-radius: var(--border-radius-sm); background: var(--color-surface); border: var(--border-width) solid var(--color-border-muted); }
        .form .author-row[data-target] { border-color: var(--color-control-selected-border); background: var(--color-control-selected-bg); }
        .form .author-row .who { display: grid; min-width: 0; }
        .form .author-row .t { font-weight: var(--font-weight-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .form .author-row .t small { font-family: var(--font-family-mono); font-weight: var(--font-weight-regular); color: var(--color-text-muted); font-size: var(--font-size-label-small); }
        .form .author-row .s { color: var(--color-text-secondary); font-size: var(--font-size-label-medium); }
        .form .hint { margin: 0; font-size: var(--font-size-label-medium); color: var(--color-text-secondary); }
        .b { display: grid; gap: var(--spacing-3xs); padding: var(--spacing-xs); border-radius: var(--border-radius-md); border: var(--border-width) solid var(--color-border-muted); }
        .b .h { display: flex; gap: var(--spacing-xs); align-items: baseline; }
        .b .st { font-size: var(--font-size-label-small); text-transform: uppercase; letter-spacing: 0.05em; padding: 0 var(--spacing-xs); border-radius: var(--border-radius-chip); background: var(--color-chip-neutral-bg); color: var(--color-chip-neutral-fg); }
        .b .st[data-s="applied"] { background: var(--color-success-bg); color: var(--color-success-fg); }
        .b .st[data-s="requested"] { background: var(--color-info-bg); color: var(--color-info-fg); }
        .b .st[data-s="failed"] { background: var(--color-error-bg); color: var(--color-error-fg); }
        .b .sum { font-size: var(--font-size-label-medium); font-weight: var(--font-weight-medium); }
        .b .recs { font-size: var(--font-size-label-medium); color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .b .recs a { color: inherit; }
        .b .more { color: var(--color-text-muted); }
        .b .when { font-size: var(--font-size-label-small); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
        .b .acts { display: flex; gap: var(--spacing-2xs); }
        .kbd { font-size: var(--font-size-label-small); color: var(--color-text-muted); padding: var(--spacing-2xs) var(--spacing-sm); border-top: var(--border-width) solid var(--color-border-muted); }
        a { color: var(--color-link); }
        @media (max-width: 1099px) {
            .panel { inset: auto 0 0 0; width: auto; max-height: 60vh; border-left: 0; border-top: var(--border-width) solid var(--color-border-muted); border-radius: var(--border-radius-lg) var(--border-radius-lg) 0 0; }
        }
    `;

    constructor() {
        super();
        this.items = [];
        this.saved = [];
        this.pageKeys = [];
        this.pageKey = '';
        this.username = '';
        this.canApply = false;
        this.active = false;
        this.collapsed = false;
        this.width = WIDTH_DEFAULT;
        this.labels = null;
        this._onWindowResize = () => this.setWidth(this.width, false);
        this._tab = 'tray';
        this._records = new Map();
        this._paste = '';
        this._form = null;
        this._batches = null;
        this._busy = false;
        this._lists = null;
        this._confirmClear = false;
        this._hydrating = new Set();
    }

    t(key, vars) {
        return translate(this.labels || {}, DEFAULT_LABELS, key, vars);
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this.labels) this.labels = labelsFromElement(this);
        window.addEventListener('resize', this._onWindowResize);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('resize', this._onWindowResize);
    }

    updated(changed) {
        if (changed.has('width')) this.style.setProperty('--tray-width', `${this.width}px`);
        if (changed.has('items')) this.hydrate();
        if (changed.has('_tab') && this._tab === 'batches') this.loadBatches();
    }

    // ── Data ────────────────────────────────────────────────────────

    async hydrate() {
        const missing = this.items.map((it) => it.key).filter((k) => !this._records.has(k) && !this._hydrating.has(k));
        if (!missing.length) return;
        missing.forEach((k) => this._hydrating.add(k));
        try {
            const data = await api.records(missing);
            const next = new Map(this._records);
            for (const r of data.records || []) next.set(r.key, r);
            for (const k of data.missing || []) next.set(k, { key: k, type: keyType(k), title: olid(k), missing: true });
            for (const [from, to] of Object.entries(data.resolved || {})) if (next.has(to)) next.set(from, { ...next.get(to), redirectedFrom: from });
            this._records = next;
        } catch { /* rows fall back to their OLIDs */ } finally {
            missing.forEach((k) => this._hydrating.delete(k));
        }
    }

    rec(key) {
        return this._records.get(key) || { key, type: keyType(key), title: olid(key) };
    }

    get groups() {
        const out = { work: [], edition: [], author: [] };
        for (const it of this.items) {
            const t = keyType(it.key);
            if (t) out[t].push(it);
        }
        return out;
    }

    keysOf(type) {
        return this.groups[type].map((it) => it.key);
    }

    async loadBatches() {
        try {
            const data = await api.batches({ mine: 'true', limit: 20 });
            this._batches = data.batches || [];
        } catch {
            this._batches = [];
        }
    }

    // ── Events out ─────────────────────────────────────────────────

    emit(name, detail = {}) {
        this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
    }

    remove(key) { this.emit('ol-tray-remove', { keys: [key] }); }

    /** Two steps, inline: the first click asks, the second empties. */
    clear() {
        if (!this.items.length) return;
        if (!this._confirmClear) {
            this._tab = 'tray';
            this._confirmClear = true;
            return;
        }
        this._confirmClear = false;
        this.emit('ol-tray-clear');
    }

    // ── Resizing ───────────────────────────────────────────────────

    get maxWidth() {
        return Math.min(WIDTH_MAX, Math.floor(window.innerWidth * 0.6));
    }

    /** Clamp, apply, and tell the page; `commit` persists the width. */
    setWidth(px, commit) {
        const next = Math.round(Math.min(this.maxWidth, Math.max(WIDTH_MIN, px)));
        const changed = next !== this.width;
        this.width = next;
        if (changed || commit) this.emit('ol-tray-resize', { width: next, commit: !!commit });
    }

    onResizeStart(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        this.setAttribute('dragging', '');
        const move = (ev) => this.setWidth(window.innerWidth - ev.clientX, false);
        const end = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', end);
            handle.removeEventListener('pointercancel', end);
            this.removeAttribute('dragging');
            this.setWidth(this.width, true);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    onResizeKey(e) {
        // The edge is on the left, so Left grows the panel and Right shrinks it.
        const steps = { ArrowLeft: WIDTH_STEP, ArrowRight: -WIDTH_STEP, Home: -Infinity, End: Infinity };
        if (e.key in steps) {
            e.preventDefault();
            this.setWidth(this.width + steps[e.key], true);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this.setWidth(WIDTH_DEFAULT, true);
        }
    }

    toggleCollapse() {
        this.collapsed = !this.collapsed;
        this.emit('ol-tray-collapse', { collapsed: this.collapsed });
    }

    addPasted() {
        const keys = this._paste.split(/[\s,;]+/).map(normalizeKey).filter(Boolean);
        if (keys.length) this.emit('ol-tray-add', { keys });
        this._paste = '';
    }

    editNote(it) {
        const text = window.prompt(this.t('note'), it.note || '');
        if (text !== null) this.emit('ol-tray-note', { key: it.key, text });
    }

    /** The settings menu, flattened for ol-menu-popover (`nested` indents a row). */
    get menuItems() {
        const items = [];
        if (!V1_ONLY) {
            items.push({ value: 'save', label: this.t('saveAs') });
            for (const s of this.saved) {
                items.push({ value: `load:${s.id}`, label: `${s.name} · ${s.items.length}`, nested: true });
                items.push({ value: `delete:${s.id}`, label: `${this.t('deleteSaved')}: ${s.name}`, nested: true });
            }
        }
        items.push({ value: 'add-page', label: `${this.t('addAll')} (${this.pageKeys.length})` });
        items.push({ value: 'clear', label: this.t('clear') });
        items.push({ value: 'help', label: this.t('whatIsThis') });
        items.push({ value: 'classic', label: this.t('classic') });
        return items;
    }

    onMenu(e) {
        const v = e.detail.value;
        if (v === 'save') {
            const name = window.prompt(this.t('saveAs'));
            if (name) this.emit('ol-tray-saved', { op: 'save', name });
        } else if (v.startsWith('load:')) {
            this.emit('ol-tray-saved', { op: 'load', id: v.slice(5) });
        } else if (v.startsWith('delete:')) {
            this.emit('ol-tray-saved', { op: 'delete', id: v.slice(7) });
        } else if (v === 'add-page') {
            this.emit('ol-tray-add-page');
        } else if (v === 'clear') {
            this.clear();
        } else if (v === 'help') {
            window.location.href = '/librarians/editing';
        } else if (v === 'classic') {
            this.emit('ol-tray-classic');
        }
    }

    // ── Actions ────────────────────────────────────────────────────

    get preview() { return this.renderRoot.querySelector('ol-batch-preview'); }

    runBatch(action, keys, params = {}, extra = {}) {
        return this.preview.show({ action, items: keys.map((key) => ({ key })), records: keys.map((key) => this.rec(key)), params, title: this.t(extra.titleKey || 'preview'), ...extra });
    }

    async mergeChecks(action, keys, hrefBase) {
        const olids = keys.map(olid);
        return this.preview.show({
            mode: 'checks', action, items: keys.map((key) => ({ key })), records: keys.map((key) => this.rec(key)),
            href: `${hrefBase}?records=${olids.join(',')}`,
            title: action === 'merge_works' ? this.t('mergeWorks') : this.t('mergeAuthors'),
            summary: olids.length > 50 ? `${olids.length} records — the merge page loads at most 50 at a time.` : '',
        });
    }

    async moveHere() {
        let target = this.pageKey;
        if (keyType(target) === 'edition') {
            const r = this.rec(target).work ? this.rec(target) : (await api.records([target])).records?.[0];
            target = r?.work;
        }
        if (!target) return;
        return this.runBatch('move_editions', this.keysOf('edition'), { target }, { titleKey: 'moveHere', dropFromTray: true });
    }

    /** Record types with enough in the tray to merge. */
    get mergeable() {
        return (V1_ONLY ? ['work', 'author'] : ['work', 'author', 'edition']).filter((type) => this.groups[type].length > 1);
    }

    merge(type) {
        if (type === 'work') return this.mergeChecks('merge_works', this.keysOf('work'), '/works/merge');
        if (type === 'author') return this.mergeChecks('merge_authors', this.keysOf('author'), '/authors/merge');
        return this.runBatch('merge_editions', this.keysOf('edition'), {}, { titleKey: 'mergeEditions', dropFromTray: true });
    }

    /** One Merge row: goes straight to the only mergeable type, or asks which when several qualify. */
    mergeAction() {
        const types = this.mergeable;
        if (types.length === 1) return this.merge(types[0]);
        return this.openForm('merge');
    }

    get onWorkPage() {
        return ['work', 'edition'].includes(keyType(this.pageKey));
    }

    moveEditions(target) {
        if (target === 'here') return this.moveHere();
        return this.runBatch('move_editions', this.keysOf('edition'), { target: 'new' }, { titleKey: 'moveToNew', dropFromTray: true });
    }

    async submitForm() {
        const f = this._form;
        this._form = null;
        if (!f) return;
        if (f.kind === 'merge') return this.merge(f.mergeType);
        if (f.kind === 'move') return this.moveEditions(f.target);
        if (f.kind === 'set_author') {
            const keys = [...this.keysOf('work'), ...(f.includeEditions ? this.keysOf('edition') : [])];
            const mode = f.mode || 'add';
            return this.runBatch('set_author', keys, { author: f.author, replace: mode === 'replace' ? f.replace || null : null, include_editions: !!f.includeEditions, mode }, { titleKey: 'setAuthor' });
        }
        if (f.kind === 'flag') {
            return this.runBatch('flag', this.items.map((it) => it.key), { reason: f.reason }, { titleKey: 'flag' });
        }
        if (f.kind === 'delete') {
            return this.runBatch('delete', this.items.map((it) => it.key), { include_editions: !!f.includeEditions }, { titleKey: 'delete', dropFromTray: true });
        }
        if (f.kind === 'set_field') {
            const list = ['publishers', 'publish_places', 'languages', 'series'].includes(f.field);
            const value = list ? f.value.split(/[;,]\s*|\n/).map((s) => s.trim()).filter(Boolean) : f.value;
            return this.runBatch('set_field', this.keysOf('edition'), { field: f.field, value, mode: f.mode || 'set' }, { titleKey: 'setField' });
        }
        if (f.kind === 'add_to_list') {
            if (!f.list) return;
            this._busy = true;
            try {
                await api.addSeeds(this.username, f.list, this.items.map((it) => it.key));
                showToast(this.t('applied'));
            } catch (e) {
                showToast(this.t('failed', { error: e.message }), { type: 'error' });
            } finally {
                this._busy = false;
            }
        }
    }

    /**
     * The author editor starts from who is on the records now: one row per
     * distinct author across the tray's works and editions, with the records
     * each is on. Two rows sharing a name are flagged and pre-armed as a
     * replace of the lesser-known one, the usual duplicate-author cleanup.
     */
    async loadAuthorRows() {
        const keys = [...this.keysOf('work'), ...this.keysOf('edition')];
        let records = [];
        try { records = (await api.records(keys)).records || []; } catch { records = []; }
        if (this._form?.kind !== 'set_author') return;
        const rows = new Map();
        const onRecord = {};
        for (const rec of records) {
            onRecord[rec.key] = (rec.author_refs || []).map((a) => a.key);
            for (const a of rec.author_refs || []) {
                const row = rows.get(a.key) || { ...a, on: [] };
                row.on.push(rec.key);
                rows.set(a.key, row);
            }
        }
        const byName = {};
        for (const row of rows.values()) (byName[row.name.trim().toLowerCase()] ||= []).push(row);
        const form = { ...this._form, rows: [...rows.values()], onRecord, records: records.length };
        for (const group of Object.values(byName)) {
            if (group.length < 2) continue;
            for (const row of group) row.dup = true;
            if (form.mode === 'add' && !form.author) {
                // Keep the record that is on more of these records, then the one with dates.
                const [keep, drop] = [...group].sort((a, b) => b.on.length - a.on.length || !!(b.birth_date || b.death_date) - !!(a.birth_date || a.death_date));
                Object.assign(form, { mode: 'replace', replace: drop.key, author: keep.key, authorText: keep.name });
            }
        }
        this._form = form;
    }

    /** Removing `key` without a server-side remove: replace it with another author already on every record that has it. */
    removeVia(key) {
        const f = this._form;
        const holders = f.rows.find((r) => r.key === key)?.on || [];
        return f.rows.find((r) => r.key !== key && holders.every((rec) => (f.onRecord[rec] || []).includes(r.key))) || null;
    }

    async openForm(kind) {
        this._form = { kind, includeEditions: true, mode: 'add', reason: 'review', field: 'publishers', value: '', mergeType: this.mergeable[0], target: this.onWorkPage ? 'here' : 'new' };
        if (kind === 'set_author') await this.loadAuthorRows();
        if (kind === 'add_to_list' && this._lists === null && this.username) {
            try {
                const data = await api.myLists(this.username);
                this._lists = (data.entries || []).map((l) => ({ olid: l.url.split('/').pop(), name: l.name }));
            } catch {
                this._lists = [];
            }
        }
    }

    useId(e) {
        const { field, value, title } = e.detail;
        if (!this.pageKey) return;
        this.runBatch('set_identifier', [this.pageKey], { field, value }, { title: `${this.t('useId')}: ${field} = ${value}` });
        showToast(this.t('usedId', { field, title }));
    }

    exportCsv() {
        const rows = [['key', 'type', 'title', 'authors', 'year', 'note', 'done']];
        for (const it of this.items) {
            const r = this.rec(it.key);
            rows.push([it.key, r.type, r.title || '', (r.authors || []).join('; '), r.year || '', it.note || '', it.done ? '1' : '0']);
        }
        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'tray.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    openAll() {
        this.items.slice(0, 20).forEach((it) => window.open(it.key, '_blank', 'noopener'));
    }

    onBatchApplied(e) {
        if (e.detail.status === 'applied' && e.detail.dropFromTray) this.emit('ol-tray-remove', { keys: e.detail.keys });
        if (this._tab === 'batches') this.loadBatches();
    }

    async revertBatch(id) {
        try {
            await api.batchRevert(id);
            showToast(this.t('undone'));
        } catch (e) {
            showToast(this.t('failed', { error: e.message }), { type: 'error' });
        }
        this.loadBatches();
    }

    async decideBatch(id, apply) {
        try {
            if (apply) await api.batchApply(id); else await api.batchDecline(id);
            showToast(apply ? this.t('applied') : this.t('deleteSaved'));
        } catch (e) {
            showToast(this.t('failed', { error: e.message }), { type: 'error' });
        }
        this.loadBatches();
    }

    findDuplicates() {
        this._tab = 'lookup';
        this.updateComplete.then(() => this.renderRoot.querySelector('ol-tray-lookup')?.findDuplicates());
    }

    // ── Render ─────────────────────────────────────────────────────

    iconButton(name, label, onClick, size = 'x-small') {
        return html`<ol-button variant="ghost" shape="icon" size=${size} aria-label=${label} title=${label} @click=${onClick}><ol-icon name=${name} size="sm"></ol-icon></ol-button>`;
    }

    renderItem(it) {
        const r = this.rec(it.key);
        const title = r.title || olid(it.key);
        const sub = r.type === 'edition'
            ? [r.year, (r.publishers || [])[0], r.isbn].filter(Boolean).join(' · ')
            : r.type === 'author' ? [r.dates, Number.isFinite(r.work_count) ? this.t('workCount', { count: r.work_count }) : ''].filter(Boolean).join(' · ')
                : [(r.authors || []).join(', '), r.year, Number.isFinite(r.edition_count) ? this.t('editionCount', { count: r.edition_count }) : ''].filter(Boolean).join(' · ');
        return html`
            <li class="it" ?data-done=${it.done}>
                <input type="checkbox" .checked=${!!it.done} title=${this.t('done')} aria-label=${this.t('done')} @change=${(e) => this.emit('ol-tray-done', { key: it.key, value: e.target.checked })}>
                <ol-book-cover size="small" src=${it.edition ? `https://covers.openlibrary.org/b/olid/${olid(it.edition)}-M.jpg` : (r.cover || '')} book-title=${title} authors=${(r.authors || []).join(', ')}></ol-book-cover>
                <div>
                    <div class="t"><a href=${it.key}>${title}</a></div>
                    ${sub ? html`<div class="s">${sub}</div>` : nothing}
                    ${it.note ? html`<div class="note">${it.note}</div>` : nothing}
                </div>
                <span class="acts">
                    ${V1_ONLY ? nothing : this.iconButton('sticky-note', this.t('note'), () => this.editNote(it))}
                    ${this.iconButton('x', this.t('remove', { title }), () => this.remove(it.key))}
                </span>
            </li>`;
    }

    renderGroup(type) {
        const items = this.groups[type];
        if (!items.length) return nothing;
        return html`
            <div>
                <h3>${this.t(TYPE_LABEL[type])} <span class="n">${items.length}</span></h3>
                <ul>${items.map((it) => this.renderItem(it))}</ul>
            </div>`;
    }

    actionButton(label, onClick, { enabled = true, why = '', icon = '' } = {}) {
        return html`
            <ol-button class="act" full-width size="small" variant="secondary" ?disabled=${!enabled} @click=${onClick}>
                ${icon ? html`<ol-icon slot="icon-start" name=${icon}></ol-icon>` : nothing}
                <span>${label}</span>
                ${why ? html`<span class="act__why">${why}</span>` : nothing}
            </ol-button>`;
    }

    renderActions() {
        const g = this.groups;
        const nW = g.work.length;
        const nE = g.edition.length;
        const total = this.items.length;
        const cnt = (n) => String(n);
        const mergeable = this.mergeable;
        const mergeLabel = mergeable.length === 1 ? this.t(MERGE_LABEL[mergeable[0]]) : this.t('mergeRecords');
        const mergeCount = mergeable.reduce((n, type) => n + g[type].length, 0);
        const rows = [
            [this.t('manageSubjects'), () => this.emit('ol-tray-manage-subjects', { keys: this.keysOf('work') }), { enabled: nW > 0, why: nW ? cnt(nW) : this.t('needsWorks'), icon: 'pencil', gate: 'manageSubjects' }],
            [mergeLabel, () => this.mergeAction(), { enabled: mergeable.length > 0, why: mergeable.length ? cnt(mergeCount) : this.t('needsTwo'), gate: 'merge' }],
            [this.t('moveEditions'), () => this.openForm('move'), { enabled: nE > 0, why: nE ? cnt(nE) : this.t('needsEditions'), gate: 'moveEditions' }],
            [this.t('splitView'), () => this.renderRoot.querySelector('ol-tray-split').show(), { enabled: nE > 0, why: nE ? cnt(nE) : this.t('needsEditions'), icon: 'layout-grid', gate: 'splitView' }],
            [this.t('setAuthor'), () => this.openForm('set_author'), { enabled: nW + nE > 0, why: nW + nE ? cnt(nW + nE) : this.t('needsWorks'), gate: 'setAuthor' }],
            [this.t('setField'), () => this.openForm('set_field'), { enabled: nE > 0, why: nE ? cnt(nE) : this.t('needsEditions'), gate: 'setField' }],
            [this.t('addToList'), () => this.openForm('add_to_list'), { enabled: total > 0, why: cnt(total), icon: 'list-plus', gate: 'addToList' }],
            [this.t('flag'), () => this.openForm('flag'), { enabled: total > 0, why: cnt(total), gate: 'flag' }],
            ...(this.canApply ? [[this.t('delete'), () => this.openForm('delete'), { enabled: total > 0, why: cnt(total), icon: 'trash', gate: 'delete' }]] : []),
        ].filter(([, , o]) => !V1_ONLY || V1_ACTIONS.has(o.gate));
        // Only actions the selection can use are shown; an empty tray shows
        // everything so the list doubles as a menu of what the tray can do.
        const shown = total ? rows.filter(([, , o]) => o.enabled) : rows;
        return html`
            <div class="actions">
                ${this._form ? this.renderForm() : nothing}
                ${shown.map(([label, onClick, opts]) => this.actionButton(label, onClick, opts))}
                <div class="row">
                    <ol-button size="x-small" variant="secondary" ?disabled=${!total} @click=${this.exportCsv}>${this.t('export')}</ol-button>
                    <ol-button size="x-small" variant="secondary" ?disabled=${!total} @click=${this.openAll}>${this.t('openAll')}</ol-button>
                    ${V1_ONLY ? nothing : html`<ol-button size="x-small" variant="secondary" ?disabled=${!this.pageKey} @click=${this.findDuplicates}>${this.t('findDuplicates')}</ol-button>`}
                </div>
            </div>`;
    }

    renderForm() {
        const f = this._form;
        const set = (k) => (e) => { this._form = { ...this._form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }; };
        let fields = nothing;
        const radios = (name, options, onChange = set(name)) => options.map(([v, label]) => html`
            <label class="check"><input type="radio" name=${name} value=${v} .checked=${f[name] === v} @change=${onChange}>${label}</label>`);
        if (f.kind === 'merge') {
            fields = html`<span class="lbl">${this.t('mergeWhich')}</span>${radios('mergeType', this.mergeable.map((type) => [type, `${this.t(MERGE_LABEL[type])} (${this.groups[type].length})`]))}`;
        } else if (f.kind === 'move') {
            fields = html`<span class="lbl">${this.t('moveTarget')}</span>${radios('target', [
                ...(this.onWorkPage ? [['here', this.t('thisWork')]] : []),
                ['new', this.t('newWork')],
            ])}`;
        } else if (f.kind === 'set_author') {
            fields = this.renderAuthorForm(f, set, radios);
        } else if (f.kind === 'flag') {
            fields = html`
                <label>${this.t('reason')}
                    <select .value=${f.reason} @change=${set('reason')}>
                        ${[['review', 'review'], ['spam', 'spam'], ['non_book', 'nonBook'], ['duplicate', 'duplicate'], ['delete', 'toDelete']].map(([v, l]) => html`<option value=${v}>${this.t(l)}</option>`)}
                    </select></label>`;
        } else if (f.kind === 'delete') {
            fields = html`<label class="check"><input type="checkbox" .checked=${!!f.includeEditions} @change=${set('includeEditions')}>${this.t('includeEditions')}</label>`;
        } else if (f.kind === 'set_field') {
            fields = html`
                <label>${this.t('field')}<select .value=${f.field} @change=${set('field')}>${SET_FIELDS.map((x) => html`<option value=${x}>${x}</option>`)}</select></label>
                <label>${this.t('value')}<input type="text" .value=${f.value} @input=${set('value')}></label>
                <label>${this.t('sortBy')}<select .value=${f.mode || 'set'} @change=${set('mode')}><option value="set">set</option><option value="append">append</option></select></label>`;
        } else if (f.kind === 'add_to_list') {
            const seeds = this.items.map((it) => olid(it.key)).join(',');
            fields = html`
                <label>${this.t('addToList')}
                    <select .value=${f.list || ''} @change=${set('list')}>
                        <option value="">—</option>
                        ${(this._lists || []).map((l) => html`<option value=${l.olid}>${l.name}</option>`)}
                    </select></label>
                <a href=${`/account/lists/add?seeds=${seeds}`} target="_blank" rel="noopener">${this.t('addToList')} → new</a>`;
        }
        return html`
            <div class="form">
                ${fields}
                <div class="btns">
                    <ol-button size="x-small" variant="ghost" @click=${() => { this._form = null; }}>${this.t('cancel')}</ol-button>
                    <ol-button size="x-small" variant="primary" ?disabled=${this._busy} @click=${this.submitForm}>${f.kind === 'add_to_list' ? this.t('add') : this.t('preview')}</ol-button>
                </div>
            </div>`;
    }

    renderAuthorRow(r, f, arm) {
        const rm = this.removeVia(r.key);
        const dates = r.birth_date || r.death_date ? `${r.birth_date || '?'} – ${r.death_date || ''}` : '';
        const meta = [dates, f.records > 1 ? this.t('authorOn', { count: r.on.length }) : ''].filter(Boolean).join(' · ');
        return html`
            <li class="author-row" ?data-target=${f.mode === 'replace' && f.replace === r.key}>
                <div class="who">
                    <span class="t">${r.name} <small>${olid(r.key)}</small></span>
                    <span class="s">${meta}${r.dup ? html`${meta ? ' · ' : ''}<em>${this.t('sameName')}</em>` : nothing}</span>
                </div>
                <ol-button size="x-small" variant="secondary" @click=${() => arm(r, null)}>${this.t('replaceRow')}</ol-button>
                <ol-button size="x-small" variant="secondary" ?disabled=${!rm} title=${rm ? nothing : this.t('removeBlocked')} @click=${() => arm(r, rm)}>${this.t('removeRow')}</ol-button>
            </li>`;
    }

    renderAuthorForm(f, set, radios) {
        const rows = f.rows;
        const setMode = (e) => {
            const mode = e.target.value;
            // Setting a single author rewrites edition lists wholesale; don't fan that out by default.
            this._form = { ...this._form, mode, includeEditions: mode !== 'set', ...(mode === 'replace' ? {} : { replace: null, via: null }) };
        };
        const arm = (row, via) => {
            const next = { ...this._form, mode: 'replace', replace: row.key, via: via ? via.key : null };
            if (via) Object.assign(next, { author: via.key, authorText: via.name });
            else if (this._form.via) Object.assign(next, { author: '', authorText: '' });
            this._form = next;
        };
        const replacing = rows?.find((r) => r.key === f.replace);
        const via = f.via ? rows.find((r) => r.key === f.via) : null;
        // Same-name authors are told apart by OLID wherever a row is named in prose.
        const who = (r) => (r.dup ? `${r.name} (${olid(r.key)})` : r.name);
        const fieldLabel = f.mode === 'replace' ? this.t('replaceWith', { name: replacing ? who(replacing) : '…' }) : f.mode === 'set' ? this.t('onlyAuthor') : this.t('authorToAdd');
        return html`
            <span class="lbl">${this.t('currentAuthors')}</span>
            ${!rows ? html`<p class="empty">${this.t('working')}</p>` : !rows.length ? html`<p class="empty">${this.t('noAuthors')}</p>` : html`
                <ul class="authors">${rows.map((r) => this.renderAuthorRow(r, f, arm))}</ul>`}
            <div class="row">${radios('mode', [['add', this.t('modeAdd')], ['replace', this.t('modeReplace')], ['set', this.t('modeSet')]], setMode)}</div>
            ${via && replacing ? html`<p class="hint">${this.t('removeHow', { old: who(replacing), via: who(via) })}${f.includeEditions ? ` ${this.t('removeEditionsNote', { old: who(replacing), via: who(via) })}` : ''}</p>` : html`
                <label @click=${(e) => e.currentTarget.querySelector('ol-autocomplete').focus()}>${fieldLabel}
                    <ol-autocomplete kind="author" .value=${f.authorText || ''} .key=${f.authorText && f.author !== f.authorText ? f.author : null} placeholder=${this.t('authorPlaceholder')} label=${fieldLabel} no-results-text=${this.t('noMatches')}
                        @ol-autocomplete-input=${(e) => { this._form = { ...this._form, author: e.detail.value, authorText: e.detail.value }; }}
                        @ol-autocomplete-select=${(e) => { this._form = { ...this._form, author: e.detail.key, authorText: e.detail.name }; }}
                        @ol-autocomplete-submit=${this.submitForm}></ol-autocomplete>
                </label>`}
            <label class="check"><input type="checkbox" .checked=${!!f.includeEditions} @change=${set('includeEditions')}>${this.t('includeEditions')}</label>`;
    }

    renderBatchRecords(items) {
        const first = items.find((it) => it.title) || items[0];
        if (!first) return nothing;
        const rest = items.length - 1;
        return html`<div class="recs"><a href=${first.key}>${first.title || first.key}</a>${rest > 0 ? html` <span class="more">${this.t('nMore', { n: rest })}</span>` : nothing}</div>`;
    }

    renderBatches() {
        if (this._batches === null) return html`<p class="empty">${this.t('working')}</p>`;
        if (!this._batches.length) return html`<p class="empty">${this.t('noResults')}</p>`;
        return html`
            <ul>
                ${this._batches.map((b) => html`
                    <li class="b">
                        <div class="h"><span class="st" data-s=${b.status}>${b.status.replace('_', ' ')}</span><strong>#${b.id}</strong><span>${b.action.replace('_', ' ')}</span></div>
                        <div class="sum">${b.summary || `${(b.changes || []).length} changes · ${(b.items || []).length} records`}</div>
                        ${this.renderBatchRecords(b.items || [])}
                        <div class="when">${(b.created || '').replace('T', ' ').slice(0, 16)}${b.comment ? ` · ${b.comment}` : ''}</div>
                        <div class="acts">
                            ${['applied', 'partially_reverted'].includes(b.status) ? html`<ol-button size="x-small" variant="secondary" @click=${() => this.revertBatch(b.id)}><ol-icon slot="icon-start" name="undo"></ol-icon>${this.t('undo')}</ol-button>` : nothing}
                            ${b.status === 'requested' && this.canApply ? html`
                                <ol-button size="x-small" variant="primary" @click=${() => this.decideBatch(b.id, true)}>${this.t('apply')}</ol-button>
                                <ol-button size="x-small" variant="secondary" @click=${() => this.decideBatch(b.id, false)}>${this.t('deleteSaved')}</ol-button>` : nothing}
                            ${b.mrid ? html`<ol-button size="x-small" variant="ghost" href=${`/merges?mrid=${b.mrid}`}>#${b.mrid}</ol-button>` : nothing}
                        </div>
                    </li>`)}
            </ul>`;
    }

    render() {
        const total = this.items.length;
        const editions = this.keysOf('edition').map((k) => this.rec(k));
        return html`
            <div class="pill">
                <ol-button variant="primary" elevation="floating" aria-label=${this.t('expand')} @click=${this.toggleCollapse}>
                    <ol-icon slot="icon-start" name="wand"></ol-icon>${this.t('tray')}<span class="n">${total}</span>
                </ol-button>
            </div>
            <section class="panel" aria-label=${this.t('tray')}>
                <div class="resizer" role="separator" aria-orientation="vertical" tabindex="0"
                    aria-label=${this.t('resize')} title=${this.t('resizeHint')}
                    aria-valuemin=${WIDTH_MIN} aria-valuemax=${this.maxWidth} aria-valuenow=${this.width}
                    @pointerdown=${this.onResizeStart} @keydown=${this.onResizeKey} @dblclick=${() => this.setWidth(WIDTH_DEFAULT, true)}></div>
                <header>
                    <h2>${this.t('tray')}</h2>
                    <span class="count">${this.t('count', { count: total })}</span>
                    <span class="sp"></span>
                    <ol-menu-popover label=${this.t('settings')} heading="" .items=${this.menuItems} @ol-menu-popover-select=${this.onMenu}>
                        <ol-button slot="trigger" variant="ghost" shape="icon" size="small" no-chevron aria-label=${this.t('settings')}><ol-icon name="ellipsis"></ol-icon></ol-button>
                    </ol-menu-popover>
                    ${this.iconButton('chevron-right', this.t('collapse'), this.toggleCollapse, 'small')}
                </header>
                <div class="tabs">
                    <ol-segmented-control full-width size="small" .value=${this._tab} accessible-label=${this.t('tray')} @ol-segmented-control-change=${(e) => { this._tab = e.detail.value; }}>
                        ${TABS.map((tab) => html`<ol-segment value=${tab}>${this.t(tab)}</ol-segment>`)}
                    </ol-segmented-control>
                </div>
                ${this._tab === 'tray' ? html`
                    <div class="body">
                        ${!total ? html`<p class="empty">${this.t('empty')}</p>` : nothing}
                        ${this.renderGroup('work')}
                        ${this.renderGroup('edition')}
                        ${this.renderGroup('author')}
                        <div class="paste">
                            <textarea rows="1" .value=${this._paste} placeholder=${this.t('pasteOlids')} aria-label=${this.t('pasteOlids')} @input=${(e) => { this._paste = e.target.value; }}></textarea>
                            <div class="row">
                                <ol-button size="x-small" variant="secondary" ?disabled=${!this._paste.trim()} @click=${this.addPasted}>${this.t('add')}</ol-button>
                                ${this.pageKeys.length ? html`<ol-button size="x-small" variant="secondary" @click=${() => this.emit('ol-tray-add-page')}>${this.t('addAll')} (${this.pageKeys.length})</ol-button>` : nothing}
                                ${total && !this._confirmClear ? html`<ol-button size="x-small" variant="ghost" @click=${this.clear}>${this.t('clear')}</ol-button>` : nothing}
                            </div>
                            ${this._confirmClear ? html`
                                <div class="row confirm" role="alertdialog" aria-label=${this.t('clearConfirm')}>
                                    <span>${this.t('clearConfirm')}</span>
                                    <ol-button size="x-small" variant="primary" @click=${this.clear}>${this.t('clear')}</ol-button>
                                    <ol-button size="x-small" variant="ghost" @click=${() => { this._confirmClear = false; }}>${this.t('cancel')}</ol-button>
                                </div>` : nothing}
                        </div>
                    </div>
                    ${this.renderActions()}
                    <div class="kbd">${this.t('keyboardHint')}</div>
                ` : nothing}
                ${this._tab === 'lookup' && !V1_ONLY ? html`<div class="body"><ol-tray-lookup page-key=${this.pageKey} .trayKeys=${this.items.map((it) => it.key)} .labels=${this.labels} @ol-lookup-use-id=${this.useId}></ol-tray-lookup></div>` : nothing}
                ${this._tab === 'batches' ? html`<div class="body">${this.renderBatches()}</div>` : nothing}
            </section>
            <ol-batch-preview ?can-apply=${this.canApply} .labels=${this.labels} @ol-batch-applied=${this.onBatchApplied}></ol-batch-preview>
            ${V1_ONLY ? nothing : html`<ol-tray-split ?can-apply=${this.canApply} .labels=${this.labels} .editions=${editions} @ol-batch-applied=${this.onBatchApplied}></ol-tray-split>`}
        `;
    }
}

customElements.define('ol-librarian-tray', OlLibrarianTray);

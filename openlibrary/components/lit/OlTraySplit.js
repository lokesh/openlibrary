import { LitElement, html, css, nothing } from 'lit';
import { translate } from './utils/labels.js';
import { DEFAULT_LABELS } from './librarian-tray-labels.js';
import { api, normalizeKey, olid } from '../../plugins/openlibrary/js/editing-mode/api.js';
import './OlDialog.js';
import './OLButton.js';
import './OLChip.js';
import './OlBookCover.js';
import './OlIcon.js';
import './OlAutocomplete.js';

const SORTS = ['year', 'title', 'publisher', 'language'];

/**
 * The split view: de-conflating a work. Editions from the tray on the left,
 * target works on the right (existing ones by OLID, or "New work"); assign
 * editions to targets, then preview and apply one move batch per target.
 * LibraryThing's Separate page, with a preview.
 *
 * @element ol-tray-split
 *
 * @prop {Array} editions - Hydrated edition records from the tray
 * @prop {Boolean} canApply - Whether the viewer is a super-librarian
 * @prop {Object} labels - Translated strings, merged over DEFAULT_LABELS
 *
 * @fires ol-batch-applied - detail: { batch_id, action, keys }
 */
export class OlTraySplit extends LitElement {
    static properties = {
        editions: { type: Array },
        canApply: { type: Boolean, attribute: 'can-apply' },
        labels: { type: Object },
        _open: { state: true },
        _sort: { state: true },
        _checked: { state: true },
        _targets: { state: true },
        _assign: { state: true },
        _targetInput: { state: true },
        _previews: { state: true },
        _results: { state: true },
        _busy: { state: true },
        _error: { state: true },
    };

    static styles = css`
        :host { display: contents; font-family: var(--font-family-body); font-size: var(--font-size-body-small); color: var(--color-text); }
        .grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: var(--spacing-md); min-height: 50vh; }
        @media (max-width: 767px) { .grid { grid-template-columns: 1fr; } }
        h4 { margin: 0 0 var(--spacing-2xs); font-size: var(--font-size-overline); font-weight: var(--font-weight-overline); letter-spacing: var(--letter-spacing-overline); text-transform: var(--text-transform-overline); color: var(--color-text-secondary); display: flex; align-items: center; gap: var(--spacing-xs); }
        h4 select { margin-left: auto; height: var(--control-height-small); font: inherit; font-size: 16px; text-transform: none; letter-spacing: 0; border: var(--border-input); border-radius: var(--border-radius-input); background: var(--color-surface); }
        ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--spacing-2xs); max-height: 60vh; overflow: auto; }
        .ed { display: grid; grid-template-columns: auto 34px 1fr; gap: var(--spacing-xs); align-items: center; padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--border-radius-md); background: var(--color-surface); border: var(--border-width) solid var(--color-border-muted); }
        .ed[data-assigned] { border-color: var(--color-control-selected-border); background: var(--color-control-selected-bg); }
        .ed ol-book-cover { width: 34px; height: 48px; }
        .ed .t { font-weight: var(--font-weight-medium); }
        .ed .s { color: var(--color-text-secondary); font-size: var(--font-size-label-medium); }
        .ed .where { font-size: var(--font-size-label-small); color: var(--color-primary); }
        .targets { display: grid; gap: var(--spacing-sm); align-content: start; }
        .target { padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--border-radius-md); border: var(--border-width) solid var(--color-border); background: var(--color-surface); display: grid; gap: var(--spacing-2xs); }
        .target .name { font-weight: var(--font-weight-medium); display: flex; align-items: center; gap: var(--spacing-xs); }
        .target .name small { color: var(--color-text-muted); font-weight: var(--font-weight-regular); }
        .target .name ol-button { margin-left: auto; }
        .target .members { display: flex; flex-wrap: wrap; gap: var(--spacing-2xs); }
        .addt { display: flex; gap: var(--spacing-2xs); }
        .addt ol-autocomplete { flex: 1; min-width: 0; }
        input[type="text"] { flex: 1; min-width: 0; height: var(--control-height-small); box-sizing: border-box; font: inherit; font-size: 16px; padding: 0 var(--spacing-xs); border: var(--border-input); border-radius: var(--border-radius-input); }
        input:focus-visible, select:focus-visible { outline: none; border: var(--border-input-focused); box-shadow: var(--box-shadow-focus); }
        @media (hover: hover) and (pointer: fine) { h4 select, input[type="text"] { font-size: var(--font-size-body-medium); } }
        .footer { display: flex; gap: var(--spacing-xs); justify-content: flex-end; align-items: center; flex-wrap: wrap; }
        .preview { display: grid; gap: var(--spacing-xs); }
        .pv { padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--border-radius-md); border: var(--border-width) solid var(--color-border-muted); }
        .pv .w { color: var(--color-warning-fg); }
        .pv .b { color: var(--color-error-fg); }
        .ok { color: var(--color-success-fg); }
        .error { color: var(--color-error-fg); }
        .muted { color: var(--color-text-muted); }
        a { color: var(--color-link); }
    `;

    constructor() {
        super();
        this.editions = [];
        this.canApply = false;
        this.labels = {};
        this._open = false;
        this._sort = 'year';
        this._checked = new Set();
        this._targets = [{ id: 'new', key: 'new', title: '', isNew: true }];
        this._assign = new Map();
        this._targetInput = '';
        this._previews = null;
        this._results = null;
        this._busy = false;
        this._error = null;
    }

    t(key, vars) {
        return translate(this.labels, DEFAULT_LABELS, key, vars);
    }

    async show() {
        this._checked = new Set();
        this._assign = new Map();
        this._previews = null;
        this._results = null;
        this._error = null;
        this._open = true;
        await this.updateComplete;
        this.renderRoot.querySelector('ol-dialog').open = true;
    }

    close() {
        const d = this.renderRoot.querySelector('ol-dialog');
        if (d) d.open = false;
    }

    get sorted() {
        const key = this._sort;
        const pick = (e) => (key === 'year' ? (e.year || 0) : key === 'publisher' ? (e.publishers?.[0] || '') : key === 'language' ? (e.language?.[0] || '') : (e.title || ''));
        return [...this.editions].sort((a, b) => {
            const av = pick(a);
            const bv = pick(b);
            return av < bv ? -1 : av > bv ? 1 : 0;
        });
    }

    toggle(key, on) {
        const next = new Set(this._checked);
        if (on) next.add(key); else next.delete(key);
        this._checked = next;
    }

    async addTarget(picked) {
        const key = picked || normalizeKey(this._targetInput);
        if (!key || !key.startsWith('/works/')) { this._error = this.t('splitNeedsWork'); return; }
        if (this._targets.some((t) => t.key === key)) return;
        this._error = null;
        try {
            const data = await api.records([key]);
            const rec = data.records?.[0];
            this._targets = [...this._targets, { id: key, key, title: rec?.title || olid(key), authors: rec?.authors || [] }];
            this._targetInput = '';
        } catch (e) {
            this._error = e.message;
        }
    }

    removeTarget(id) {
        this._targets = this._targets.filter((t) => t.id !== id);
        const next = new Map(this._assign);
        for (const [k, v] of next) if (v === id) next.delete(k);
        this._assign = next;
    }

    moveCheckedTo(id) {
        const next = new Map(this._assign);
        for (const k of this._checked) next.set(k, id);
        this._assign = next;
        this._checked = new Set();
    }

    unassign(key) {
        const next = new Map(this._assign);
        next.delete(key);
        this._assign = next;
    }

    groups() {
        const out = new Map();
        for (const [k, id] of this._assign) {
            if (!out.has(id)) out.set(id, []);
            out.get(id).push(k);
        }
        return out;
    }

    async preview() {
        this._busy = true;
        this._error = null;
        this._previews = [];
        try {
            for (const [id, keys] of this.groups()) {
                const target = this._targets.find((t) => t.id === id);
                if (!target) continue;
                const p = await api.batch({ action: 'move_editions', items: keys.map((key) => ({ key })), params: { target: target.isNew ? 'new' : target.key }, dry_run: true });
                this._previews = [...this._previews, { id, target, keys, preview: p }];
            }
        } catch (e) {
            this._error = e.message;
        } finally {
            this._busy = false;
        }
    }

    async applyAll() {
        this._busy = true;
        this._error = null;
        this._results = [];
        try {
            for (const pv of this._previews) {
                const blocks = (pv.preview.warnings || []).filter((w) => w.level === 'block').map((w) => w.code);
                const items = pv.keys.map((key) => ({ key, expected_revision: pv.preview.revisions?.[key] ?? null }));
                const r = await api.batch({ action: 'move_editions', items, params: { target: pv.target.isNew ? 'new' : pv.target.key }, dry_run: false, overrides: this.canApply ? blocks : [] });
                this._results = [...this._results, { ...pv, result: r }];
                this.dispatchEvent(new CustomEvent('ol-batch-applied', { bubbles: true, composed: true, detail: { batch_id: r.batch_id, action: 'move_editions', status: r.status, keys: pv.keys } }));
            }
        } catch (e) {
            this._error = e.message;
        } finally {
            this._busy = false;
        }
    }

    renderEdition(e) {
        const assigned = this._assign.get(e.key);
        const target = assigned && this._targets.find((t) => t.id === assigned);
        return html`
            <li class="ed" ?data-assigned=${!!assigned}>
                <input type="checkbox" .checked=${this._checked.has(e.key)} @change=${(ev) => this.toggle(e.key, ev.target.checked)} aria-label=${e.title}>
                <ol-book-cover size="small" src=${e.cover || ''} book-title=${e.title || olid(e.key)} authors=${(e.authors || []).join(', ')}></ol-book-cover>
                <div>
                    <div class="t"><a href=${e.key} target="_blank" rel="noopener">${e.title}</a> <span class="muted">${olid(e.key)}</span></div>
                    <div class="s">${[e.year, (e.publishers || [])[0], (e.language || []).join('/'), e.isbn, e.by_statement].filter(Boolean).join(' · ')}</div>
                    ${target ? html`<div class="where">→ ${target.isNew ? this.t('splitNewWork') : target.title}</div>` : nothing}
                </div>
            </li>`;
    }

    renderTarget(t) {
        const members = [...this._assign].filter(([, id]) => id === t.id).map(([k]) => k);
        return html`
            <div class="target">
                <div class="name">
                    <ol-icon name=${t.isNew ? 'plus' : 'book-open'} size="sm"></ol-icon>
                    ${t.isNew ? this.t('splitNewWork') : html`<a href=${t.key} target="_blank" rel="noopener">${t.title}</a>`}
                    ${t.isNew ? nothing : html`<small>${olid(t.key)}${t.authors?.length ? ` · ${t.authors.join(', ')}` : ''}</small>`}
                    ${t.isNew ? nothing : html`<ol-button size="x-small" variant="ghost" shape="icon" aria-label=${this.t('remove', { title: t.title })} @click=${() => this.removeTarget(t.id)}><ol-icon name="x" size="sm"></ol-icon></ol-button>`}
                </div>
                <div class="members">
                    ${members.map((k) => html`<ol-chip size="small" variant="neutral" selected accessible-label=${this.t('remove', { title: olid(k) })} @ol-chip-select=${() => this.unassign(k)}>${olid(k)}</ol-chip>`)}
                    ${!members.length ? html`<span class="muted">—</span>` : nothing}
                </div>
                <ol-button size="small" variant="secondary" ?disabled=${!this._checked.size} @click=${() => this.moveCheckedTo(t.id)}>${this.t('splitMoveTo')} ${t.isNew ? this.t('splitNewWork').toLowerCase() : olid(t.key)} (${this._checked.size})</ol-button>
            </div>`;
    }

    renderPreviews() {
        if (!this._previews) return nothing;
        return html`
            <div class="preview">
                ${this._previews.map((pv) => {
        const res = this._results?.find((r) => r.id === pv.id)?.result;
        return html`
                        <div class="pv">
                            <strong>${pv.preview.summary}</strong>
                            ${(pv.preview.warnings || []).map((w) => html`<div class=${w.level === 'block' ? 'b' : w.level === 'warn' ? 'w' : 'muted'}>${w.text}</div>`)}
                            ${res ? html`<div class="ok">${res.status === 'requested' ? this.t('requested') : `${this.t('applied')} · #${res.batch_id}`}</div>` : nothing}
                        </div>`;
    })}
            </div>`;
    }

    render() {
        if (!this._open) return nothing;
        const done = !!this._results && this._results.length === this._previews?.length;
        return html`
            <ol-dialog label=${this.t('splitTitle')} width="large" fullscreen-on-mobile @ol-after-close=${() => { this._open = false; }}>
                <div class="grid" aria-busy=${this._busy ? 'true' : 'false'}>
                    <div>
                        <h4>${this.t('splitSource')} · ${this.editions.length}
                            <select aria-label=${this.t('sortBy')} .value=${this._sort} @change=${(e) => { this._sort = e.target.value; }}>
                                ${SORTS.map((s) => html`<option value=${s}>${this.t(s)}</option>`)}
                            </select>
                        </h4>
                        <ul>${this.sorted.map((e) => this.renderEdition(e))}</ul>
                    </div>
                    <div class="targets">
                        <h4>${this.t('splitTarget')}</h4>
                        ${this._targets.map((t) => this.renderTarget(t))}
                        <div class="addt">
                            <ol-autocomplete kind="work" clear-on-select .value=${this._targetInput} placeholder=${this.t('splitAddTarget')} label=${this.t('splitAddTarget')} no-results-text=${this.t('noMatches')}
                                @ol-autocomplete-input=${(e) => { this._targetInput = e.detail.value; }}
                                @ol-autocomplete-select=${(e) => this.addTarget(e.detail.key)}
                                @ol-autocomplete-submit=${() => this.addTarget()}></ol-autocomplete>
                            <ol-button size="small" variant="secondary" @click=${() => this.addTarget()}>${this.t('add')}</ol-button>
                        </div>
                        ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : nothing}
                        ${this.renderPreviews()}
                    </div>
                </div>
                <div slot="footer" class="footer">
                    <ol-button variant="ghost" @click=${this.close}>${done ? this.t('close') : this.t('cancel')}</ol-button>
                    ${!this._previews ? html`<ol-button variant="primary" ?disabled=${!this._assign.size} ?loading=${this._busy} @click=${this.preview}>${this.t('splitApply')}</ol-button>` : nothing}
                    ${this._previews && !done ? html`<ol-button variant="primary" ?loading=${this._busy} @click=${this.applyAll}>${this.canApply ? this.t('apply') : this.t('request')}</ol-button>` : nothing}
                </div>
            </ol-dialog>`;
    }
}

customElements.define('ol-tray-split', OlTraySplit);

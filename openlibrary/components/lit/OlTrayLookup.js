import { LitElement, html, css, nothing } from 'lit';
import { translate } from './utils/labels.js';
import { DEFAULT_LABELS } from './librarian-tray-labels.js';
import { api, keyType, olid } from '../../plugins/openlibrary/js/editing-mode/api.js';
import { debounce } from '../../plugins/openlibrary/js/nonjquery_utils.js';
import './OlIcon.js';
import './OLButton.js';
import './OLChip.js';

const SOURCES = ['ol', 'wikidata', 'viaf', 'lc', 'ia'];
const SOURCE_LABELS = { ol: 'Open Library', wikidata: 'Wikidata', viaf: 'VIAF', lc: 'LC Names', ia: 'Internet Archive' };

/**
 * The tray's Look up tab: one search box, source chips, actionable results.
 * Pre-filled from the page's record, with a "find duplicates" query for it.
 *
 * @element ol-tray-lookup
 *
 * @prop {String} pageKey - The record of the page the tray is on, if any
 * @prop {Array} trayKeys - Keys already in the tray (to mark results)
 * @prop {Object} labels - Translated strings, merged over DEFAULT_LABELS
 *
 * @fires ol-tray-add - detail: { keys }
 * @fires ol-lookup-use-id - detail: { field, value, title }
 */
export class OlTrayLookup extends LitElement {
    static properties = {
        pageKey: { type: String, attribute: 'page-key' },
        trayKeys: { type: Array },
        labels: { type: Object },
        _q: { state: true },
        _kind: { state: true },
        _sources: { state: true },
        _results: { state: true },
        _busy: { state: true },
        _prefilled: { state: true },
        _dupes: { state: true },
    };

    static styles = css`
        :host { display: grid; gap: var(--spacing-sm); font-family: var(--font-family-body); font-size: var(--font-size-body-small); color: var(--color-text); }
        .box { display: flex; gap: var(--spacing-2xs); align-items: center; }
        input[type="search"] { flex: 1; min-width: 0; height: var(--control-height-medium); box-sizing: border-box; font: inherit; font-size: 16px; padding: 0 var(--spacing-sm); border: var(--border-input); border-radius: var(--border-radius-input); background: var(--color-surface); }
        input:focus-visible { outline: none; border: var(--border-input-focused); box-shadow: var(--box-shadow-focus); }
        @media (hover: hover) and (pointer: fine) { input[type="search"] { font-size: var(--font-size-body-medium); } }
        .chips { display: flex; flex-wrap: wrap; gap: var(--spacing-2xs); }
        .hint { color: var(--color-text-muted); font-size: var(--font-size-label-medium); margin: 0; }
        ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--spacing-2xs); }
        li { display: grid; grid-template-columns: 1fr auto; gap: var(--spacing-xs); align-items: center; padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--border-radius-md); background: var(--color-surface); border: var(--border-width) solid var(--color-border-muted); }
        li.err { color: var(--color-text-muted); font-style: italic; grid-template-columns: 1fr; }
        .src { font-size: var(--font-size-overline); font-weight: var(--font-weight-overline); letter-spacing: var(--letter-spacing-overline); text-transform: var(--text-transform-overline); color: var(--color-text-muted); }
        .title { font-weight: var(--font-weight-medium); }
        .sub { color: var(--color-text-secondary); font-size: var(--font-size-label-medium); }
        .acts { display: flex; gap: var(--spacing-2xs); }
    `;

    constructor() {
        super();
        this.pageKey = '';
        this.trayKeys = [];
        this.labels = {};
        this._q = '';
        this._kind = '';
        this._sources = ['ol', 'wikidata'];
        this._results = null;
        this._busy = false;
        this._prefilled = false;
        this._dupes = null;
        this._search = debounce(() => this.search(), 350);
    }

    t(key, vars) {
        return translate(this.labels, DEFAULT_LABELS, key, vars);
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.pageKey && !this._q) this.prefill();
    }

    updated(changed) {
        if (changed.has('pageKey') && this.pageKey && !this._q) this.prefill();
    }

    async prefill() {
        try {
            const data = await api.lookup({ key: this.pageKey });
            if (data.prefill?.q) {
                this._q = data.prefill.q;
                this._kind = data.prefill.kind || '';
                this._prefilled = true;
                if (this._kind === 'author') this._sources = ['ol', 'wikidata', 'viaf', 'lc'];
                if (this._kind === 'edition') this._sources = ['ol', 'ia'];
                this.search();
            }
        } catch { /* leave the box empty */ }
    }

    onInput(e) {
        this._q = e.target.value;
        this._prefilled = false;
        this._search();
    }

    toggleSource(s) {
        this._sources = this._sources.includes(s) ? this._sources.filter((x) => x !== s) : [...this._sources, s];
        this.search();
    }

    async search() {
        const q = this._q.trim();
        this._dupes = null;
        if (!q) { this._results = null; return; }
        this._busy = true;
        try {
            const data = await api.lookup({ q, sources: this._sources.join(','), kind: this._kind });
            this._results = data.results || [];
        } catch (e) {
            this._results = [{ source: 'ol', error: e.message }];
        } finally {
            this._busy = false;
        }
    }

    async findDuplicates() {
        if (!this.pageKey) return;
        this._busy = true;
        this._results = null;
        try {
            const data = await api.duplicates(this.pageKey);
            this._dupes = data;
        } catch (e) {
            this._results = [{ source: 'ol', error: e.message }];
        } finally {
            this._busy = false;
        }
    }

    addToTray(keys) {
        this.dispatchEvent(new CustomEvent('ol-tray-add', { bubbles: true, composed: true, detail: { keys } }));
    }

    useId(r) {
        this.dispatchEvent(new CustomEvent('ol-lookup-use-id', { bubbles: true, composed: true, detail: { field: r.id_field, value: r.id, title: r.title, source: r.source } }));
    }

    renderResult(r) {
        if (r.error) return html`<li class="err">${SOURCE_LABELS[r.source] || r.source}: ${this.t('couldntCheck')}</li>`;
        const inTray = r.source === 'ol' && this.trayKeys.includes(r.id);
        const canUse = r.actions?.includes('use_id') && this.pageKey && (
            (keyType(this.pageKey) === 'author' && r.kind === 'author') || (keyType(this.pageKey) === 'edition' && r.kind === 'edition'));
        return html`
            <li>
                <div>
                    <span class="src">${SOURCE_LABELS[r.source] || r.source}</span>
                    <div class="title">${r.title}</div>
                    ${r.subtitle ? html`<div class="sub">${r.subtitle}</div>` : nothing}
                </div>
                <div class="acts">
                    ${r.url ? html`<ol-button size="x-small" variant="ghost" href=${r.url} target="_blank" rel="noopener">${this.t('open')}</ol-button>` : nothing}
                    ${r.source === 'ol' && r.id !== this.pageKey ? html`<ol-button size="x-small" variant="secondary" ?disabled=${inTray} @click=${() => this.addToTray([r.id])}>${inTray ? this.t('inTray') : this.t('toTray')}</ol-button>` : nothing}
                    ${canUse ? html`<ol-button size="x-small" variant="secondary" @click=${() => this.useId(r)}>${this.t('useId')}</ol-button>` : nothing}
                </div>
            </li>`;
    }

    renderDupes() {
        const d = this._dupes;
        if (!d) return nothing;
        const cands = d.candidates || [];
        return html`
            <p class="hint">${this.t('findDuplicates')}: ${d.title} · ${cands.length}</p>
            ${cands.length ? html`<div><ol-button size="x-small" variant="secondary" @click=${() => this.addToTray(cands.map((c) => c.key))}>${this.t('addAll')}</ol-button></div>` : nothing}
            <ul>
                ${cands.map((c) => this.renderResult({
        source: 'ol', id: c.key, url: c.key, title: c.title || c.name || olid(c.key),
        subtitle: [
            (c.author_name || []).join(', '), c.first_publish_year, Number.isFinite(c.edition_count) ? `${c.edition_count} editions` : '',
            Number.isFinite(c.work_count) ? `${c.work_count} works` : '', c.top_work ? `top: ${c.top_work}` : '',
        ].filter(Boolean).join(' · '),
        actions: ['tray', 'open'],
    }))}
                ${!cands.length ? html`<li class="err">${this.t('noResults')}</li>` : nothing}
            </ul>`;
    }

    render() {
        return html`
            <div class="box">
                <input type="search" .value=${this._q} placeholder=${this.t('search')} aria-label=${this.t('search')} @input=${this.onInput} @keydown=${(e) => { if (e.key === 'Enter') this.search(); }}>
                ${this.pageKey ? html`<ol-button size="small" variant="secondary" @click=${this.findDuplicates}>${this.t('findDuplicates')}</ol-button>` : nothing}
            </div>
            <div class="chips" role="group" aria-label=${this.t('sources')}>
                ${SOURCES.map((s) => html`<ol-chip size="small" ?selected=${this._sources.includes(s)} @ol-chip-select=${() => this.toggleSource(s)}>${SOURCE_LABELS[s]}</ol-chip>`)}
            </div>
            ${this._prefilled ? html`<p class="hint">${this.t('prefillHint')}</p>` : nothing}
            <div aria-busy=${this._busy ? 'true' : 'false'} aria-live="polite">
                ${this._busy ? html`<p class="hint">${this.t('working')}</p>` : nothing}
                ${this._dupes ? this.renderDupes() : nothing}
                ${this._results ? html`<ul>${this._results.map((r) => this.renderResult(r))}${!this._results.length ? html`<li class="err">${this.t('noResults')}</li>` : nothing}</ul>` : nothing}
            </div>
        `;
    }
}

customElements.define('ol-tray-lookup', OlTrayLookup);

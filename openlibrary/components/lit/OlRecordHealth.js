import { LitElement, html, css, nothing } from 'lit';
import { translate } from './utils/labels.js';
import { DEFAULT_LABELS } from './librarian-tray-labels.js';
import { api } from '../../plugins/openlibrary/js/editing-mode/api.js';
import './OlIcon.js';
import './OLButton.js';
import './OLChip.js';

/** Health-strip level → ol-chip status variant. */
const LEVEL_VARIANT = { ok: 'success', warn: 'warning', block: 'danger', info: 'neutral' };

/**
 * The ambient health strip shown under a record's title in editing mode:
 * provenance, author mismatch, impact, scan, pending requests, strong ids and
 * cheap smells, each a chip with a level and, where there is one, a link to
 * the evidence. Data comes from GET /librarians/context.json.
 *
 * Chips that link somewhere are `<ol-chip href>`; a chip with nothing to open
 * is a static tag in the same colours, so nothing reads as a control that
 * does nothing.
 *
 * Mounted by editing-mode/index.js into `.record-health-slot` elements that
 * work, edition and author pages render for librarians.
 *
 * @element ol-record-health
 *
 * @prop {String} recordKey - "/works/OL1W", "/books/OL1M" or "/authors/OL1A"
 * @prop {Boolean} inTray - Whether the record is already in the tray
 * @prop {Object} labels - Translated strings, merged over DEFAULT_LABELS
 *
 * @fires ol-tray-add - detail: { keys: [recordKey] }
 * @fires ol-tray-remove - detail: { keys: [recordKey] }
 */
export class OlRecordHealth extends LitElement {
    static properties = {
        recordKey: { type: String, attribute: 'record-key' },
        inTray: { type: Boolean, attribute: 'in-tray' },
        labels: { type: Object },
        _data: { state: true },
        _error: { state: true },
    };

    static styles = css`
        :host {
            display: block;
            margin-bottom: var(--spacing-md);
            font-family: var(--font-family-body);
            font-size: var(--font-size-label-medium);
            color: var(--color-text-secondary);
        }
        .strip {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: var(--spacing-2xs) var(--spacing-xs);
        }
        /* A static tag drawn like a small chip: same tint tokens, no control semantics. */
        .tag {
            display: inline-flex;
            align-items: center;
            gap: var(--spacing-2xs);
            padding: var(--spacing-3xs) var(--spacing-sm);
            border-radius: var(--border-radius-chip);
            border: var(--border-width) solid var(--color-chip-neutral-border);
            background: var(--color-chip-neutral-bg);
            color: var(--color-chip-neutral-fg);
            line-height: var(--line-height-chip);
            white-space: nowrap;
        }
        .tag[data-level="ok"] { background: var(--color-success-bg); border-color: var(--color-success-border); color: var(--color-success-fg); }
        .tag[data-level="warn"] { background: var(--color-warning-bg); border-color: var(--color-warning-border); color: var(--color-warning-fg); }
        .tag[data-level="block"] { background: var(--color-error-bg); border-color: var(--color-error-border); color: var(--color-error-fg); }
        .muted { color: var(--color-text-muted); }
    `;

    constructor() {
        super();
        this.recordKey = '';
        this.inTray = false;
        this.labels = {};
        this._data = null;
        this._error = null;
    }

    t(key, vars) {
        return translate(this.labels, DEFAULT_LABELS, key, vars);
    }

    connectedCallback() {
        super.connectedCallback();
        this.load();
    }

    updated(changed) {
        if (changed.has('recordKey') && changed.get('recordKey') !== undefined) this.load();
    }

    async load() {
        if (!this.recordKey) return;
        this._error = null;
        try {
            this._data = await api.context(this.recordKey);
        } catch (e) {
            this._error = e.message;
        }
    }

    toggleTray() {
        const name = this.inTray ? 'ol-tray-remove' : 'ol-tray-add';
        this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: { keys: [this.recordKey] } }));
    }

    renderChip(c) {
        const title = c.detail ? JSON.stringify(c.detail, null, 1).replace(/[{}"]/g, '').trim() : '';
        if (c.href) {
            return html`<ol-chip size="small" variant=${LEVEL_VARIANT[c.level] || 'neutral'} href=${c.href} title=${title}>${c.text}</ol-chip>`;
        }
        return html`<span class="tag" data-level=${c.level} title=${title}>${c.text}</span>`;
    }

    render() {
        return html`
            <div class="strip" role="status">
                <ol-button size="small" variant=${this.inTray ? 'primary' : 'secondary'} aria-pressed=${this.inTray ? 'true' : 'false'} @click=${this.toggleTray}>
                    <ol-icon slot="icon-start" name=${this.inTray ? 'check' : 'plus'}></ol-icon>${this.inTray ? this.t('inTray') : this.t('healthAdd')}
                </ol-button>
                ${this._error ? html`<span class="muted">${this.t('couldntCheck')}</span>` : nothing}
                ${this._data ? this._data.chips.map((c) => this.renderChip(c)) : (this._error ? nothing : html`<span class="muted">…</span>`)}
            </div>
        `;
    }
}

customElements.define('ol-record-health', OlRecordHealth);

import { LitElement, html, css } from 'lit';

/**
 * OLRadio - Individual radio option for use within OLRadioGroup
 *
 * @example
 * <ol-radio value="1">Option 1</ol-radio>
 * <ol-radio value="2" appearance="button">Option 2</ol-radio>
 *
 * @slot - The radio's label content
 */
export class OLRadio extends LitElement {
    static properties = {
        value: { type: String },
        disabled: { type: Boolean, reflect: true },
        appearance: { type: String, reflect: true }, // 'default' | 'button'
        // Internal state managed by parent OLRadioGroup
        _checked: { type: Boolean, state: true },
        _name: { type: String, state: true },
        _orientation: { type: String, state: true },
        _size: { type: String, state: true }, // 'small' | 'medium'
        _tabindex: { type: Number, state: true }, // for roving tabindex
    };

    static styles = css`
        :host {
            display: block;

            /* TODO: Remove these inlined custom properties once we convert our LESS variables
                to CSS custom properties.

            /* === Colors (from colors.less) === */
            --ol-radio-primary: hsl(202, 96%, 37%);       /* @primary-blue */
            --ol-radio-primary-hover: hsl(202, 57%, 61%); /* @button-hover-blue */
            --ol-radio-border: hsl(0, 0%, 80%);           /* @lighter-grey / @color-border-subtle */
            --ol-radio-border-hover: hsl(0, 0%, 40%);     /* @grey */
            --ol-radio-disabled: hsl(0, 0%, 67%);         /* @light-mid-grey */
            --ol-radio-bg: hsl(0, 0%, 100%);              /* @white */
            --ol-radio-text: hsl(0, 0%, 40%);             /* @dark-grey */

            --ol-radio-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
                Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"; @font-family-sans / @font-family-button
            --ol-radio-font-size: 14px;                   /* @font-size-body-medium */
            --ol-radio-font-size-small: 12px;             /* @font-size-label-medium */

            --ol-radio-line-height: 1.15;                 /* @line-height-control / @line-height-tight */

            --ol-radio-border-width: 1px;                 /* @border-width-control */
            --ol-radio-focus-width: 2px;                  /* @focus-width */
            --ol-radio-border-radius: 5px;                /* button group radius */
        }

        :host([disabled]) {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Default radio appearance */
        .radio-wrapper {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            padding: 4px 0;
        }

        :host([disabled]) .radio-wrapper {
            cursor: not-allowed;
        }

        .radio-control {
            position: relative;
            width: 18px;
            height: 18px;
            flex-shrink: 0;
        }

        .radio-control input {
            position: absolute;
            opacity: 0;
            width: 100%;
            height: 100%;
            margin: 0;
            cursor: inherit;
        }

        .radio-control .radio-circle {
            display: block;
            width: 100%;
            height: 100%;
            border: var(--ol-radio-border-width) solid var(--ol-radio-border);
            border-radius: 50%;
            background: var(--ol-radio-bg);
            box-sizing: border-box;
        }

        .radio-control input:focus-visible + .radio-circle {
            outline: var(--ol-radio-focus-width) solid var(--ol-radio-primary);
            outline-offset: 2px;
        }

        .radio-wrapper:hover .radio-circle {
            border-color: var(--ol-radio-border-hover);
        }

        .radio-control input:checked + .radio-circle {
            border-color: var(--ol-radio-primary);
            background: var(--ol-radio-primary);
        }

        .radio-control input:checked + .radio-circle::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 6px;
            height: 6px;
            background: var(--ol-radio-bg);
            border-radius: 50%;
        }

        :host([disabled]) .radio-control input:checked + .radio-circle {
            border-color: var(--ol-radio-disabled);
            background: var(--ol-radio-disabled);
        }

        .radio-label {
            font-family: var(--ol-radio-font-family);
            font-size: var(--ol-radio-font-size);
            color: var(--ol-radio-text);
            line-height: var(--ol-radio-line-height);
            user-select: none;
        }

        /* Button appearance */
        :host([appearance="button"]) {
            display: inline-block;
        }

        :host([appearance="button"]) .radio-wrapper {
            padding: 0;
        }

        .radio-button {
            display: none;
        }

        :host([appearance="button"]) .radio-control {
            display: none;
        }

        :host([appearance="button"]) .radio-button {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px 16px;
            border: var(--ol-radio-border-width) solid var(--ol-radio-border);
            background: var(--ol-radio-bg);
            color: var(--ol-radio-text);
            font-family: var(--ol-radio-font-family);
            font-size: var(--ol-radio-font-size);
            font-weight: 500;
            line-height: var(--ol-radio-line-height);
            cursor: pointer;
            white-space: nowrap;
        }

        :host([appearance="button"]) .radio-button:hover {
            border-color: var(--ol-radio-primary);
            color: var(--ol-radio-primary);
        }

        :host([appearance="button"]) .radio-button:focus-visible {
            outline: var(--ol-radio-focus-width) solid var(--ol-radio-primary);
            outline-offset: 2px;
        }

        :host([appearance="button"]) .radio-button[aria-checked="true"] {
            border-color: var(--ol-radio-primary);
            background: var(--ol-radio-primary);
            color: var(--ol-radio-bg);
        }

        :host([appearance="button"][disabled]) .radio-button {
            border-color: var(--ol-radio-disabled);
            color: var(--ol-radio-disabled);
            cursor: not-allowed;
        }

        :host([appearance="button"][disabled]) .radio-button[aria-checked="true"] {
            background: var(--ol-radio-disabled);
            color: var(--ol-radio-bg);
        }

        /* Button group styling - horizontal */
        :host([appearance="button"][data-orientation="horizontal"]) .radio-button {
            border-radius: 0;
            margin-left: calc(-1 * var(--ol-radio-border-width));
        }

        :host([appearance="button"][data-orientation="horizontal"]:first-of-type) .radio-button {
            border-radius: var(--ol-radio-border-radius) 0 0 var(--ol-radio-border-radius);
            margin-left: 0;
        }

        :host([appearance="button"][data-orientation="horizontal"]:last-of-type) .radio-button {
            border-radius: 0 var(--ol-radio-border-radius) var(--ol-radio-border-radius) 0;
        }

        :host([appearance="button"][data-orientation="horizontal"]:only-of-type) .radio-button {
            border-radius: var(--ol-radio-border-radius);
        }

        /* Button group styling - vertical */
        :host([appearance="button"][data-orientation="vertical"]) .radio-button {
            border-radius: 0;
            margin-top: calc(-1 * var(--ol-radio-border-width));
            width: 100%;
        }

        :host([appearance="button"][data-orientation="vertical"]:first-of-type) .radio-button {
            border-radius: var(--ol-radio-border-radius) var(--ol-radio-border-radius) 0 0;
            margin-top: 0;
        }

        :host([appearance="button"][data-orientation="vertical"]:last-of-type) .radio-button {
            border-radius: 0 0 var(--ol-radio-border-radius) var(--ol-radio-border-radius);
        }

        :host([appearance="button"][data-orientation="vertical"]:only-of-type) .radio-button {
            border-radius: var(--ol-radio-border-radius);
        }

        /* Small size - default appearance */
        :host([data-size="small"]) .radio-control {
            width: 14px;
            height: 14px;
        }

        :host([data-size="small"]) .radio-control input:checked + .radio-circle::after {
            width: 4px;
            height: 4px;
        }

        :host([data-size="small"]) .radio-wrapper {
            gap: 6px;
        }

        :host([data-size="small"]) .radio-label {
            font-size: var(--ol-radio-font-size-small);
        }

        /* Small size - button appearance */
        :host([appearance="button"][data-size="small"]) .radio-button {
            padding: 4px 10px;
            font-size: var(--ol-radio-font-size-small);
        }
    `;

    constructor() {
        super();
        this.value = '';
        this.disabled = false;
        this.appearance = 'default';
        this._checked = false;
        this._name = '';
        this._orientation = 'vertical';
        this._size = 'medium';
        this._tabindex = 0;
    }

    /**
     * Focus the radio's interactive element
     */
    focus() {
        const focusable = this.shadowRoot?.querySelector('input, button');
        focusable?.focus();
    }

    _handleClick() {
        if (this.disabled) return;

        this.dispatchEvent(new CustomEvent('ol-radio-select', {
            detail: { value: this.value },
            bubbles: true,
            composed: true,
        }));
    }

    _handleKeyDown(e) {
        if (this.disabled) return;

        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this._handleClick();
        }
    }

    updated(changedProperties) {
        if (changedProperties.has('_orientation')) {
            this.dataset.orientation = this._orientation;
        }
        if (changedProperties.has('_size')) {
            this.dataset.size = this._size;
        }
    }

    render() {
        if (this.appearance === 'button') {
            return html`
                <button
                    class="radio-button"
                    type="button"
                    role="radio"
                    aria-checked="${this._checked}"
                    tabindex="${this._tabindex}"
                    ?disabled="${this.disabled}"
                    @click="${this._handleClick}"
                >
                    <slot></slot>
                </button>
            `;
        }

        return html`
            <label class="radio-wrapper" @click="${this._handleClick}">
                <span class="radio-control">
                    <input
                        type="radio"
                        name="${this._name}"
                        tabindex="${this._tabindex}"
                        .value="${this.value}"
                        .checked="${this._checked}"
                        ?disabled="${this.disabled}"
                        @change="${this._handleClick}"
                        @keydown="${this._handleKeyDown}"
                    />
                    <span class="radio-circle"></span>
                </span>
                <span class="radio-label">
                    <slot></slot>
                </span>
            </label>
        `;
    }
}

customElements.define('ol-radio', OLRadio);

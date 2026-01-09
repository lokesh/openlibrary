import { LitElement, html, css, nothing } from 'lit';
import './OLRadio.js';

/**
 * OLRadioGroup - A web component for grouping radio options
 *
 * Supports two display modes:
 * - Default: Native radio button appearance
 * - Button: Radio buttons styled as a button group (set appearance="button" on child ol-radio elements)
 *
 * Supports two orientations:
 * - Vertical (default): Options stacked vertically
 * - Horizontal: Options arranged horizontally
 *
 * Supports two sizes:
 * - Medium (default): Standard size
 * - Small: Compact size for tighter layouts
 *
 * @example Default radios (vertical)
 * <ol-radio-group label="Select an option" name="choice" value="1">
 *   <ol-radio value="1">Option 1</ol-radio>
 *   <ol-radio value="2">Option 2</ol-radio>
 *   <ol-radio value="3">Option 3</ol-radio>
 * </ol-radio-group>
 *
 * @example Button radios (horizontal)
 * <ol-radio-group label="Select an option" orientation="horizontal" name="choice" value="1">
 *   <ol-radio value="1" appearance="button">Option 1</ol-radio>
 *   <ol-radio value="2" appearance="button">Option 2</ol-radio>
 *   <ol-radio value="3" appearance="button">Option 3</ol-radio>
 * </ol-radio-group>
 *
 * @example Small size radios
 * <ol-radio-group label="Select an option" size="small" name="choice" value="1">
 *   <ol-radio value="1">Option 1</ol-radio>
 *   <ol-radio value="2">Option 2</ol-radio>
 * </ol-radio-group>
 *
 * @slot - The default slot where ol-radio elements are placed
 * @slot label - Optional slot for custom label HTML
 * @slot hint - Optional slot for custom hint HTML
 */
export class OLRadioGroup extends LitElement {
    static properties = {
        label: { type: String },
        hint: { type: String },
        name: { type: String },
        value: { type: String },
        orientation: { type: String, reflect: true }, // 'horizontal' | 'vertical'
        size: { type: String, reflect: true }, // 'small' | 'medium'
        disabled: { type: Boolean, reflect: true },
        required: { type: Boolean, reflect: true },
    };

    static styles = css`
        :host {
            display: block;
            --ol-radio-group-text: hsl(0, 0%, 20%);
            --ol-radio-group-hint: hsl(0, 0%, 40%);
            --ol-radio-group-error: hsl(8, 78%, 49%);
        }

        .form-control {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .form-control-label {
            font-family: inherit;
            font-weight: 600;
            color: var(--ol-radio-group-text);
            margin-bottom: 4px;
        }

        .form-control-label .required {
            color: var(--ol-radio-group-error);
            margin-left: 2px;
        }

        .radios {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        :host([orientation="horizontal"]) .radios {
            flex-direction: row;
            flex-wrap: wrap;
            gap: 16px;
        }

        /* Tighter gap for button appearance in horizontal mode */
        :host([orientation="horizontal"]) .radios.button-group {
            gap: 0;
        }

        /* Tighter gap for button appearance in vertical mode */
        .radios.button-group {
            gap: 0;
        }

        .hint {
            font-family: inherit;
            font-size: 0.875em;
            color: var(--ol-radio-group-hint);
            margin-top: 4px;
        }

        ::slotted(ol-radio) {
            /* Allow child radios to be styled by orientation */
        }
    `;

    constructor() {
        super();
        this.label = '';
        this.hint = '';
        this.name = '';
        this.value = '';
        this.orientation = 'vertical';
        this.size = 'medium';
        this.disabled = false;
        this.required = false;

        this._handleRadioSelect = this._handleRadioSelect.bind(this);
        this._handleKeyDown = this._handleKeyDown.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('ol-radio-select', this._handleRadioSelect);
        this.addEventListener('keydown', this._handleKeyDown);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('ol-radio-select', this._handleRadioSelect);
        this.removeEventListener('keydown', this._handleKeyDown);
    }

    firstUpdated() {
        this._updateRadios();
    }

    updated(changedProperties) {
        if (changedProperties.has('value') ||
            changedProperties.has('disabled') ||
            changedProperties.has('name') ||
            changedProperties.has('orientation') ||
            changedProperties.has('size')) {
            this._updateRadios();
        }
    }

    _getRadios() {
        const slot = this.shadowRoot?.querySelector('slot:not([name])');
        if (!slot) return [];

        return slot.assignedElements({ flatten: true })
            .filter(el => el.tagName?.toLowerCase() === 'ol-radio');
    }

    _updateRadios() {
        const radios = this._getRadios();
        const hasButtonAppearance = radios.some(radio => radio.appearance === 'button');

        // Update the radios wrapper class
        const radiosWrapper = this.shadowRoot?.querySelector('.radios');
        if (radiosWrapper) {
            radiosWrapper.classList.toggle('button-group', hasButtonAppearance);
        }

        // Find which radio should be tabbable (selected one, or first if none selected)
        const selectedIndex = radios.findIndex(radio => radio.value === this.value);
        const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

        radios.forEach((radio, index) => {
            radio._checked = radio.value === this.value;
            radio._name = this.name;
            radio._orientation = this.orientation;
            radio._size = this.size;
            // Roving tabindex: only one radio is tabbable at a time
            radio._tabindex = index === tabbableIndex ? 0 : -1;

            // Inherit disabled state from group if group is disabled
            if (this.disabled) {
                radio.disabled = true;
            }
        });
    }

    _handleKeyDown(e) {
        if (this.disabled) return;

        const radios = this._getRadios().filter(r => !r.disabled);
        if (radios.length === 0) return;

        const currentIndex = radios.findIndex(r => r.value === this.value);
        let nextIndex = -1;

        // Arrow keys for navigation (per WAI-ARIA radio group pattern)
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                e.preventDefault();
                nextIndex = currentIndex < radios.length - 1 ? currentIndex + 1 : 0;
                break;
            case 'ArrowUp':
            case 'ArrowLeft':
                e.preventDefault();
                nextIndex = currentIndex > 0 ? currentIndex - 1 : radios.length - 1;
                break;
            default:
                return;
        }

        if (nextIndex >= 0 && nextIndex < radios.length) {
            const nextRadio = radios[nextIndex];
            // Select and focus the next radio
            this.value = nextRadio.value;
            this._updateRadios();
            nextRadio.focus();

            // Dispatch change event
            this.dispatchEvent(new CustomEvent('change', {
                detail: { value: this.value },
                bubbles: true,
                composed: true,
            }));

            // Dispatch input event
            this.dispatchEvent(new CustomEvent('input', {
                detail: { value: this.value },
                bubbles: true,
                composed: true,
            }));
        }
    }

    _handleRadioSelect(e) {
        if (this.disabled) return;

        const newValue = e.detail.value;
        if (newValue !== this.value) {
            this.value = newValue;
            this._updateRadios();

            // Dispatch change event
            this.dispatchEvent(new CustomEvent('change', {
                detail: { value: this.value },
                bubbles: true,
                composed: true,
            }));

            // Dispatch input event
            this.dispatchEvent(new CustomEvent('input', {
                detail: { value: this.value },
                bubbles: true,
                composed: true,
            }));
        }
    }

    _handleSlotChange() {
        this._updateRadios();
    }

    _hasLabel() {
        return this.label || this.querySelector('[slot="label"]');
    }

    render() {
        const hasLabel = this._hasLabel();

        return html`
            <div class="form-control" role="radiogroup" aria-labelledby="${hasLabel ? 'label' : nothing}">
                ${hasLabel ? html`
                    <div class="form-control-label" id="label">
                        <slot name="label">${this.label}</slot>
                        ${this.required ? html`<span class="required" aria-hidden="true">*</span>` : ''}
                    </div>
                ` : ''}

                <div class="radios">
                    <slot @slotchange="${this._handleSlotChange}"></slot>
                </div>

                ${this.hint || this.querySelector('[slot="hint"]') ? html`
                    <div class="hint">
                        <slot name="hint">${this.hint}</slot>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Form-associated custom element methods for native form integration
    get form() {
        return this.closest('form');
    }

    get validity() {
        if (this.required && !this.value) {
            return { valid: false, valueMissing: true };
        }
        return { valid: true };
    }

    checkValidity() {
        return this.validity.valid;
    }

    reportValidity() {
        if (!this.checkValidity()) {
            this.dispatchEvent(new CustomEvent('invalid', {
                bubbles: true,
                composed: true,
            }));
            return false;
        }
        return true;
    }
}

customElements.define('ol-radio-group', OLRadioGroup);

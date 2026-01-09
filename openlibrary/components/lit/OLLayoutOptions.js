import { LitElement, html, css } from 'lit';
import './OLRadioGroup.js';

/**
 * OLLayoutOptions - A web component for switching between list/grid layouts
 *
 * NOTE: This component includes business logic and is not a pure UI component.
 *
 * This component provides a radio button group for toggling between different
 * layout modes (e.g., "details" and "grid") for book lists. It handles:
 * - Toggling the layout class on a target container
 * - Persisting the preference in a cookie
 * - Updating the URL for shareable links
 *
 * @example
 * <ol-layout-options
 *   target="#search-results-list"
 *   value="details"
 * ></ol-layout-options>
 *
 * @example With all options
 * <ol-layout-options
 *   target="#my-book-list"
 *   value="grid"
 *   default-layout="details"
 *   update-url
 *   set-cookie
 * ></ol-layout-options>
 */
export class OLLayoutOptions extends LitElement {
    static properties = {
        /** CSS selector for the target container to apply layout classes to (required) */
        target: { type: String },
        /** Current layout value */
        value: { type: String },
        /** Default layout if none specified */
        defaultLayout: { type: String, attribute: 'default-layout' },
        /** Whether to update the URL when layout changes */
        updateUrl: { type: Boolean, attribute: 'update-url' },
        /** Whether to set a cookie when layout changes */
        setCookie: { type: Boolean, attribute: 'set-cookie' },
    };

    static styles = css`
        :host {
            display: block;
        }
    `;

    constructor() {
        super();
        this.target = '';
        this.value = '';
        this.defaultLayout = 'details';
        this.updateUrl = true;
        this.setCookie = true;

        this._layoutOptions = [
            { layout: 'details', name: 'Details' },
            { layout: 'grid', name: 'Grid' },
        ];
    }

    connectedCallback() {
        super.connectedCallback();

        // Validate required target property
        if (!this.target) {
            console.error(
                'ol-layout-options: "target" attribute is required. ' +
                'Please provide a CSS selector for the target container.'
            );
        }

        // If no value specified, use the default
        if (!this.value) {
            this.value = this.defaultLayout;
        }
    }

    /**
     * Get the target container element
     * @returns {HTMLElement|null}
     */
    _getTargetElement() {
        if (!this.target) return null;
        return document.querySelector(this.target);
    }

    /**
     * Handle layout change from the radio group
     * @param {CustomEvent} e
     */
    _handleLayoutChange(e) {
        const selectedLayout = e.detail.value;
        this.value = selectedLayout;

        // Toggle grid class on target container
        // TODO: This could be made more generic (not book list specific) and customisable.
        const targetElement = this._getTargetElement();
        if (targetElement) {
            targetElement.classList.toggle('list-books--grid', selectedLayout === 'grid');
        }

        // Set cookie to remember preference
        if (this.setCookie) {
            document.cookie = `LBL=${selectedLayout}; path=/; max-age=31536000`;
        }

        // Update URL without reload (for shareable links)
        if (this.updateUrl) {
            const url = new URL(window.location.href);
            url.searchParams.set('layout', selectedLayout);
            history.replaceState(null, '', url.toString());
        }

        // Dispatch a change event for external listeners
        this.dispatchEvent(new CustomEvent('layout-change', {
            detail: { value: selectedLayout },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        return html`
            <ol-radio-group
                orientation="horizontal"
                size="small"
                name="layout"
                value="${this.value}"
                @change="${this._handleLayoutChange}"
            >
                ${this._layoutOptions.map(option => html`
                    <ol-radio value="${option.layout}" appearance="button">
                        ${option.name}
                    </ol-radio>
                `)}
            </ol-radio-group>
        `;
    }
}

customElements.define('ol-layout-options', OLLayoutOptions);

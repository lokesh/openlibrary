import { LitElement, html, css } from 'lit';

/**
 * OlBookCover - A web component for displaying book covers
 *
 * @element ol-book-cover
 *
 * @prop {String} src - Cover image URL
 * @prop {String} alt - Accessibility text for the image
 * @prop {String} size - Size variant: 'sm', 'med', 'lg', 'xl', 'full-width'
 * @prop {Boolean} lazy-loading - Whether to use native lazy loading (default: true)
 */
export class OlBookCover extends LitElement {
    static properties = {
        src: { type: String },
        alt: { type: String },
        size: { type: String },
        lazyLoading: { type: Boolean, attribute: 'lazy-loading' },
        _hasError: { state: true }
    };

    static styles = css`
        :host {
            display: inline-block;
        }

        .cover {
            max-width: 100%;
            height: auto;
            display: block;
        }

        .cover-sm {
            height: 58px;
            width: auto;
        }

        .cover-med {
            width: 180px;
            height: auto;
        }

        .cover-lg {
            max-width: 500px;
            height: auto;
        }

        .cover-xl {
            max-width: 600px;
            height: auto;
        }

        .cover-full-width {
            width: 100%;
            height: auto;
        }
    `;

    // Maps component size prop to cover API suffix
    static SIZE_TO_API_SUFFIX = {
        sm: '-S',
        med: '-M',
        lg: '-L',
        xl: '-L',
        'full-width': '-L'
    };

    // Maps component size to fallback image variant
    static SIZE_TO_FALLBACK = {
        sm: '/images/icons/avatar_book-sm.png',
        med: '/images/icons/avatar_book.png',
        lg: '/images/icons/avatar_book-lg.png',
        xl: '/images/icons/avatar_book-lg.png',
        'full-width': '/images/icons/avatar_book-lg.png'
    };

    constructor() {
        super();
        this.src = '';
        this.alt = '';
        this.size = 'med';
        this.lazyLoading = true;
        this._hasError = false;
    }

    /**
     * Processes the src URL to append size suffix if needed
     * @returns {String} The processed image URL
     */
    get _processedSrc() {
        if (!this.src || this._hasError) {
            return this._fallbackSrc;
        }

        // If src already has a size suffix (-S, -M, -L), use as-is
        if (/-[SML]\.jpg$/i.test(this.src)) {
            return this.src;
        }

        // If src ends with .jpg without size suffix, append the appropriate suffix
        if (/\.jpg$/i.test(this.src)) {
            const suffix = OlBookCover.SIZE_TO_API_SUFFIX[this.size] || '-M';
            return this.src.replace(/\.jpg$/i, `${suffix}.jpg`);
        }

        // For non-.jpg URLs, return as-is
        return this.src;
    }

    /**
     * Gets the appropriate fallback image based on size
     * @returns {String} Fallback image URL
     */
    get _fallbackSrc() {
        return OlBookCover.SIZE_TO_FALLBACK[this.size] || '/images/icons/avatar_book.png';
    }

    /**
     * Handles image load errors by switching to fallback
     */
    _handleError() {
        if (!this._hasError) {
            this._hasError = true;
        }
    }

    /**
     * Reset error state when src changes
     */
    willUpdate(changedProperties) {
        if (changedProperties.has('src')) {
            this._hasError = false;
        }
    }

    render() {
        const sizeClass = `cover-${this.size}`;

        return html`
            <img
                class="cover ${sizeClass}"
                src=${this._processedSrc}
                alt=${this.alt}
                loading=${this.lazyLoading ? 'lazy' : 'eager'}
                itemprop="image"
                @error=${this._handleError}
            >
        `;
    }
}

customElements.define('ol-book-cover', OlBookCover);

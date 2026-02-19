import { LitElement, html, css, nothing } from 'lit';

/**
 * A Netflix-style carousel component with page-based navigation.
 *
 * Items are passed as direct children. The component controls their width
 * based on responsive breakpoints, shows peek areas at the edges, and
 * provides arrow buttons and bar-segment indicators for navigation.
 *
 * @element ol-carousel
 *
 * @prop {Number} peek - Fraction of item width visible at edges (0–0.5, default: 0.075)
 * @prop {Number} gap - Gap between items in px (default: 4)
 * @prop {String} label - Accessible label for the carousel region (default: "Carousel")
 * @prop {String} labelPrevious - Aria-label for previous arrow (default: "Previous page")
 * @prop {String} labelNext - Aria-label for next arrow (default: "Next page")
 *
 * @fires ol-carousel-page-change - Fired after page transition. detail: { page: Number, totalPages: Number }
 *
 * @example
 * <ol-carousel label="Trending Books">
 *   <div class="book-card"><img src="/cover1.jpg" alt="Book 1" /></div>
 *   <div class="book-card"><img src="/cover2.jpg" alt="Book 2" /></div>
 * </ol-carousel>
 */
export class OlCarousel extends LitElement {
    static properties = {
        peek: { type: Number },
        gap: { type: Number },
        label: { type: String },
        labelPrevious: { type: String, attribute: 'label-previous' },
        labelNext: { type: String, attribute: 'label-next' },
        _page: { type: Number, state: true },
        _totalPages: { type: Number, state: true },
        _columns: { type: Number, state: true },
        _trackOffset: { type: Number, state: true },
        _swiping: { type: Boolean, state: true },
        _swipeDelta: { type: Number, state: true },
        _itemCount: { type: Number, state: true },
    };

    static styles = css`
        :host {
            display: block;
            --_arrow-bg: var(--ol-carousel-arrow-bg, rgba(0, 0, 0, 0.5));
            --_arrow-color: var(--ol-carousel-arrow-color, #fff);
            --_arrow-size: var(--ol-carousel-arrow-size, 40px);
            --_indicator-color: var(--ol-carousel-indicator-color, #ccc);
            --_indicator-active: var(--ol-carousel-indicator-active, #333);
            --_transition: var(--ol-carousel-transition, transform 0.75s cubic-bezier(0.4, 0, 0.2, 1));
        }

        .carousel {
            position: relative;
        }

        /* ── Indicators ── */
        .indicators {
            display: flex;
            justify-content: flex-end;
            gap: 2px;
            padding: 0 4px 6px;
        }

        .indicators[hidden] {
            display: none;
        }

        .indicator {
            height: 2px;
            flex: 1;
            max-width: 24px;
            border: none;
            border-radius: 1px;
            padding: 0;
            background: var(--_indicator-color);
            cursor: pointer;
            transition: background 0.2s;
        }

        .indicator:focus-visible {
            outline: 2px solid #5B8DD9;
            outline-offset: 2px;
        }

        .indicator[aria-current="true"] {
            background: var(--_indicator-active);
        }

        /* ── Viewport ── */
        .viewport {
            position: relative;
            overflow: hidden;
        }

        /* ── Track ── */
        .track {
            display: flex;
            transition: var(--_transition);
            will-change: transform;
            touch-action: pan-y pinch-zoom;
        }

        .track.no-transition {
            transition: none;
        }

        /* ── Slotted items ── */
        ::slotted(*) {
            flex: 0 0 var(--_item-width);
            min-width: 0;
            box-sizing: border-box;
        }

        /* ── Arrow buttons ── */
        .arrow {
            display: flex;
            align-items: center;
            justify-content: center;
            position: absolute;
            top: 0;
            bottom: 0;
            width: calc(var(--_peek-px, 0px) + 16px);
            min-width: var(--_arrow-size);
            z-index: 2;
            border: none;
            background: linear-gradient(
                to var(--_arrow-dir, right),
                transparent,
                rgba(0, 0, 0, 0.15) 40%,
                rgba(0, 0, 0, 0.35)
            );
            color: var(--_arrow-color);
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s;
            padding: 0;
        }

        .arrow:focus-visible {
            outline: 2px solid #5B8DD9;
            outline-offset: -2px;
        }

        .arrow.prev {
            left: 0;
            --_arrow-dir: left;
        }

        .arrow.next {
            right: 0;
        }

        .arrow[hidden] {
            display: none;
        }

        /* Show arrows on hover/focus, always on touch devices */
        @media (hover: hover) {
            .carousel:hover .arrow:not([hidden]),
            .carousel:focus-within .arrow:not([hidden]) {
                opacity: 1;
            }
        }

        @media (hover: none) {
            .arrow:not([hidden]) {
                opacity: 1;
            }
        }

        .arrow svg {
            width: 24px;
            height: 24px;
        }

        /* ── Reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
            .track {
                transition-duration: 0.01ms !important;
            }
        }
    `;

    /** Left chevron SVG */
    static _leftArrow = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`;

    /** Right chevron SVG */
    static _rightArrow = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;

    /** Breakpoints: [maxWidth, columns] sorted ascending. Last entry is the default. */
    static _breakpoints = [
        [480, 2],
        [600, 3],
        [768, 4],
        [1200, 5],
        [Infinity, 6],
    ];

    constructor() {
        super();
        this.peek = 0.075;
        this.gap = 4;
        this.label = 'Carousel';
        this.labelPrevious = 'Previous page';
        this.labelNext = 'Next page';
        this._page = 0;
        this._totalPages = 1;
        this._columns = 6;
        this._trackOffset = 0;
        this._swiping = false;
        this._swipeDelta = 0;
        this._itemCount = 0;

        /** @type {ResizeObserver|null} */
        this._resizeObserver = null;
        /** @type {number|null} */
        this._pointerStartX = null;
        /** @type {number|null} */
        this._pointerId = null;

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        this._resizeObserver = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? this.clientWidth;
            this._updateColumns(width);
        });
        this._resizeObserver.observe(this);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
    }

    firstUpdated() {
        this._countItems();
        this._updateInert();
    }

    updated(changedProperties) {
        if (changedProperties.has('_page') || changedProperties.has('_columns') || changedProperties.has('_itemCount')) {
            this._recalculate();
            this._updateInert();
        }
    }

    // ── Public methods ──

    /** Advance to the next page. */
    next() {
        if (this._page < this._totalPages - 1) {
            this._page++;
            this._updateOffset();
            this._emitPageChange();
        }
    }

    /** Go to the previous page. */
    prev() {
        if (this._page > 0) {
            this._page--;
            this._updateOffset();
            this._emitPageChange();
        }
    }

    /** Jump to a specific page (0-indexed). */
    goToPage(index) {
        const clamped = Math.max(0, Math.min(index, this._totalPages - 1));
        if (clamped !== this._page) {
            this._page = clamped;
            this._updateOffset();
            this._emitPageChange();
        }
    }

    // ── Internals ──

    _countItems() {
        const slot = this.shadowRoot?.querySelector('slot');
        if (slot) {
            this._itemCount = slot.assignedElements().length;
        }
    }

    _updateColumns(width) {
        for (const [maxWidth, cols] of OlCarousel._breakpoints) {
            if (width <= maxWidth) {
                if (cols !== this._columns) {
                    this._columns = cols;
                }
                break;
            }
        }
    }

    _recalculate() {
        const count = this._itemCount;
        const cols = this._columns;
        if (count <= 0 || cols <= 0) {
            this._totalPages = 1;
            this._page = 0;
            this._trackOffset = 0;
            return;
        }
        this._totalPages = Math.max(1, Math.ceil(count / cols));
        // Clamp page
        if (this._page >= this._totalPages) {
            this._page = this._totalPages - 1;
        }
        this._updateOffset();
    }

    _updateOffset() {
        const count = this._itemCount;
        const cols = this._columns;
        const peek = this.peek;

        // Each item occupies this fraction of the viewport
        const itemFraction = (1 - peek * 2) / cols;
        // The start of the visible area (accounting for left peek)
        const peekOffset = peek;

        if (this._page === 0) {
            // First page: no left peek, items start at left edge
            this._trackOffset = 0;
        } else if (this._page >= this._totalPages - 1) {
            // Last page: align last item to right edge
            const totalTrackWidth = count * itemFraction;
            this._trackOffset = -(totalTrackWidth - 1) * 100;
        } else {
            // Middle pages: show peek on both sides
            const offset = this._page * cols * itemFraction - peekOffset;
            this._trackOffset = -offset * 100;
        }
    }

    _updateInert() {
        const slot = this.shadowRoot?.querySelector('slot');
        if (!slot) return;
        const items = slot.assignedElements();
        const cols = this._columns;
        const page = this._page;

        // Determine visible range
        let startVisible, endVisible;
        if (page === 0) {
            startVisible = 0;
            endVisible = cols - 1;
        } else if (page >= this._totalPages - 1) {
            endVisible = items.length - 1;
            startVisible = Math.max(0, items.length - cols);
        } else {
            startVisible = page * cols;
            endVisible = startVisible + cols - 1;
        }

        items.forEach((item, i) => {
            if (i >= startVisible && i <= endVisible) {
                item.removeAttribute('inert');
                item.setAttribute('aria-hidden', 'false');
            } else {
                item.setAttribute('inert', '');
                item.setAttribute('aria-hidden', 'true');
            }
        });
    }

    _emitPageChange() {
        this.dispatchEvent(new CustomEvent('ol-carousel-page-change', {
            detail: { page: this._page, totalPages: this._totalPages },
            bubbles: true,
            composed: true,
        }));
    }

    // ── Slot change ──

    _onSlotChange() {
        this._countItems();
    }

    // ── Pointer / swipe ──

    _onPointerDown(e) {
        // Only handle primary button / single touch
        if (e.button !== 0) return;
        this._pointerStartX = e.clientX;
        this._pointerId = e.pointerId;
        this._swiping = true;
        this._swipeDelta = 0;

        const track = this.shadowRoot.querySelector('.track');
        track.setPointerCapture(e.pointerId);
        track.addEventListener('pointermove', this._onPointerMove);
        track.addEventListener('pointerup', this._onPointerUp);
        track.addEventListener('pointercancel', this._onPointerUp);
    }

    _onPointerMove(e) {
        if (!this._swiping || e.pointerId !== this._pointerId) return;
        this._swipeDelta = e.clientX - this._pointerStartX;
    }

    _onPointerUp(e) {
        if (e.pointerId !== this._pointerId) return;
        const track = this.shadowRoot.querySelector('.track');
        track.removeEventListener('pointermove', this._onPointerMove);
        track.removeEventListener('pointerup', this._onPointerUp);
        track.removeEventListener('pointercancel', this._onPointerUp);

        const delta = this._swipeDelta;
        const threshold = this.clientWidth * 0.15;

        this._swiping = false;
        this._swipeDelta = 0;

        if (Math.abs(delta) > threshold) {
            if (delta < 0) {
                this.next();
            } else {
                this.prev();
            }
        }
        // Otherwise snaps back via removing swipeDelta
    }

    // ── Styles ──

    _getTrackStyle() {
        const cols = this._columns;
        const peek = this.peek;
        const gap = this.gap;

        const itemFraction = (1 - peek * 2) / cols;
        const itemPercent = itemFraction * 100;

        let offset = this._trackOffset;
        // Apply swipe delta as additional pixel offset
        if (this._swiping && this._swipeDelta !== 0) {
            const pxToPercent = (this._swipeDelta / this.clientWidth) * 100;
            offset += pxToPercent;
        }

        return `
            --_item-width: calc(${itemPercent}% - ${gap}px + ${gap / cols}px);
            --_peek-px: calc(${peek} * ${this.clientWidth || 300}px);
            gap: ${gap}px;
            transform: translateX(${offset}%);
        `;
    }

    // ── Render ──

    _renderIndicators() {
        if (this._totalPages <= 1) return nothing;
        return html`
            <div class="indicators" role="tablist" aria-label="Carousel pages">
                ${Array.from({ length: this._totalPages }, (_, i) => html`
                    <button
                        class="indicator"
                        role="tab"
                        aria-label="Go to page ${i + 1} of ${this._totalPages}"
                        aria-current=${i === this._page ? 'true' : 'false'}
                        aria-selected=${i === this._page ? 'true' : 'false'}
                        @click=${() => this.goToPage(i)}
                    ></button>
                `)}
            </div>
        `;
    }

    render() {
        const showPrev = this._page > 0;
        const showNext = this._page < this._totalPages - 1;
        const trackClass = this._swiping ? 'track no-transition' : 'track';

        return html`
            <section
                class="carousel"
                role="region"
                aria-roledescription="carousel"
                aria-label=${this.label}
            >
                ${this._renderIndicators()}
                <div
                    class="viewport"
                    aria-live="polite"
                    aria-atomic="false"
                >
                    <button
                        class="arrow prev"
                        aria-label=${this.labelPrevious}
                        ?hidden=${!showPrev}
                        @click=${() => this.prev()}
                    >${OlCarousel._leftArrow}</button>

                    <div
                        class=${trackClass}
                        style=${this._getTrackStyle()}
                        @pointerdown=${this._onPointerDown}
                    >
                        <slot @slotchange=${this._onSlotChange}></slot>
                    </div>

                    <button
                        class="arrow next"
                        aria-label=${this.labelNext}
                        ?hidden=${!showNext}
                        @click=${() => this.next()}
                    >${OlCarousel._rightArrow}</button>
                </div>
            </section>
        `;
    }
}

customElements.define('ol-carousel', OlCarousel);

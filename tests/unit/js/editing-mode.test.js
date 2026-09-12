/**
 * Editing mode: key helpers, the tray store's optimistic sync, and the
 * selection engine's affordances and range selection, in jsdom.
 */
import { normalizeKey, keyType, olid } from '../../../openlibrary/plugins/openlibrary/js/editing-mode/api.js';
import { TrayStore } from '../../../openlibrary/plugins/openlibrary/js/editing-mode/tray-store.js';
import { SelectionEngine } from '../../../openlibrary/plugins/openlibrary/js/editing-mode/selection.js';

function jsonResponse(body, ok = true, status = 200) {
    return Promise.resolve({ ok, status, statusText: ok ? 'OK' : 'Error', json: () => Promise.resolve(body) });
}

describe('key helpers', () => {
    test('normalizeKey accepts OLIDs, keys and URLs', () => {
        expect(normalizeKey('OL1W')).toBe('/works/OL1W');
        expect(normalizeKey('/books/OL2M')).toBe('/books/OL2M');
        expect(normalizeKey('https://openlibrary.org/authors/OL3A/Name')).toBe('/authors/OL3A');
        expect(normalizeKey('OL1L')).toBeNull();
        expect(normalizeKey('')).toBeNull();
    });

    test('keyType and olid', () => {
        expect(keyType('/works/OL1W')).toBe('work');
        expect(keyType('/books/OL1M')).toBe('edition');
        expect(keyType('/authors/OL1A')).toBe('author');
        expect(olid('/works/OL1W')).toBe('OL1W');
    });
});

describe('TrayStore', () => {
    beforeEach(() => {
        sessionStorage.clear();
        global.fetch = jest.fn();
    });

    test('add is optimistic and mirrors the server answer', async() => {
        const store = new TrayStore();
        const changes = [];
        store.addEventListener('change', (e) => changes.push(e.detail.items.map((it) => it.key)));
        global.fetch.mockImplementation((url, init) => {
            const body = JSON.parse(init.body);
            return jsonResponse({ items: body.add.map((key) => ({ key, note: '', done: false })), saved: [] });
        });
        await store.add(['OL1W', 'OL1W', 'not-a-key']);
        expect(store.has('/works/OL1W')).toBe(true);
        expect(changes[0]).toEqual(['/works/OL1W']);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ add: ['/works/OL1W'] });
    });

    test('a failed write rolls back and reports', async() => {
        const store = new TrayStore();
        const errors = [];
        store.addEventListener('error', () => errors.push(1));
        global.fetch.mockImplementation(() => jsonResponse({ detail: { error: 'nope' } }, false, 500));
        await expect(store.add(['OL1W'])).rejects.toThrow('nope');
        expect(store.items).toEqual([]);
        expect(errors).toHaveLength(1);
    });

    test('byType groups items', () => {
        const store = new TrayStore();
        store.items = [{ key: '/works/OL1W' }, { key: '/books/OL1M' }, { key: '/authors/OL1A' }];
        const g = store.byType();
        expect(g.work).toHaveLength(1);
        expect(g.edition).toHaveLength(1);
        expect(g.author).toHaveLength(1);
    });
});

describe('SelectionEngine', () => {
    let store;
    let engine;

    beforeEach(() => {
        sessionStorage.clear();
        document.body.innerHTML = `
            <ul>
                <li data-ol-key="/works/OL1W"><a class="booktitle" href="/works/OL1W">One</a></li>
                <li data-ol-key="/works/OL2W"><a class="booktitle" href="/works/OL2W">Two</a></li>
                <li data-ol-key="/works/OL3W"><a class="booktitle" href="/works/OL3W">Three</a></li>
            </ul>
            <p>by <a data-ol-key="/authors/OL1A" href="/authors/OL1A">Author</a></p>`;
        store = new TrayStore();
        store._mutate = (localFn) => { localFn(); store._apply({ items: store.items, saved: store.saved }); return Promise.resolve(); };
        engine = new SelectionEngine(store, { labels: { add: 'Add', toTray: 'Add to tray', inTray: 'In tray' } });
        engine.enable();
    });

    afterEach(() => engine.disable());

    test('decorates rows with checkboxes and inline links with a button', () => {
        expect(document.querySelectorAll('li .ol-select__input')).toHaveLength(3);
        expect(document.querySelectorAll('.ol-select-inline')).toHaveLength(1);
        expect(document.body.classList.contains('editing-mode')).toBe(true);
    });

    test('a checkbox click toggles the store and the row reflects it', async() => {
        const first = document.querySelector('li .ol-select__input');
        first.click();
        await Promise.resolve();
        expect(store.has('/works/OL1W')).toBe(true);
        expect(document.querySelector('[data-ol-key="/works/OL1W"]').classList.contains('ol-selectable--selected')).toBe(true);
        first.click();
        await Promise.resolve();
        expect(store.has('/works/OL1W')).toBe(false);
    });

    test('shift-click selects the range between the last click and this one', async() => {
        const inputs = document.querySelectorAll('li .ol-select__input');
        inputs[0].click();
        await Promise.resolve();
        inputs[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
        await Promise.resolve();
        expect([...store.keys].sort()).toEqual(['/works/OL1W', '/works/OL2W', '/works/OL3W']);
    });

    test('the inline button adds the author', async() => {
        document.querySelector('.ol-select-inline').click();
        await Promise.resolve();
        expect(store.has('/authors/OL1A')).toBe(true);
        expect(document.querySelector('.ol-select-inline').getAttribute('variant')).toBe('primary');
    });

    test('disable removes every affordance', () => {
        engine.disable();
        expect(document.querySelectorAll('.ol-select, .ol-select-inline, .ol-selectable')).toHaveLength(0);
        expect(document.body.classList.contains('editing-mode')).toBe(false);
    });
});

describe('OlLibrarianTray resizing', () => {
    let tray;

    // jsdom has no ElementInternals; the form-associated controls the tray
    // composes (ol-segmented-control, ol-button) call setFormValue on it.
    beforeAll(() => {
        HTMLElement.prototype.attachInternals = () => ({ form: null, setFormValue() {}, setValidity() {} });
        global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    });
    afterAll(() => { delete HTMLElement.prototype.attachInternals; delete global.ResizeObserver; });

    beforeEach(async() => {
        const { OlLibrarianTray } = await import('../../../openlibrary/components/lit/OlLibrarianTray.js');
        tray = new OlLibrarianTray();
        tray.labels = {};
        document.body.appendChild(tray);
        await tray.updateComplete;
    });

    afterEach(() => tray.remove());

    test('clamps to the minimum and the viewport-derived maximum', () => {
        const widths = [];
        tray.addEventListener('ol-tray-resize', (e) => widths.push(e.detail));
        tray.setWidth(10, false);
        expect(tray.width).toBe(280);
        tray.setWidth(100000, true);
        expect(tray.width).toBe(tray.maxWidth);
        expect(widths.at(-1)).toEqual({ width: tray.maxWidth, commit: true });
    });

    test('arrow keys grow toward the page and Enter resets', () => {
        const handle = tray.shadowRoot.querySelector('.resizer');
        expect(handle.getAttribute('role')).toBe('separator');
        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(tray.width).toBe(356);
        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(tray.width).toBe(340);
    });
});

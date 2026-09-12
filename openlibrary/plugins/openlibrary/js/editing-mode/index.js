/**
 * Editing mode: the replacement for the ILE toolbar.
 *
 * Owns the tray store (server-backed working set), the selection engine
 * (checkboxes on everything that carries data-ol-key), the header switch, the
 * book-page subject pencil, and the wiring between the page and the Lit tray
 * (<ol-librarian-tray>), which is a view: it renders what it is given and
 * asks for changes through events handled here.
 *
 * Loaded from main.js instead of ./ile when the account's librarian_tools
 * preference is "tray" (see templates/site/body.html).
 */
import { api, normalizeKey, olid } from './api.js';
import { TrayStore } from './tray-store.js';
import { SelectionEngine } from './selection.js';
import { renderBulkTagger } from '../bulk-tagger/index.js';
import { BulkTagger } from '../bulk-tagger/BulkTagger.js';
import '../../../../../static/css/components/editing-mode.css';
import '../../../../../static/css/components/tagging-menu.css';

const DEFAULT_LABELS = {
    add: 'Add', toTray: 'Add to tray', inTray: 'In tray', manageSubjects: 'Manage subjects',
    keyboardHint: 'Keys: j/k move · x select · a add page · ? help', applied: 'Applied',
};

let store;
let engine;
let tray;
let labels = DEFAULT_LABELS;
let bulkTagger = null;

function readLabels() {
    try {
        const raw = document.querySelector('ol-librarian-tray')?.dataset.i18n;
        if (raw) return { ...DEFAULT_LABELS, ...JSON.parse(raw) };
    } catch { /* fall through */ }
    return DEFAULT_LABELS;
}

function isOn() {
    return document.body.dataset.editingMode === 'on';
}

/**
 * A toast without importing the Lit module: the components bundle registers
 * <ol-toast>; importing it here too would define the element twice.
 */
export function toast(message, type = 'info') {
    let region = document.querySelector('ol-toast-region');
    if (!region) {
        region = document.createElement('ol-toast-region');
        document.body.appendChild(region);
    }
    const el = document.createElement('ol-toast');
    el.setAttribute('message', message);
    el.setAttribute('type', type);
    region.appendChild(el);
    return el;
}

async function setEditingMode(on) {
    document.body.dataset.editingMode = on ? 'on' : 'off';
    for (const toggle of document.querySelectorAll('#editing-mode-toggle, .editing-mode-toggle--drawer')) toggle.checked = on;
    if (tray) tray.active = on;
    if (on) {
        engine.enable();
        mountHealthStrips();
    } else {
        engine.disable();
        document.querySelectorAll('ol-record-health').forEach((el) => el.remove());
    }
    try { await api.preferences({ editing_mode: on ? 'on' : 'off' }); } catch { /* the toggle still works for this page */ }
}

function mountHealthStrips() {
    for (const slot of document.querySelectorAll('.record-health-slot')) {
        if (slot.querySelector('ol-record-health')) continue;
        const el = document.createElement('ol-record-health');
        el.setAttribute('record-key', slot.dataset.key);
        el.labels = labels;
        el.inTray = store.has(normalizeKey(slot.dataset.key));
        slot.appendChild(el);
    }
}

function refreshHealthStrips() {
    for (const el of document.querySelectorAll('ol-record-health')) {
        el.inTray = store.has(normalizeKey(el.getAttribute('record-key')));
    }
}

// ── Bulk tagger (shared with the classic ILE and the book-page pencil) ──

function ensureBulkTagger() {
    if (bulkTagger) return bulkTagger;
    const dialog = document.createElement('ol-dialog');
    dialog.id = 'editing-mode-tagger';
    dialog.className = 'editing-mode-tagger';
    dialog.setAttribute('label', labels.manageSubjects);
    dialog.setAttribute('width', 'medium');
    dialog.innerHTML = renderBulkTagger();
    document.body.appendChild(dialog);
    const form = dialog.querySelector('.bulk-tagging-form');
    form.classList.remove('hidden');
    // Keep the tagger's own header and close control in the DOM (initialize()
    // binds to them); the dialog supplies its own, so CSS hides them.
    bulkTagger = new BulkTagger(form);
    bulkTagger.initialize();
    // The tagger toggles its own `hidden` class while it works and after a
    // submit; inside a dialog the form stays visible and only a submit closes it.
    let submitted = false;
    form.querySelector('.bulk-tagging-submit')?.addEventListener('click', () => { submitted = true; });
    form.addEventListener('option-hidden', () => {
        form.classList.remove('hidden');
        if (submitted) { submitted = false; dialog.open = false; }
    });
    bulkTagger.dialog = dialog;
    // Route the staged adds/removes through the batch preview (preview, one
    // edit, undo; request for librarians) instead of the tagger's own POST.
    bulkTagger.submitButton.textContent = labels.preview || 'Preview';
    bulkTagger.submitBatch = () => {
        bulkTagger.prepareFormForSubmission();
        const read = (name) => { try { return JSON.parse(form.querySelector(`[name="${name}"]`).value || '{}'); } catch { return {}; } };
        const params = { add: read('tags_to_add'), remove: read('tags_to_remove') };
        const keys = (bulkTagger.selectedWorks || []).map((o) => `/works/${o}`);
        dialog.open = false;
        bulkTagger.resetTaggingMenu();
        tray.runBatch('tag', keys, params, { titleKey: 'manageSubjects', reload: bulkTagger.isBookPageEdit });
    };
    // The tagger reloads the page after a book-page edit via window.ILE; give it what it expects.
    window.ILE = window.ILE || { clearAndReset() {}, selectionManager: { selectedItems: { work: [] }, addSelectedItem() {}, updateToolbar() {} }, updateAndShowBulkTagger: openTagger };
    return bulkTagger;
}

function openTagger(workOlids, isBookPageEdit = false) {
    const tagger = ensureBulkTagger();
    tagger.isBookPageEdit = isBookPageEdit;
    tagger.dialog.open = true;
    tagger.updateWorks(workOlids);
    tagger.showTaggingMenu();
}

function wirePencil() {
    document.querySelectorAll('.edit-subject-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openTagger([btn.dataset.workOlid], true);
        });
    });
}

// ── Tray events ─────────────────────────────────────────────────────

function wireTray() {
    tray.addEventListener('ol-tray-add', (e) => store.add(e.detail.keys));
    tray.addEventListener('ol-tray-remove', (e) => store.remove(e.detail.keys));
    tray.addEventListener('ol-tray-clear', () => store.clear());
    tray.addEventListener('ol-tray-note', (e) => store.setNote(e.detail.key, e.detail.text));
    tray.addEventListener('ol-tray-done', (e) => store.setDone(e.detail.key, e.detail.value));
    tray.addEventListener('ol-tray-saved', (e) => store.savedOp(e.detail));
    tray.addEventListener('ol-tray-add-page', () => store.add(engine.entriesOnPage()));
    tray.addEventListener('ol-tray-resize', (e) => {
        document.body.style.setProperty('--tray-width', `${e.detail.width}px`);
        if (e.detail.commit) api.preferences({ tray_width: e.detail.width }).catch(() => {});
    });
    tray.addEventListener('ol-tray-collapse', (e) => {
        document.body.classList.toggle('tray-collapsed', e.detail.collapsed);
        api.preferences({ tray_docked: e.detail.collapsed ? 'collapsed' : 'open' }).catch(() => {});
    });
    tray.addEventListener('ol-tray-classic', async() => {
        await api.preferences({ librarian_tools: 'classic' });
        window.location.reload();
    });
    tray.addEventListener('ol-tray-manage-subjects', (e) => openTagger(e.detail.keys.map(olid)));
    tray.addEventListener('ol-batch-applied', (e) => {
        // Rows on this page that a batch touched keep their checkbox but show the state.
        for (const key of e.detail.keys || []) {
            document.querySelectorAll(`[data-ol-key="${key}"]`).forEach((el) => el.classList.add('ol-selectable--touched'));
        }
        if (e.detail.dropFromTray) store.remove(e.detail.keys || []);
        // A book-page subject edit: the page's own chips are server-rendered.
        if (e.detail.reload && e.detail.status === 'applied') setTimeout(() => window.location.reload(), 1200);
    });
    // Health strips add to the tray too.
    document.addEventListener('ol-tray-add', (e) => { if (e.target !== tray) store.add(e.detail.keys); });
    document.addEventListener('ol-tray-remove', (e) => { if (e.target !== tray) store.remove(e.detail.keys); });
}

function pushToTray() {
    tray.items = store.items;
    tray.saved = store.saved;
    tray.pageKeys = engine.enabled ? engine.keysOnPage() : [];
    refreshHealthStrips();
}

// ── Init ────────────────────────────────────────────────────────────

export async function init() {
    labels = readLabels();
    store = new TrayStore();
    engine = new SelectionEngine(store, { labels });
    tray = document.querySelector('ol-librarian-tray');
    if (!tray) {
        tray = document.createElement('ol-librarian-tray');
        document.body.appendChild(tray);
    }
    tray.username = document.body.dataset.username || '';
    tray.canApply = document.body.dataset.canApply === 'true';
    tray.pageKey = normalizeKey(window.location.pathname) || '';
    if (document.body.dataset.trayWidth) tray.width = Number(document.body.dataset.trayWidth);
    document.body.classList.toggle('tray-collapsed', tray.hasAttribute('collapsed'));

    wireTray();
    wirePencil();
    store.addEventListener('change', pushToTray);
    store.addEventListener('error', (e) => {
        // eslint-disable-next-line no-console
        console.warn('tray sync failed', e.detail);
    });

    for (const toggle of document.querySelectorAll('#editing-mode-toggle, .editing-mode-toggle--drawer')) {
        toggle.addEventListener('ol-toggle-change', (e) => setEditingMode(e.detail.checked));
    }
    document.addEventListener('ol-editing-help', () => toast(labels.keyboardHint));

    if (isOn()) {
        engine.enable();
        mountHealthStrips();
        tray.active = true;
    }
    pushToTray();
    await store.load();
    pushToTray();
}

import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Selectors for HTML elements that should be preserved as HTMLBlock nodes.
 * These are elements markdown-it passes through with html:true that have
 * no corresponding Tiptap/StarterKit node.
 */
const HTML_SELECTORS = [
    'img',
    'figure',
    'video',
    'audio',
    'iframe',
    'table',
    'a[name]',
    'center',
].join(',');

/**
 * Walks the rendered DOM (produced by markdown-it) before ProseMirror parses it.
 * Finds raw HTML elements and wraps them in <div data-html-block> so the
 * HTMLBlock node's parseHTML rule can pick them up.
 */
function wrapHtmlElements(root) {
    const candidates = [...root.querySelectorAll(HTML_SELECTORS)];

    for (let i = candidates.length - 1; i >= 0; i--) {
        const el = candidates[i];

        if (el.closest('[data-html-block]') || el.closest('pre')) continue;

        // Skip if a parent candidate will be wrapped instead
        if (candidates.some(other => other !== el && other.contains(el))) continue;

        // For <img> inside <a>, treat the <a> as the unit
        let target = el;
        if (el.tagName === 'IMG' && el.parentElement?.tagName === 'A') {
            target = el.parentElement;
        }

        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-html-block', '');
        wrapper.setAttribute('data-content', target.outerHTML);
        target.parentNode.replaceChild(wrapper, target);
    }
}

export const HTMLBlock = Node.create({
    name: 'htmlBlock',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
        return {
            content: {
                default: '',
                renderHTML: () => ({}),
                parseHTML: (element) => element.getAttribute('data-content') || '',
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'div[data-html-block]' },
        ];
    },

    renderHTML({ node }) {
        return ['div', mergeAttributes({
            'data-html-block': '',
            'data-content': node.attrs.content,
        })];
    },

    addNodeView() {
        return ({ node, getPos }) => {
            const dom = document.createElement('div');
            dom.classList.add('html-block-view');
            dom.contentEditable = 'false';

            const label = document.createElement('span');
            label.classList.add('html-block-label');
            label.textContent = 'HTML';
            dom.appendChild(label);

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.classList.add('html-block-edit-btn');
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pos = typeof getPos === 'function' ? getPos() : null;
                dom.dispatchEvent(new CustomEvent('html-block-edit', {
                    bubbles: true,
                    composed: true,
                    detail: { content: node.attrs.content, pos },
                }));
            });
            dom.appendChild(editBtn);

            const pre = document.createElement('pre');
            pre.classList.add('html-block-code');
            const code = document.createElement('code');
            code.textContent = node.attrs.content;
            pre.appendChild(code);
            dom.appendChild(pre);

            return {
                dom,
                update(updatedNode) {
                    if (updatedNode.type.name !== 'htmlBlock') return false;
                    code.textContent = updatedNode.attrs.content;
                    return true;
                },
                stopEvent: () => true,
                ignoreMutation: () => true,
            };
        };
    },

    addCommands() {
        return {
            setHtmlBlock: (content) => ({ commands }) => {
                return commands.insertContent({
                    type: 'htmlBlock',
                    attrs: { content },
                });
            },
            updateHtmlBlock: (pos, content) => ({ tr, dispatch }) => {
                if (dispatch) {
                    tr.setNodeMarkup(pos, undefined, { content });
                }
                return true;
            },
        };
    },

    addStorage() {
        return {
            markdown: {
                serialize(state, node) {
                    state.write(node.attrs.content);
                    state.closeBlock(node);
                },
                parse: {
                    updateDOM(element) {
                        wrapHtmlElements(element);
                    },
                },
            },
        };
    },
});

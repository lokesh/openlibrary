#!/usr/bin/env node
/**
 * Extract :host styles from Lit components to generate pre-hydration CSS.
 *
 * This prevents FOUC (Flash of Unstyled Content) by ensuring custom elements
 * reserve the correct space and appearance before their JS loads.
 *
 * :host selectors are converted to tag-name:not(:defined) selectors so they
 * apply only before the custom element is registered.
 *
 * Usage: node scripts/extract-lit-host-styles.js
 * Output: static/build/lit-components/pre-hydration.css
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COMPONENTS_DIR = join(ROOT, 'openlibrary/components/lit');
const OUTPUT_DIR = process.env.BUILD_DIR || join(ROOT, 'static/build/lit-components');
const OUTPUT_FILE = join(OUTPUT_DIR, 'pre-hydration.css');

/**
 * Extract the tag name from a customElements.define() call in the source.
 * @param {string} source - The component source code
 * @returns {string|null} The tag name or null
 */
function extractTagName(source) {
    const match = source.match(/customElements\.define\(\s*['"]([^'"]+)['"]/);
    return match ? match[1] : null;
}

/**
 * Extract the static styles CSS string from a Lit component source.
 * Handles the css`` tagged template literal.
 * @param {string} source - The component source code
 * @returns {string|null} The raw CSS string or null
 */
function extractStaticStyles(source) {
    // Match static styles = css`...`; handling nested backticks isn't needed
    // since Lit CSS doesn't use them. We match the outermost css`` block.
    const match = source.match(/static\s+styles\s*=\s*css`([\s\S]*?)`;/);
    return match ? match[1] : null;
}

/**
 * Parse :host rules from CSS text and convert them to pre-hydration selectors.
 *
 * Converts:
 *   :host { ... }           -> tag-name:not(:defined) { ... }
 *   :host([attr]) { ... }   -> tag-name[attr]:not(:defined) { ... }
 *
 * Only extracts :host rules (not .class or other internal selectors),
 * since those are inside shadow DOM and can't be targeted from outside.
 *
 * @param {string} cssText - Raw CSS from the component's static styles
 * @param {string} tagName - The custom element tag name
 * @returns {string} Converted CSS rules
 */
function convertHostRules(cssText, tagName) {
    const rules = [];

    // Match :host selectors and their declaration blocks.
    // This regex handles :host, :host([...]), and :host([...][...]).
    const hostRegex = /:host(?:\(([^)]*)\))?\s*\{([^}]*)\}/g;
    let match;

    while ((match = hostRegex.exec(cssText)) !== null) {
        const qualifier = match[1] || '';  // e.g., [size="small"]
        const declarations = match[2].trim();

        if (!declarations) continue;

        // Build the pre-hydration selector
        const selector = qualifier
            ? `${tagName}${qualifier}:not(:defined)`
            : `${tagName}:not(:defined)`;

        rules.push(`${selector} {\n${indent(declarations)}\n}`);
    }

    return rules.join('\n\n');
}

/**
 * Extract @prehydration blocks from component source comments.
 * These allow components to declare additional pre-hydration CSS that goes
 * beyond what can be auto-extracted from :host (e.g., visibility: hidden,
 * min-height for layout shift prevention).
 *
 * @param {string} source - The component source code
 * @returns {string} The raw CSS from @prehydration blocks
 */
function extractPrehydrationBlocks(source) {
    const blocks = [];
    const regex = /@prehydration\s*\n([\s\S]*?)@end-prehydration/g;
    let match;

    while ((match = regex.exec(source)) !== null) {
        // Strip leading " * " comment markers from each line
        const css = match[1]
            .split('\n')
            .map(line => line.replace(/^\s*\*\s?/, ''))
            .join('\n')
            .trim();
        if (css) blocks.push(css);
    }

    return blocks.join('\n\n');
}

/**
 * Merge CSS rules that share the same selector into a single block.
 * Later declarations override earlier ones for the same property.
 *
 * @param {string} cssText - CSS text potentially containing duplicate selectors
 * @returns {string} CSS with merged selectors
 */
function mergeDuplicateSelectors(cssText) {
    const ruleRegex = /([^{]+)\{([^}]*)\}/g;
    const selectorOrder = [];
    const selectorMap = new Map();
    let match;

    while ((match = ruleRegex.exec(cssText)) !== null) {
        const selector = match[1].trim();
        const declarations = match[2].trim();

        if (!selectorMap.has(selector)) {
            selectorOrder.push(selector);
            selectorMap.set(selector, new Map());
        }

        // Parse declarations and merge (later wins)
        const declMap = selectorMap.get(selector);
        for (const decl of declarations.split(';')) {
            const colonIndex = decl.indexOf(':');
            if (colonIndex === -1) continue;
            const prop = decl.slice(0, colonIndex).trim();
            const value = decl.slice(colonIndex + 1).trim();
            if (prop) declMap.set(prop, value);
        }
    }

    return selectorOrder
        .map(selector => {
            const declMap = selectorMap.get(selector);
            const declarations = Array.from(declMap.entries())
                .map(([prop, value]) => `    ${prop}: ${value};`)
                .join('\n');
            return `${selector} {\n${declarations}\n}`;
        })
        .join('\n\n');
}

/**
 * Normalize indentation to 4 spaces for consistency.
 */
function indent(text) {
    return text
        .split('\n')
        .map(line => `    ${line.trim()}`)
        .filter(line => line.trim())
        .join('\n');
}

// --- Main ---

const INDEX_FILE = join(COMPONENTS_DIR, 'index.js');
const indexSource = readFileSync(INDEX_FILE, 'utf8');

// Extract component file paths from the index.js exports
const importRegex = /from\s+['"](\.\/[^'"]+)['"]/g;
const componentFiles = [];
let importMatch;
while ((importMatch = importRegex.exec(indexSource)) !== null) {
    componentFiles.push(join(COMPONENTS_DIR, importMatch[1]));
}

const cssBlocks = [];
const generatedDate = new Date().toISOString().split('T')[0];

for (const filePath of componentFiles) {
    const source = readFileSync(filePath, 'utf8');
    const tagName = extractTagName(source);
    const cssText = extractStaticStyles(source);

    if (!tagName) continue;

    const parts = [];

    // Auto-extract :host rules from static styles
    if (cssText) {
        const converted = convertHostRules(cssText, tagName);
        if (converted) parts.push(converted);
    }

    // Append any explicit @prehydration overrides from comments.
    // These can add properties that aren't in :host (e.g., visibility,
    // min-height) or override auto-extracted values.
    const prehydration = extractPrehydrationBlocks(source);
    if (prehydration) parts.push(prehydration);

    if (parts.length > 0) {
        // Merge duplicate selectors so the output is clean
        const merged = mergeDuplicateSelectors(parts.join('\n\n'));
        cssBlocks.push(`/* ${tagName} */\n${merged}`);
    }
}

if (cssBlocks.length === 0) {
    console.log('No :host styles found in Lit components.');
    process.exit(0);
}

const output = `/**
 * Pre-hydration styles for Lit web components (auto-generated).
 *
 * These styles use :not(:defined) to apply ONLY before the custom element's
 * JS has loaded and registered the element. Once defined, these rules no
 * longer match and the component's shadow DOM styles take over.
 *
 * DO NOT EDIT — regenerate with: node scripts/extract-lit-host-styles.js
 * Generated: ${generatedDate}
 */

${cssBlocks.join('\n\n')}
`;

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, output, 'utf8');
console.log(`Wrote pre-hydration CSS to ${OUTPUT_FILE}`);
console.log(`Extracted styles for ${cssBlocks.length} component(s).`);

# Regression Prevention Strategy for Frontend Modernization

## Current State Assessment

| Area | Status | Risk Level |
|------|--------|------------|
| JS unit tests | 20 test files for 93 source files, 14% coverage threshold | **High** |
| E2E tests | None | **Critical** |
| Visual regression tests | None | **Critical** |
| Storybook | 1 story file (effectively unused) | **High** |
| CSS linting | Stylelint with strict variable enforcement | Low |
| JS linting | ESLint + Vue plugin | Low |
| Bundle size monitoring | bundlesize2 with 25+ thresholds | Low |
| Error tracking | Sentry (production) | Low |

The biggest gaps are **visual regression testing** and **E2E testing**. These are exactly the layers that catch UI regressions that unit tests miss.

---

## Strategy 1: Visual Regression Testing with Playwright + Argos CI

**What it catches:** Layout shifts, broken components, styling regressions, missing elements — the exact class of bugs that slip through when modernizing UI.

### Setup

**Tool: [Argos CI](https://argos-ci.com/) + Playwright**

Argos is free for open-source projects and integrates directly with GitHub PRs. It takes screenshots of pages and compares them against a baseline, flagging visual diffs for human review.

```bash
npm install --save-dev @argos-ci/playwright @playwright/test
npx playwright install chromium
```

**File: `tests/visual/playwright.config.ts`**
```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  use: {
    baseURL: 'http://localhost:8080',
    screenshot: 'off', // Argos handles screenshots
  },
  webServer: {
    command: 'docker compose up -d web solr memcached infobase db',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

**File: `tests/visual/pages.spec.ts`**
```js
import { test } from '@playwright/test';
import { argosScreenshot } from '@argos-ci/playwright';

const criticalPages = [
  { name: 'homepage', path: '/' },
  { name: 'book-page', path: '/works/OL45804W/Fantastic_Mr._Fox' },
  { name: 'author-page', path: '/authors/OL34184A/Roald_Dahl' },
  { name: 'search-results', path: '/search?q=javascript' },
  { name: 'subject-page', path: '/subjects/fiction' },
  { name: 'reading-log', path: '/people/mekarpeles/books/want-to-read' },
  { name: 'edit-page', path: '/books/OL7353617M/edit' },
];

for (const page of criticalPages) {
  test(`visual: ${page.name}`, async ({ page: p }) => {
    await p.goto(page.path);
    await p.waitForLoadState('networkidle');
    await argosScreenshot(p, page.name, { fullPage: true });
  });

  test(`visual: ${page.name} (mobile)`, async ({ page: p }) => {
    await p.setViewportSize({ width: 375, height: 812 });
    await p.goto(page.path);
    await p.waitForLoadState('networkidle');
    await argosScreenshot(p, `${page.name}-mobile`, { fullPage: true });
  });
}
```

**GitHub Actions workflow: `.github/workflows/visual_regression.yml`**
```yaml
name: Visual Regression
on: [pull_request]

jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: docker compose up -d web solr memcached infobase db
      - run: npx wait-on http://localhost:8080 --timeout 120000
      - run: npx playwright test tests/visual/
      - name: Upload to Argos
        run: npx @argos-ci/cli upload ./screenshots
        env:
          ARGOS_TOKEN: ${{ secrets.ARGOS_TOKEN }}
```

**Cost:** Free for open-source. Adds ~3-5 min to PR checks.

**Alternative:** [Percy](https://percy.io/) or [Chromatic](https://www.chromatic.com/) (if Storybook usage increases). Lost Pixel is another free OSS option.

---

## Strategy 2: E2E Testing with Playwright

**What it catches:** Broken user flows, JavaScript errors, interaction bugs, form submission failures — things that look fine visually but don't work.

### Critical User Flows to Cover First

Priority order based on traffic and breakage risk:

1. **Search flow** — search bar → results → click result → book page
2. **Reading log** — log in → mark book "Want to Read" → verify in reading log
3. **Book page rendering** — editions table, cover image, availability checks
4. **Edit flow** — navigate to edit → modify field → save → verify change
5. **Account flow** — sign up → log in → profile page
6. **Lending flow** — borrow → read → return

### Setup

```bash
npm install --save-dev @playwright/test
```

**File: `tests/e2e/search.spec.ts`**
```js
import { test, expect } from '@playwright/test';

test('search returns results and navigates to book', async ({ page }) => {
  await page.goto('/');
  await page.fill('input[name="q"]', 'Fantastic Mr Fox');
  await page.press('input[name="q"]', 'Enter');
  await expect(page.locator('.searchResultItem')).toHaveCount({ min: 1 });
  await page.click('.searchResultItem a >> nth=0');
  await expect(page).toHaveURL(/\/works\//);
  await expect(page.locator('h1')).toBeVisible();
});
```

**Integration with Docker:** The existing `compose.yaml` already has all needed services. Tests run against the local Docker stack.

**Cost:** Free (Playwright is OSS). Adds ~5-10 min to CI depending on test count.

---

## Strategy 3: Expand Storybook as a Component Catalog + Chromatic

**What it catches:** Component-level regressions in isolation, without needing a full app stack.

The current Storybook setup has **1 story file**. This is a massive missed opportunity, especially with the Vue 3 components (`BarcodeScanner`, `BulkSearch`, `MergeUI`, `LibraryExplorer`, `ObservationForm`, `IdentifiersInput`).

### Approach

1. **Write stories for every Vue component** — these are self-contained and easy to story-ify
2. **Write stories for key macro/template patterns** — render the HTML output as static stories
3. **Add [Chromatic](https://www.chromatic.com/)** — free for OSS, provides visual review on every PR for Storybook components

**File: `stories/BulkSearch.stories.js`**
```js
export default {
  title: 'Components/BulkSearch',
  render: (args) => `<ol-bulk-search></ol-bulk-search>`,
};

export const Default = {};
export const WithResults = {
  play: async ({ canvasElement }) => {
    // Simulate user interaction
  },
};
```

**Why this matters for modernization:** When you're replacing jQuery widgets with Vue components, Storybook gives you a side-by-side view of the old vs. new behavior without deploying anything.

**Cost:** Free for OSS (Chromatic). Medium effort to write stories.

---

## Strategy 4: Increase JavaScript Unit Test Coverage (Targeted)

**Current state:** 14% coverage threshold — extremely low. But blanket coverage mandates waste time. Instead, target coverage at **code you're changing**.

### Approach: Coverage Gates on Changed Files Only

Use **jest `--changedSince`** or a coverage diff tool to enforce that:
- Any **modified** JS file must not decrease in coverage
- Any **new** JS file must have >60% coverage

**Tool: [jest-coverage-guard](https://github.com/nicolo-ribaudo/jest-coverage-guard) or custom script**

**Simpler alternative — add to CI:**
```yaml
- name: Check coverage on changed files
  run: |
    CHANGED=$(git diff --name-only origin/master...HEAD -- '*.js' '*.vue')
    npx jest --coverage --collectCoverageFrom="$CHANGED" --coverageThreshold='{"global":{"lines":50}}'
```

### Priority Files to Add Tests For

Based on UI-critical modules in `openlibrary/plugins/openlibrary/js/`:

| File | Lines | Reason | Has Tests? |
|------|-------|--------|------------|
| `SearchBar.js` | Core search UX | Yes (partial) |
| `edit.js` | Edit page functionality | No |
| `covers.js` | Cover management | No |
| `autocomplete.js` | Search suggestions | No |
| `dropper.js` | Reading log dropdowns | Yes (partial) |
| `carousel/` | Book carousels | No |
| `ile/` | Inline editing | No |
| `modals/` | Modal system | No |

---

## Strategy 5: Feature Flags for Gradual Rollout

**What it catches:** Nothing directly — but it limits blast radius when regressions do escape.

### Lightweight Approach (No External Service)

Open Library already has a config system. Add a simple feature flag mechanism:

**File: `openlibrary/core/feature_flags.py`**
```python
FEATURE_FLAGS = {
    'new_search_bar': False,
    'vue_book_page': False,
    'modern_header': False,
}

def is_enabled(flag_name, user=None):
    # Check config, percentage rollout, or staff-only
    ...
```

**In templates:**
```html
$if feature_flag('new_search_bar'):
    $:render_component('NewSearchBar', {})
$else:
    $# existing search bar markup
```

**Heavier alternative:** [LaunchDarkly](https://launchdarkly.com/) (free for OSS) or [Unleash](https://github.com/Unleash/unleash) (self-hosted, open-source).

---

## Strategy 6: Canary/Staging Deployment Validation

**Current state:** There's a `compose.staging.yaml` and staging infrastructure exists, but no automated smoke testing after deploy.

### Add Post-Deploy Smoke Tests

After deploying to staging, automatically run a lightweight Playwright suite:

```yaml
# .github/workflows/staging_smoke.yml
name: Staging Smoke Test
on:
  workflow_run:
    workflows: ["Deploy to Staging"]
    types: [completed]

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test tests/smoke/ --config=tests/smoke/playwright.config.ts
        env:
          BASE_URL: https://staging.openlibrary.org
```

**Smoke tests are intentionally thin:**
- Homepage loads (status 200, key elements visible)
- Search returns results
- A book page renders
- CSS/JS assets load (no 404s)
- No console errors

---

## Strategy 7: Bundle Size + Performance Budgets

**Current state:** `bundlesize2` already monitors 25+ files. Expand this.

### Add Lighthouse CI

```bash
npm install --save-dev @lhci/cli
```

**File: `lighthouserc.js`**
```js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:8080/', 'http://localhost:8080/search?q=test'],
      startServerCommand: 'docker compose up -d',
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.5 }],
        'categories:accessibility': ['error', { minScore: 0.7 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 4000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.25 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};
```

**CLS (Cumulative Layout Shift) budgets** are especially important during UI modernization — they catch exactly the kind of layout thrashing that new CSS introduces.

---

## Strategy 8: Enhanced Sentry Monitoring for Rapid Detection

**Current state:** Sentry is integrated but could be used more proactively.

### Add Frontend Error Tracking

```js
// In the main JS bundle entry point
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: '...',
  release: 'openlibrary@' + __VERSION__,
  environment: 'production',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: false }),
  ],
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0, // Capture session replay on every error
});
```

**Session Replay** (`@sentry/replay`) records what the user saw when an error occurred — invaluable for reproducing UI regressions that are hard to catch in tests.

### Release Health Monitoring

Configure Sentry release health to alert when:
- Error rate increases >20% after a deploy
- New error types appear that didn't exist in the previous release
- Crash-free session rate drops below threshold

---

## Recommended Implementation Order

| Phase | Strategy | Effort | Impact | Timeline |
|-------|----------|--------|--------|----------|
| **1** | Playwright E2E for top 5 flows | Medium | **Very High** | Week 1-2 |
| **2** | Visual regression (Argos + Playwright) | Low | **Very High** | Week 2-3 |
| **3** | Feature flags for new UI work | Low | **High** | Week 2 |
| **4** | Sentry frontend + session replay | Low | **High** | Week 1 |
| **5** | Coverage gates on changed files | Low | Medium | Week 3 |
| **6** | Storybook expansion for Vue components | Medium | Medium | Ongoing |
| **7** | Lighthouse CI performance budgets | Low | Medium | Week 4 |
| **8** | Staging smoke tests | Low | Medium | Week 4 |

**Phases 1-4 are the critical path.** They can be pursued in parallel and together provide:
- **Prevention** (E2E + visual tests block broken PRs)
- **Containment** (feature flags limit blast radius)
- **Detection** (Sentry catches what tests miss in production)

---

## What This Does NOT Recommend

- **100% unit test coverage mandates** — diminishing returns, slows velocity
- **Snapshot testing** — brittle, high maintenance, low signal for server-rendered templates
- **Manual QA processes** — the goal is automation to support speed
- **Rewriting the test infrastructure** — build on what exists (Jest, pytest, GitHub Actions)

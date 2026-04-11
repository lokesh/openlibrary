/**
 * Functionalities for templates/work_search and related templates.
 */

import { buildPartialsUrl } from './utils';

/**
 * Displays more facets by removing the ui-helper-hidden class.
 *
 * @param {String} header class name
 * @param {Number} start_facet_count initial number of displayed facets
 * @param {Number} facet_inc number of hidden facets to be displayed
 */
export function more(header, start_facet_count, facet_inc) {
    const facetEntry = `div.${header} div.facetEntry`
    const shown = $(`${facetEntry}:not(:hidden)`).length
    const total = $(facetEntry).length
    if (shown === start_facet_count) {
        $(`#${header}_less`).show();
        $(`#${header}_bull`).show();
    }
    if (shown + facet_inc >= total) {
        $(`#${header}_more`).hide();
        $(`#${header}_bull`).hide();
    }
    $(`${facetEntry}:hidden`).slice(0, facet_inc).removeClass('ui-helper-hidden');
}

/**
 * Hides facets by adding the ui-helper-hidden class.
 *
 * @param {String} header class name
 * @param {Number} start_facet_count initial number of displayed facets
 * @param {Number} facet_inc number of displayed facets to be hidden
 */
export function less(header, start_facet_count, facet_inc) {
    const facetEntry = `div.${header} div.facetEntry`
    const shown = $(`${facetEntry}:not(:hidden)`).length
    const total = $(facetEntry).length
    const increment_extra = (shown - start_facet_count) % facet_inc;
    const facet_dec = (increment_extra === 0) ? facet_inc:increment_extra;
    const next_shown = Math.max(start_facet_count, shown - facet_dec);
    if (shown === total) {
        $(`#${header}_more`).show();
        $(`#${header}_bull`).show();
    }
    if (next_shown === start_facet_count) {
        $(`#${header}_less`).hide();
        $(`#${header}_bull`).hide();
    }
    $(`${facetEntry}:not(:hidden)`).slice(next_shown, shown).addClass('ui-helper-hidden');
}

/**
 * Initializes the search page's search facet affordances.
 *
 * If the search facets sidebar is in `asyncLoad` mode, the sidebar will initially contain loading
 * indicators instead of facet counts.  In this case, a request is made for sidebar markup
 * containing the actual counts, and the existing sidebar is replaced with the new sidebar.
 *
 * In either case, the sidebar is hydrated.
 *
 * In `asyncLoad` mode, the markup for selected facets is also loaded asynchronously.
 *
 * @param {HTMLElement} facetsElem Root element of the search facets sidebar component
 */
export async function initSearchFacets(facetsElem) {
    const asyncLoad = facetsElem.dataset.asyncLoad

    if (asyncLoad) {
        const param = JSON.parse(facetsElem.dataset.param)
        await whenVisible(facetsElem);

        fetchPartials(param)
            .then((data) => {
                if (data.activeFacets) {
                    const activeFacetsElem = createElementFromMarkup(data.activeFacets)
                    const activeFacetsContainer = document.querySelector('.selected-search-facets-container')
                    activeFacetsContainer.replaceChildren(activeFacetsElem)
                }
                const newFacetsElem = createElementFromMarkup(data.sidebar)
                facetsElem.replaceWith(newFacetsElem)
                hydrateFacets()

                document.title = data.title
            })
            .catch(() => {
                // XXX : Handle case where `/partials` response is not `2XX` here
            })
    } else {
        hydrateFacets()
    }
}


/**
 * Adds click listeners to the "show more" and "show less" facet affordances.
 */
function hydrateFacets() {
    const data_config_json = $('#searchFacets').data('config');
    const start_facet_count = data_config_json['start_facet_count'];
    const facet_inc = data_config_json['facet_inc'];

    $('.header_bull').hide();
    $('.header_more').on('click', function(){
        more($(this).data('header'), start_facet_count, facet_inc);
    });
    $('.header_less').on('click', function(){
        less($(this).data('header'), start_facet_count, facet_inc);
    });
}

/**
 * A successful response from the partials request
 *
 * @typedef {Object} PartialsResponse
 * @property {string} title - The new title for this page
 * @property {string} sidebar - HTML string for the facets sidebar
 * @property {string} [activeFacets] - HTML string for the selected facets
 */
/**
 * Using the given search parameters, makes call for a partially rendered facet affordances
 * and the new title for the page.
 *
 * @param {Object} param
 * @returns {Promise<PartialsResponse>}
 *
 * @throws Error when `/partials` response is not in 200-299 range.
 */
function fetchPartials(param) {
    const data = {
        param: param,
        path: location.pathname,
        query: location.search
    }

    return fetch(buildPartialsUrl('SearchFacets', {data: JSON.stringify(data)}))
        .then((resp) => {
            if (!resp.ok) {
                throw new Error(`Failed to fetch partials. Status code: ${resp.status}`)
            }
            return resp.json()
        })
}

/**
 * Returns an `HTMLElement` that was created using the given `markup`.
 *
 * `markup` is expected to be well-formed, and only have a single root
 * element.
 *
 * @param {string} markup HTML markup for a single element
 * @returns {HTMLElement}
 */
function createElementFromMarkup(markup) {
    const template = document.createElement('template')
    template.innerHTML = markup
    return template.content.children[0]
}


/**
 * Parses the current URL search params into a param object matching the
 * server-side search param format.
 *
 * @returns {Object} Search parameters
 */
function getSearchParamsFromUrl() {
    const url = new URL(window.location.href)
    const param = {}
    // Keys that accept multiple values (arrays)
    const multiValueKeys = new Set([
        'author_key', 'language', 'first_publish_year', 'publisher_facet',
        'subject_facet', 'person_facet', 'place_facet', 'time_facet', 'public_scan_b'
    ])

    for (const [key, value] of url.searchParams.entries()) {
        if (key === 'page') continue  // page is handled separately
        if (multiValueKeys.has(key)) {
            if (!param[key]) param[key] = []
            param[key].push(value)
        } else {
            param[key] = value
        }
    }
    return param
}

/**
 * Builds a new URL with the given page number, preserving all other params.
 *
 * @param {Number} page
 * @returns {string} New URL path + query string
 */
function buildPageUrl(page) {
    const url = new URL(window.location.href)
    if (page <= 1) {
        url.searchParams.delete('page')
    } else {
        url.searchParams.set('page', page)
    }
    return url.pathname + url.search
}

/**
 * Fetches search results HTML from the partials endpoint.
 *
 * @param {Object} param Search parameters
 * @param {Number} page Page number
 * @param {AbortSignal} [signal] AbortController signal
 * @returns {Promise<Object>} Response with results HTML, numFound, and title
 */
function fetchSearchResults(param, page, signal) {
    const data = { param, page, rows: 20 }
    const url = buildPartialsUrl('SearchResults', { data: JSON.stringify(data) })

    return fetch(url, { signal })
        .then((resp) => {
            if (!resp.ok) {
                throw new Error(`Failed to fetch search results. Status code: ${resp.status}`)
            }
            return resp.json()
        })
}

/**
 * Initializes AJAX pagination for the search results page.
 *
 * Intercepts pagination clicks and sort changes to fetch results via AJAX
 * instead of doing a full page reload. Handles browser back/forward navigation.
 *
 * @param {HTMLElement} resultsContainer The .resultsContainer element
 */
export function initAjaxPagination(resultsContainer) {
    let currentController = null
    const announcer = document.getElementById('searchResultsAnnouncer')

    /**
     * Loads search results for the given page and updates the DOM.
     *
     * @param {Number} page
     * @param {Object} [paramOverrides] Optional param overrides (e.g. for sort changes)
     * @returns {Promise<void>}
     */
    async function loadResults(page, paramOverrides) {
        // Abort any in-flight request
        if (currentController) {
            currentController.abort()
        }
        currentController = new AbortController()

        const searchResults = resultsContainer.querySelector('#searchResults')
        if (!searchResults) return

        // Show loading state
        searchResults.classList.add('search-results--loading')

        const param = Object.assign(getSearchParamsFromUrl(), paramOverrides || {})

        try {
            const data = await fetchSearchResults(param, page, currentController.signal)

            if (!data.results) return

            // Swap results HTML
            const newResults = createElementFromMarkup(data.results)
            searchResults.replaceWith(newResults)

            // Update page title
            if (data.title) {
                document.title = data.title
            }

            // Update URL
            const newUrl = buildPageUrl(page)
            history.pushState({ ajaxSearch: true, page }, '', newUrl)

            // Scroll to top of results
            resultsContainer.scrollIntoView({ behavior: 'smooth' })

            // Announce to screen readers
            if (announcer) {
                announcer.textContent = `Page ${page} of results loaded`
            }
        } catch (err) {
            if (err.name === 'AbortError') return  // Intentional abort

            searchResults.classList.remove('search-results--loading')

            // Show inline error with retry
            const errorDiv = document.createElement('div')
            errorDiv.className = 'search-results-error'
            errorDiv.innerHTML = `
                <p>Something went wrong loading results.</p>
                <button class="search-results-error__retry">Try again</button>
            `
            errorDiv.querySelector('.search-results-error__retry')
                .addEventListener('click', () => {
                    errorDiv.remove()
                    loadResults(page, paramOverrides)
                })
            searchResults.appendChild(errorDiv)
        } finally {
            currentController = null
        }
    }

    // Intercept pagination events from ol-pagination component
    resultsContainer.addEventListener('ol-pagination-change', (e) => {
        e.preventDefault()
        const page = e.detail.page
        loadResults(page)
    })

    // Intercept sort link clicks
    const statsContainer = resultsContainer.previousElementSibling
    if (statsContainer && statsContainer.classList.contains('search-results-stats')) {
        statsContainer.addEventListener('click', (e) => {
            const sortLink = e.target.closest('.sort-content a')
            if (!sortLink) return
            e.preventDefault()

            // Extract sort value from the link href
            const linkUrl = new URL(sortLink.href, window.location.origin)
            const sort = linkUrl.searchParams.get('sort')
            const paramOverrides = {}
            if (sort) {
                paramOverrides.sort = sort
            }
            loadResults(1, paramOverrides)
        })
    }

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.ajaxSearch) {
            const url = new URL(window.location.href)
            const page = parseInt(url.searchParams.get('page') || '1', 10)
            // Fetch without pushState (we're already at the right URL)
            const searchResults = resultsContainer.querySelector('#searchResults')
            if (!searchResults) return

            if (currentController) {
                currentController.abort()
            }
            currentController = new AbortController()

            searchResults.classList.add('search-results--loading')
            const param = getSearchParamsFromUrl()

            fetchSearchResults(param, page, currentController.signal)
                .then((data) => {
                    if (!data.results) return
                    const newResults = createElementFromMarkup(data.results)
                    searchResults.replaceWith(newResults)
                    if (data.title) document.title = data.title
                })
                .catch((err) => {
                    if (err.name !== 'AbortError') {
                        searchResults.classList.remove('search-results--loading')
                    }
                })
                .finally(() => { currentController = null })
        }
    })

    // Mark the initial page load state so popstate can distinguish it
    history.replaceState(
        { ajaxSearch: true, page: parseInt(new URL(window.location.href).searchParams.get('page') || '1', 10) },
        '',
        window.location.href
    )
}


/**
 * Waits until the given element is visible in the viewport, then resolves.
 *
 * @param {HTMLElement} elem
 * @param {IntersectionObserverInit} options
 * @returns {Promise<void>}
 */
async function whenVisible(elem, options = {}) {
    return new Promise((resolve) => {
        const intersectionObserver = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) {
                        return
                    }

                    // Stop observing once the element is visible
                    observer.unobserve(entry.target)
                    observer.disconnect()
                    resolve()
                })
            },
            Object.assign({
                root: null,
                rootMargin: '200px',
                threshold: 0
            }, options)
        )

        intersectionObserver.observe(elem);
    });
}

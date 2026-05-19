// --- Search ---

let searchMatches = [];
let currentMatchIdx = -1;
let activeSearchTerm = '';
let pageTextCache = {};

const clearPageTextCache = () => {
    Object.keys(pageTextCache).forEach(k => delete pageTextCache[k]);
};

const getPageTextCached = async (pageIndex) => {
    if (pageTextCache[pageIndex]) return pageTextCache[pageIndex];
    const page = await pdfDoc.getPage(pageIndex);
    const textContent = await page.getTextContent();
    let text = '';
    const items = [];
    textContent.items.forEach(item => {
        if (!item.str || !item.str.trim()) return;
        const tx = item.transform;
        if (Math.abs(tx[3]) === 0 || item.width === 0) return;
        items.push({ start: text.length, str: item.str });
        text += item.str;
    });
    return (pageTextCache[pageIndex] = { text, items });
};

const clearSearchHighlights = () => {
    if (!textLayerDiv) return;
    const cache = pageTextCache[pageNum];
    const spans = Array.from(textLayerDiv.querySelectorAll('span'));
    spans.forEach((span, i) => {
        if (cache && i < cache.items.length) {
            span.textContent = cache.items[i].str;
        } else if (span.querySelector('mark.search-highlight')) {
            // fallback: unwrap marks
            span.querySelectorAll('mark.search-highlight').forEach(mark => {
                while (mark.firstChild) mark.parentNode.insertBefore(mark.firstChild, mark);
                mark.parentNode.removeChild(mark);
            });
        }
    });
};

const applySearchHighlights = async () => {
    if (!activeSearchTerm || searchMatches.length === 0 || !pdfDoc) return;

    await ensureTextLayer();
    clearSearchHighlights();

    const cache = await getPageTextCached(pageNum);
    const { text, items } = cache;
    const lowerTerm = activeSearchTerm.toLowerCase();
    const lowerText = text.toLowerCase();

    // Collect all match offsets on this page
    const pageMatchOffsets = [];
    let idx = 0;
    while ((idx = lowerText.indexOf(lowerTerm, idx)) !== -1) {
        pageMatchOffsets.push(idx);
        idx++;
    }
    if (pageMatchOffsets.length === 0) return;

    // Map page-local match index → global match index
    const globalOffset = searchMatches.filter(m => m.page < pageNum).length;

    const spans = Array.from(textLayerDiv.querySelectorAll('span'));

    items.forEach((item, spanIdx) => {
        const span = spans[spanIdx];
        if (!span) return;

        const itemEnd = item.start + item.str.length;
        const overlapping = pageMatchOffsets
            .map((matchStart, mi) => ({
                matchStart,
                matchEnd: matchStart + activeSearchTerm.length,
                globalIdx: globalOffset + mi,
            }))
            .filter(({ matchStart, matchEnd }) => matchStart < itemEnd && matchEnd > item.start);

        if (overlapping.length === 0) return;

        const orig = item.str;
        span.textContent = '';
        let cursor = 0;

        overlapping.forEach(({ matchStart, matchEnd, globalIdx }) => {
            const relStart = Math.max(0, matchStart - item.start);
            const relEnd = Math.min(orig.length, matchEnd - item.start);
            if (relStart > cursor) span.appendChild(document.createTextNode(orig.slice(cursor, relStart)));
            const mark = document.createElement('mark');
            mark.className = 'search-highlight' + (globalIdx === currentMatchIdx ? ' current' : '');
            mark.textContent = orig.slice(relStart, relEnd);
            span.appendChild(mark);
            cursor = relEnd;
        });

        if (cursor < orig.length) span.appendChild(document.createTextNode(orig.slice(cursor)));
    });

    const currentMark = textLayerDiv.querySelector('mark.search-highlight.current');
    if (currentMark) currentMark.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

const updateSearchCounter = () => {
    const counter = document.getElementById('search-counter');
    if (!counter) return;
    const noMatch = activeSearchTerm && activeSearchTerm.trim() && searchMatches.length === 0;
    counter.textContent = !activeSearchTerm.trim()
        ? ''
        : searchMatches.length === 0
            ? 'No results'
            : `${currentMatchIdx + 1} / ${searchMatches.length}`;
    counter.classList.toggle('no-results', noMatch);
};

const performSearch = async (term) => {
    activeSearchTerm = term;
    searchMatches = [];
    currentMatchIdx = -1;

    if (!pdfDoc || !term.trim()) {
        clearSearchHighlights();
        updateSearchCounter();
        return;
    }

    const lowerTerm = term.toLowerCase();
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const { text } = await getPageTextCached(i);
        const lowerText = text.toLowerCase();
        let idx = 0;
        while ((idx = lowerText.indexOf(lowerTerm, idx)) !== -1) {
            searchMatches.push({ page: i, charOffset: idx });
            idx++;
        }
    }

    currentMatchIdx = searchMatches.length > 0 ? 0 : -1;
    updateSearchCounter();

    if (currentMatchIdx >= 0) {
        const match = searchMatches[0];
        if (match.page !== pageNum) goToPage(match.page);
        else await applySearchHighlights();
    } else {
        clearSearchHighlights();
    }
};

const searchNext = async () => {
    if (searchMatches.length === 0) return;
    currentMatchIdx = (currentMatchIdx + 1) % searchMatches.length;
    updateSearchCounter();
    const match = searchMatches[currentMatchIdx];
    if (match.page !== pageNum) goToPage(match.page);
    else await applySearchHighlights();
};

const searchPrev = async () => {
    if (searchMatches.length === 0) return;
    currentMatchIdx = (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    updateSearchCounter();
    const match = searchMatches[currentMatchIdx];
    if (match.page !== pageNum) goToPage(match.page);
    else await applySearchHighlights();
};

const openSearchBar = () => {
    document.getElementById('search-bar').classList.remove('hidden');
    const input = document.getElementById('search-input');
    input.focus();
    input.select();
};

const closeSearchBar = () => {
    document.getElementById('search-bar').classList.add('hidden');
    activeSearchTerm = '';
    searchMatches = [];
    currentMatchIdx = -1;
    clearSearchHighlights();
    updateSearchCounter();
};

// Called by rendering.js after each page finishes rendering
const onPageRenderComplete = async (renderedPage) => {
    if (activeSearchTerm && searchMatches.some(m => m.page === renderedPage)) {
        await applySearchHighlights();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('search-input');
    let debounceTimer;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => performSearch(input.value), 300);
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? searchPrev() : searchNext(); }
        if (e.key === 'Escape') closeSearchBar();
    });

    document.getElementById('search-prev').addEventListener('click', searchPrev);
    document.getElementById('search-next').addEventListener('click', searchNext);
    document.getElementById('search-close').addEventListener('click', closeSearchBar);
});

document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (!pdfDoc) return;
        e.preventDefault();
        openSearchBar();
    }
});

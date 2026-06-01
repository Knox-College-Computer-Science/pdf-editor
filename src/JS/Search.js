// --- Search ---

let searchMatches = [];
let currentMatchIdx = -1;
let activeSearchTerm = '';
let pageTextCache = {};

const _measureCtx = document.createElement('canvas').getContext('2d');

const measureItemSubstring = (item, relStart, relEnd) => {
    if (relStart === 0 && relEnd >= item.str.length) {
        return { xStart: item.cssLeft, xWidth: item.cssWidth };
    }
    _measureCtx.font = `${item.cssHeight}px sans-serif`;
    const totalW = _measureCtx.measureText(item.str).width;
    if (!totalW) {
        const frac = item.str.length > 0 ? 1 / item.str.length : 0;
        return {
            xStart: item.cssLeft + relStart * frac * item.cssWidth,
            xWidth: (relEnd - relStart) * frac * item.cssWidth,
        };
    }
    const ratio = item.cssWidth / totalW;
    const prefixW = relStart > 0 ? _measureCtx.measureText(item.str.slice(0, relStart)).width : 0;
    const matchW = _measureCtx.measureText(item.str.slice(relStart, relEnd)).width;
    return { xStart: item.cssLeft + prefixW * ratio, xWidth: matchW * ratio };
};

const clearPageTextCache = () => {
    Object.keys(pageTextCache).forEach(k => delete pageTextCache[k]);
};

const getPageTextCached = async (pageIndex) => {
    if (pageTextCache[pageIndex]) return pageTextCache[pageIndex];
    const page = await pdfDoc.getPage(pageIndex);
    const viewport = page.getViewport({ scale });
    const textContent = await page.getTextContent();
    let text = '';
    const items = [];
    textContent.items.forEach(item => {
        if (!item.str || !item.str.trim()) return;
        const tx = item.transform;
        const fontHeight = Math.abs(tx[3]);
        if (fontHeight === 0 || item.width === 0) return;
        const vt = viewport.transform;
        const cssLeft = vt[0] * tx[4] + vt[2] * tx[5] + vt[4];
        const cssBaseline = vt[1] * tx[4] + vt[3] * tx[5] + vt[5];
        const cssHeight = fontHeight * Math.abs(vt[3]);
        items.push({
            start: text.length,
            str: item.str,
            cssLeft,
            cssTop: cssBaseline - cssHeight,
            cssWidth: item.width * Math.abs(vt[0]),
            cssHeight,
        });
        text += item.str;
    });
    return (pageTextCache[pageIndex] = { text, items });
};

const clearSearchHighlights = () => {
    if (!textLayerDiv) return;
    textLayerDiv.querySelectorAll('mark.search-highlight').forEach(m => m.remove());
};

const applySearchHighlights = async () => {
    if (!activeSearchTerm || searchMatches.length === 0 || !pdfDoc) return;

    await ensureTextLayer();
    clearSearchHighlights();

    const cache = await getPageTextCached(pageNum);
    const { text, items } = cache;
    const lowerTerm = activeSearchTerm.toLowerCase();
    const lowerText = text.toLowerCase();

    const pageMatchOffsets = [];
    let idx = 0;
    while ((idx = lowerText.indexOf(lowerTerm, idx)) !== -1) {
        pageMatchOffsets.push(idx);
        idx++;
    }
    if (pageMatchOffsets.length === 0) return;

    const globalOffset = searchMatches.filter(m => m.page < pageNum).length;

    items.forEach((item) => {
        const itemEnd = item.start + item.str.length;
        const overlapping = pageMatchOffsets
            .map((matchStart, mi) => ({
                matchStart,
                matchEnd: matchStart + activeSearchTerm.length,
                globalIdx: globalOffset + mi,
            }))
            .filter(({ matchStart, matchEnd }) => matchStart < itemEnd && matchEnd > item.start);

        if (overlapping.length === 0) return;

        overlapping.forEach(({ matchStart, matchEnd, globalIdx }) => {
            const relStart = Math.max(0, matchStart - item.start);
            const relEnd = Math.min(item.str.length, matchEnd - item.start);
            const { xStart, xWidth } = measureItemSubstring(item, relStart, relEnd);

            const mark = document.createElement('mark');
            mark.className = 'search-highlight' + (globalIdx === currentMatchIdx ? ' current' : '');
            mark.style.position = 'absolute';
            mark.style.left = xStart + 'px';
            mark.style.top = item.cssTop + 'px';
            mark.style.width = xWidth + 'px';
            mark.style.height = item.cssHeight + 'px';
            textLayerDiv.appendChild(mark);
        });
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

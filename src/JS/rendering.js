// --- PDF Font Detection & Text Item Cache ---
let detectedPdfFonts = new Map(); // cssName -> displayName
let cachedTextItems = []; // {x, y, fontName, fontSize} in canvas coords

const cachePageTextItems = async (page, viewport) => {
    try {
        const textContent = await page.getTextContent();
        cachedTextItems = textContent.items
            .filter(item => item.str && item.str.trim())
            .map(item => {
                const tx = item.transform;
                const fontHeight = Math.abs(tx[3]);
                const cx = tx[4] * scale;
                const cy = viewport.height - tx[5] * scale;
                // Sample pixel color from the rendered PDF canvas (physical pixels = CSS coords * dpr)
                const dpr = window.devicePixelRatio || 1;
                const sampleY = cy - (fontHeight * scale * 0.5);
                let color = '#000000';
                try {
                    const pixel = ctx.getImageData(Math.round((cx + 2) * dpr), Math.round(sampleY * dpr), 1, 1).data;
                    if (pixel[3] > 30) { // skip transparent/white
                        const r = pixel[0], g = pixel[1], b = pixel[2];
                        // Skip near-white (background)
                        if (r < 240 || g < 240 || b < 240) {
                            color = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
                        }
                    }
                } catch (_) {}
                return {
                    x: cx,
                    y: cy,
                    fontName: item.fontName,
                    fontSize: Math.round(fontHeight * scale),
                    color,
                };
            })
            .filter(item => item.fontSize > 0);
    } catch (_) {
        cachedTextItems = [];
    }
};

const findNearestTextStyle = (x, y) => {
    if (cachedTextItems.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const item of cachedTextItems) {
        const dist = Math.hypot(item.x - x, item.y - y);
        if (dist < bestDist) {
            bestDist = dist;
            best = item;
        }
    }
    return best;
};

const updatePdfFontDropdown = () => {
    const select = document.getElementById('font-family');
    if (!select) return;

    select.querySelectorAll('option[data-pdf-font], optgroup[data-pdf-group]').forEach(el => el.remove());

    if (detectedPdfFonts.size === 0) return;

    const group = document.createElement('optgroup');
    group.label = 'PDF Fonts';
    group.dataset.pdfGroup = '1';

    detectedPdfFonts.forEach((displayName, cssName) => {
        const opt = document.createElement('option');
        opt.value = cssName;
        opt.textContent = displayName;
        opt.dataset.pdfFont = '1';
        group.appendChild(opt);
    });

    select.appendChild(group);
};

const extractPdfFonts = async (page) => {
    try {
        const textContent = await page.getTextContent();
        const fontIds = [...new Set(textContent.items.map(i => i.fontName).filter(Boolean))];
        if (fontIds.length === 0) return;

        const newFonts = new Map();
        for (const id of fontIds) {
            let displayName = id;
            // Try to get human-readable name from commonObjs
            try {
                const fontObj = page.commonObjs.get(id);
                if (fontObj && fontObj.name) {
                    // Strip subset prefix like "ABCDEF+"
                    displayName = fontObj.name.replace(/^[A-Z]{6}\+/, '');
                }
            } catch (_) {}
            newFonts.set(id, displayName);
        }

        // Only update dropdown if fonts changed
        const changed = newFonts.size !== detectedPdfFonts.size ||
            [...newFonts.keys()].some(k => !detectedPdfFonts.has(k));
        if (changed) {
            detectedPdfFonts = newFonts;
            updatePdfFontDropdown();
        }
    } catch (_) {}
};

// --- PDF rendering ---
const renderPage = num => {
    pageIsRendering = true;

    pdfDoc.getPage(num).then(page => {
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = (viewport.width / dpr) + 'px';
        canvas.style.height = (viewport.height / dpr) + 'px';

        page.render({ canvasContext: ctx, viewport }).promise.then(() => {
            pageIsRendering = false;

            // Resize fabric canvas to match CSS display size (not physical pixels)
            const cssWidth = viewport.width / dpr;
            const cssHeight = viewport.height / dpr;
            fabricCanvas.setWidth(cssWidth);
            fabricCanvas.setHeight(cssHeight);
            fabricCanvas.clear();

            // Reset text layer on page change
            textLayerDiv.innerHTML = '';

            // Restore saved annotations for this page
            pageDimensions[num] = { width: cssWidth, height: cssHeight };
            if (pageAnnotations[num]) {
                fabricCanvas.loadFromJSON(pageAnnotations[num], () => fabricCanvas.renderAll());
            }

            // Extract fonts and cache text items for nearest-font detection
            // Use CSS-scale viewport so coordinates match Fabric.js canvas coords
            const cssViewport = page.getViewport({ scale });
            extractPdfFonts(page);
            cachePageTextItems(page, cssViewport);

            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
            } else if (typeof onPageRenderComplete === 'function') {
                onPageRenderComplete(num);
            }
        });

        document.querySelector('#page-num').textContent = num;
    });
};

const queueRenderPage = num => {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderPage(num);
    }
};

const showPrevPage = () => {
    if (pageNum <= 1) return;
    pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);
    pageNum--;
    queueRenderPage(pageNum);
    updateSidebarActive();
};

const showNextPage = () => {
    if (pageNum >= pdfDoc.numPages) return;
    pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);
    pageNum++;
    queueRenderPage(pageNum);
    updateSidebarActive();
};

const showError = message => {
    if (errorDiv) errorDiv.textContent = message;
};

const clearError = () => {
    if (errorDiv) errorDiv.textContent = '';
};
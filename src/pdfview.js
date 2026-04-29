pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const defaultUrl = 'pdf.pdf';

let pdfDoc = null,
    pageNum = 1,
    pageIsRendering = false,
    pageNumIsPending = null;

const scale = 1.5,
    canvas = document.querySelector('#pdf-render'),
    ctx = canvas.getContext('2d'),
    fileInput = document.querySelector('#file-input'),
    errorDiv = document.querySelector('#file-error');

// Store original PDF bytes for download
let originalPdfBytes = null;

// Per-page fabric annotation storage
const pageAnnotations = {};
const pageDimensions = {};

// Initialize fabric canvas
const fabricCanvas = new fabric.Canvas('fabric-canvas', {
    isDrawingMode: false,
    selection: true,
});

// Undo history
const undoStack = [];
const saveHistory = () => {
    undoStack.push(JSON.stringify(fabricCanvas.toJSON()));
    if (undoStack.length > 50) undoStack.shift();
};

fabricCanvas.on('object:added', saveHistory);
fabricCanvas.on('object:modified', saveHistory);
fabricCanvas.on('object:removed', saveHistory);

// Eraser: use destination-out so strokes reveal the PDF underneath
fabricCanvas.on('path:created', (e) => {
    if (currentTool === 'eraser') {
        e.path.set({ globalCompositeOperation: 'destination-out' });
        fabricCanvas.renderAll();
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (undoStack.length <= 1) {
            fabricCanvas.clear();
            undoStack.length = 0;
            return;
        }
        undoStack.pop();
        const prev = undoStack[undoStack.length - 1];
        fabricCanvas.loadFromJSON(prev, () => fabricCanvas.renderAll());
    }
});

// Position the fabric wrapper div directly over the PDF canvas
const fabricWrapper = fabricCanvas.wrapperEl;
fabricWrapper.style.position = 'absolute';
fabricWrapper.style.top = '0';
fabricWrapper.style.left = '0';

let currentTool = 'select';

// Font/size controls for text tool
const textControls = document.getElementById('text-controls');
const fontFamilySelect = document.getElementById('font-family');
const fontSizeInput = document.getElementById('font-size');

const getTextProps = () => ({
    fontFamily: fontFamilySelect.value,
    fontSize: parseInt(fontSizeInput.value) || 20,
    fill: document.getElementById('color-picker').value,
});

fontFamilySelect.addEventListener('change', () => {
    const obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        obj.set('fontFamily', fontFamilySelect.value);
        fabricCanvas.renderAll();
    }
});

fontSizeInput.addEventListener('input', () => {
    const obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        obj.set('fontSize', parseInt(fontSizeInput.value) || 20);
        fabricCanvas.renderAll();
    }
});

// Sync font controls when a text object is selected
fabricCanvas.on('selection:created', (e) => {
    const obj = e.selected?.[0];
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        fontFamilySelect.value = obj.fontFamily || 'Arial';
        fontSizeInput.value = obj.fontSize || 20;
    }
});

fabricCanvas.on('selection:updated', (e) => {
    const obj = e.selected?.[0];
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        fontFamilySelect.value = obj.fontFamily || 'Arial';
        fontSizeInput.value = obj.fontSize || 20;
    }
});

// Text layer for highlight mode
const textLayerDiv = document.getElementById('text-layer');

const ensureTextLayer = async () => {
    if (textLayerDiv.children.length > 0) return;
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const textContent = await page.getTextContent();

    textLayerDiv.innerHTML = '';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';

    textContent.items.forEach(item => {
        if (!item.str || !item.str.trim()) return;
        const tx = item.transform;
        const fontHeight = Math.abs(tx[3]);
        if (fontHeight === 0 || item.width === 0) return;

        // Convert PDF coordinates (bottom-left origin) to CSS coordinates (top-left origin)
        const cssLeft = tx[4] * scale;
        const cssTop = viewport.height - tx[5] * scale - fontHeight * scale;

        const span = document.createElement('span');
        span.textContent = item.str;
        span.style.left = cssLeft + 'px';
        span.style.top = cssTop + 'px';
        span.style.width = (item.width * scale) + 'px';
        span.style.height = (fontHeight * scale) + 'px';
        span.style.fontSize = (fontHeight * scale) + 'px';
        textLayerDiv.appendChild(span);
    });
};

// --- Tool switching ---
const setTool = (tool) => {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`)?.classList.add('active');
    textControls.classList.toggle('visible', tool === 'text');

    const color = document.getElementById('color-picker').value;
    const size = parseInt(document.getElementById('brush-size').value);

    // Clear text layer when leaving highlight mode
    if (tool !== 'highlight') {
        textLayerDiv.classList.remove('highlight-active');
        textLayerDiv.innerHTML = '';
        fabricCanvas.selection = true;
    }

    if (tool === 'draw') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush.color = color;
        fabricCanvas.freeDrawingBrush.width = size;
    } else if (tool === 'eraser') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush.color = 'rgba(0,0,0,1)';
        fabricCanvas.freeDrawingBrush.width = size * 3;
    } else if (tool === 'highlight') {
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = false;
        document.getElementById('color-picker').value = '#ffff00';
        textLayerDiv.classList.add('highlight-active');
        ensureTextLayer();
    } else {
        fabricCanvas.isDrawingMode = false;
    }
};

document.getElementById('tool-select').addEventListener('click', () => setTool('select'));
document.getElementById('tool-draw').addEventListener('click', () => setTool('draw'));
document.getElementById('tool-eraser').addEventListener('click', () => setTool('eraser'));
document.getElementById('tool-highlight').addEventListener('click', () => setTool('highlight'));
document.getElementById('tool-delete').addEventListener('click', () => {
    const active = fabricCanvas.getActiveObjects();
    active.forEach(obj => fabricCanvas.remove(obj));
    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();
});

// Add text on canvas click
document.getElementById('tool-text').addEventListener('click', () => setTool('text'));
fabricCanvas.on('mouse:down', (e) => {
    if (currentTool !== 'text') return;
    if (e.target) return; // Ignore clicks on existing objects

    const pointer = fabricCanvas.getPointer(e.e);
    const { fontFamily, fontSize, fill } = getTextProps();
    const text = new fabric.IText('Type here', {
        left: pointer.x,
        top: pointer.y,
        fontSize,
        fill,
        fontFamily,
    });
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    text.enterEditing();
    setTool('select');
});

// Highlight: apply highlight on mouse up after text selection
const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};

const rectsOverlap = (a, b) =>
    !(b.x > a.x + a.width || b.x + b.width < a.x ||
        b.y > a.y + a.height || b.y + b.height < a.y);

textLayerDiv.addEventListener('mouseup', () => {
    if (currentTool !== 'highlight') return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    selection.removeAllRanges();
    if (rects.length === 0) return;

    const canvasBounds = canvas.getBoundingClientRect();
    const color = document.getElementById('color-picker').value;

    const selRects = rects
        .filter(r => r.width > 1)
        .map(r => ({
            x: r.left - canvasBounds.left,
            y: r.top - canvasBounds.top,
            width: r.width,
            height: r.height,
        }));

    if (selRects.length === 0) return;

    // Find existing highlights that overlap with the selection
    const existing = fabricCanvas.getObjects().filter(
        obj => obj.data && obj.data.type === 'highlight'
    );
    const toRemove = existing.filter(obj =>
        selRects.some(sr => rectsOverlap(sr, {
            x: obj.left, y: obj.top, width: obj.width, height: obj.height,
        }))
    );

    if (toRemove.length > 0) {
        // Overlaps existing highlight — remove it
        toRemove.forEach(obj => fabricCanvas.remove(obj));
    } else {
        // No overlap — add new highlight
        selRects.forEach(sr => {
            fabricCanvas.add(new fabric.Rect({
                left: sr.x,
                top: sr.y,
                width: sr.width,
                height: sr.height,
                fill: hexToRgba(color, 0.4),
                selectable: true,
                evented: true,
                data: { type: 'highlight' },
            }));
        });
    }

    fabricCanvas.renderAll();
});

// Color and brush size change
document.getElementById('color-picker').addEventListener('input', (e) => {
    if (fabricCanvas.isDrawingMode && currentTool === 'draw') {
        fabricCanvas.freeDrawingBrush.color = e.target.value;
    }
    const active = fabricCanvas.getActiveObject();
    if (active) {
        active.set('fill', e.target.value);
        if (active.stroke) active.set('stroke', e.target.value);
        fabricCanvas.renderAll();
    }
});

document.getElementById('brush-size').addEventListener('input', (e) => {
    if (fabricCanvas.isDrawingMode) {
        fabricCanvas.freeDrawingBrush.width = parseInt(e.target.value);
    }
});

// --- Sidebar thumbnails ---
const THUMB_SCALE = 0.25;

const updateSidebarActive = () => {
    document.querySelectorAll('.sidebar-thumb').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.page) === pageNum);
    });
    const active = document.querySelector('.sidebar-thumb.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

const renderSidebar = async () => {
    const container = document.getElementById('sidebar-thumbnails');
    container.innerHTML = '';
    if (!pdfDoc) return;

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'sidebar-thumb' + (i === pageNum ? ' active' : '');
        wrapper.dataset.page = i;

        const img = document.createElement('img');
        img.alt = `Page ${i}`;

        const label = document.createElement('span');
        label.textContent = i;

        wrapper.appendChild(img);
        wrapper.appendChild(label);
        wrapper.addEventListener('click', () => goToPage(parseInt(wrapper.dataset.page)));
        container.appendChild(wrapper);

        // Render thumbnail asynchronously
        (async (pageIndex, imgEl) => {
            const page = await pdfDoc.getPage(pageIndex);
            const vp = page.getViewport({ scale: THUMB_SCALE });
            const tc = document.createElement('canvas');
            tc.width = vp.width;
            tc.height = vp.height;
            await page.render({ canvasContext: tc.getContext('2d'), viewport: vp }).promise;
            imgEl.src = tc.toDataURL();
        })(i, img);
    }
};

const goToPage = (num) => {
    if (!pdfDoc || num < 1 || num > pdfDoc.numPages || num === pageNum) return;
    pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);
    pageNum = num;
    queueRenderPage(pageNum);
    updateSidebarActive();
};

// --- PDF rendering ---
const renderPage = num => {
    pageIsRendering = true;

    pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        page.render({ canvasContext: ctx, viewport }).promise.then(() => {
            pageIsRendering = false;

            // Resize fabric canvas to match the PDF page
            fabricCanvas.setWidth(viewport.width);
            fabricCanvas.setHeight(viewport.height);
            fabricCanvas.clear();

            // Reset text layer on page change
            textLayerDiv.innerHTML = '';

            // Restore saved annotations for this page
            pageDimensions[num] = { width: viewport.width, height: viewport.height };
            if (pageAnnotations[num]) {
                fabricCanvas.loadFromJSON(pageAnnotations[num], () => fabricCanvas.renderAll());
            }

            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
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
    errorDiv.textContent = message;
    document.querySelector('.top-bar').style.display = 'none';
};

const clearError = () => {
    errorDiv.textContent = '';
    document.querySelector('.top-bar').style.display = 'flex';
};

const loadPdfDocument = async (source) => {
    clearError();
    try {
        let docSource = source;
        if (typeof source === 'string') {
            const res = await fetch(source);
            originalPdfBytes = await res.arrayBuffer();
            docSource = { data: originalPdfBytes.slice(0) };
        } else if (source.data) {
            originalPdfBytes = source.data;
            docSource = { data: new Uint8Array(originalPdfBytes) };
        }

        const doc = await pdfjsLib.getDocument(docSource).promise;
        pdfDoc = doc;
        document.querySelector('#page-count').textContent = pdfDoc.numPages;
        pageNum = 1;
        Object.keys(pageAnnotations).forEach(k => delete pageAnnotations[k]);
        renderPage(pageNum);
        renderSidebar();
    } catch (err) {
        showError('Failed to load PDF: ' + err.message);
    }
};

// --- Delete current page ---
document.getElementById('delete-page-btn').addEventListener('click', async () => {
    if (!originalPdfBytes) return;
    if (pdfDoc.numPages === 1) {
        alert('Cannot delete the only page.');
        return;
    }
    if (!confirm(`Delete page ${pageNum}?`)) return;

    const { PDFDocument } = PDFLib;
    const pdfLibDoc = await PDFDocument.load(originalPdfBytes);
    pdfLibDoc.removePage(pageNum - 1);

    const savedBytes = await pdfLibDoc.save();
    originalPdfBytes = savedBytes.buffer;

    Object.keys(pageAnnotations).forEach(k => delete pageAnnotations[k]);
    const targetPage = Math.min(pageNum, pdfLibDoc.getPageCount());
    pageNum = targetPage;

    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(savedBytes) }).promise;
    pdfDoc = doc;
    document.querySelector('#page-count').textContent = pdfDoc.numPages;
    renderPage(pageNum);
    renderSidebar();
});

// --- Download ---
document.getElementById('download-btn').addEventListener('click', async () => {
    if (!originalPdfBytes) return;

    // Save current page annotations before download
    pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);

    const { PDFDocument } = PDFLib;
    const pdfLibDoc = await PDFDocument.load(originalPdfBytes);
    const pages = pdfLibDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
        const pNum = i + 1;
        const annotation = pageAnnotations[pNum];
        if (!annotation || !annotation.objects || annotation.objects.length === 0) continue;

        const dim = pageDimensions[pNum];
        if (!dim) continue;

        // Render annotations to PNG using a temporary StaticCanvas
        const tempCanvas = new fabric.StaticCanvas(null, { width: dim.width, height: dim.height });
        await new Promise(resolve => tempCanvas.loadFromJSON(annotation, resolve));
        tempCanvas.renderAll();

        const pngDataUrl = tempCanvas.toDataURL({ format: 'png' });
        const base64 = pngDataUrl.split(',')[1];
        const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

        const pngImage = await pdfLibDoc.embedPng(pngBytes);
        const page = pages[i];
        const { width, height } = page.getSize();
        page.drawImage(pngImage, { x: 0, y: 0, width, height });
    }

    const savedBytes = await pdfLibDoc.save();
    const blob = new Blob([savedBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edited.pdf';
    a.click();
    URL.revokeObjectURL(url);
});

// --- File upload ---
const validatePdfFile = async file => {
    if (!file) return 'Please select a PDF file.';
    if (file.type !== 'application/pdf') return 'Please select a PDF file.';
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46) {
        return 'The selected file is not a PDF.';
    }
    return null;
};

fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    const validationError = await validatePdfFile(file);
    if (validationError) {
        showError(validationError);
        return;
    }
    const arrayBuffer = await file.arrayBuffer();
    loadPdfDocument({ data: arrayBuffer });
});

// Button events
document.querySelector('#prev-page').addEventListener('click', showPrevPage);
document.querySelector('#next-page').addEventListener('click', showNextPage);

// Load default PDF
loadPdfDocument(defaultUrl);

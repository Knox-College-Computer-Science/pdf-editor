// this function is what make eraser work!
// i tried to move it to Tool.js but it seems to break the eraser, maybe because of the order of script loading or something, so i left it here for now
(function() {
    if (typeof fabric === 'undefined') return;

    fabric.EraserBrush = fabric.util.createClass(fabric.PencilBrush, {
        type: 'eraser',
        // This handles the "live" drawing look
        _setBrushStyles: function(ctx) {
            this.callSuper('_setBrushStyles', ctx);
            ctx.globalCompositeOperation = 'destination-out';
        },
        // This ensures the path being drawn is subtracting pixels
        _render: function() {
            var ctx = this.canvas.contextTop;
            ctx.globalCompositeOperation = 'destination-out';
            this.callSuper('_render');
            ctx.globalCompositeOperation = 'source-over';
        },
        // This ensures the final object created is an "eraser" path
        createPath: function(pathData) {
            var path = this.callSuper('createPath', pathData);
            path.globalCompositeOperation = 'destination-out';
            return path;
        }
    });
})();
// tbh i dont know what this truly does but ima leave it 
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

// Stores the raw bytes of the currently loaded PDF for download and editing
let originalPdfBytes = null;

// Per-page fabric annotation storage, keyed by page number
const pageAnnotations = {};
const pageDimensions = {};

// Initialize the fabric canvas for annotations
const fabricCanvas = new fabric.Canvas('fabric-canvas', {
    isDrawingMode: false,
    selection: true,
    backgroundColor: 'rgba(0,0,0,0)'
});
// Ensure eraser paths use destination-out so they cut through annotations
fabricCanvas.on('path:created', function(e) {
    if (currentTool === 'eraser') {
        const path = e.path;
        path.set({
            globalCompositeOperation: 'destination-out',
            selectable: false,
            evented: false,
            stroke: 'black',
            fill: null
        });
        fabricCanvas.bringToFront(path);
        fabricCanvas.renderAll();
    }
});
// Initialize undo/redo stack defined in Undo.js
if (typeof initUndo === 'function') {
    initUndo(fabricCanvas);
}

// Position the fabric wrapper div directly over the PDF canvas
const fabricWrapper = fabricCanvas.wrapperEl;
fabricWrapper.style.position = 'absolute';
fabricWrapper.style.top = '0';
fabricWrapper.style.left = '0';

// Text layer used for highlight mode
const textLayerDiv = document.getElementById('text-layer');


// The tool implementation has been moved to Tool.js for cleaner separation.
// Tool.js now handles tool switching, drawing, text insertion, highlight behavior,
// eraser behavior, color changes, and brush size updates.

// Note: Tool.js initializes its event listeners after the DOM is ready.

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

            // Resize fabric canvas to match the rendered PDF page
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

// --- Delete page ---
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
    pageNum = Math.min(pageNum, pdfLibDoc.getPageCount());

    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(savedBytes) }).promise;
    pdfDoc = doc;
    document.querySelector('#page-count').textContent = pdfDoc.numPages;
    renderPage(pageNum);
    renderSidebar();
});

// --- Download ---
document.getElementById('download-btn').addEventListener('click', async () => {
    if (!originalPdfBytes) return;

    // Save current page annotations before building the output PDF
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

        // Render annotations to a temporary StaticCanvas and export as PNG
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

// --- Insert PDF ---
document.getElementById('insert-pdf-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const validationError = await validatePdfFile(file);
    if (validationError) {
        showError(validationError);
        return;
    }
    if (!originalPdfBytes) {
        showError('Please open a PDF first before inserting.');
        return;
    }

    const { PDFDocument } = PDFLib;
    const [baseDoc, insertDoc] = await Promise.all([
        PDFDocument.load(originalPdfBytes),
        PDFDocument.load(await file.arrayBuffer()),
    ]);

    const copiedPages = await baseDoc.copyPages(insertDoc, insertDoc.getPageIndices());
    copiedPages.forEach(page => baseDoc.addPage(page));

    const mergedBytes = await baseDoc.save();
    originalPdfBytes = mergedBytes.buffer;

    Object.keys(pageAnnotations).forEach(k => delete pageAnnotations[k]);

    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(mergedBytes) }).promise;
    pdfDoc = doc;
    document.querySelector('#page-count').textContent = pdfDoc.numPages;
    renderPage(pageNum);
    renderSidebar();
});

// Button events
document.querySelector('#prev-page').addEventListener('click', showPrevPage);
document.querySelector('#next-page').addEventListener('click', showNextPage);

// Load the default PDF on startup
loadPdfDocument(defaultUrl);


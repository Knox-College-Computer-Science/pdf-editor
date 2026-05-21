// this function is what make eraser work!
// i tried to move it to Tool.js but it seems to break the eraser, maybe because of the order of script loading or something, so i left it here for now
(function() {
    if (typeof fabric === 'undefined') return;

    fabric.EraserBrush = fabric.util.createClass(fabric.PencilBrush, {
        type: 'eraser',
        // This handles the "live" drawing look
        _setBrushStyles: function(ctx) {
            this.callSuper('_setBrushStyles', ctx);
            //ctx.globalCompositeOperation = 'destination-out';
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
//i think this line is important but tbh i got no clue
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const showEditor = () => {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('editor').classList.remove('hidden');
};

const showLanding = () => {
    document.getElementById('editor').classList.add('hidden');
    document.getElementById('landing').classList.remove('hidden');
};

let pdfDoc = null,
    pageNum = 1,
    pageIsRendering = false,
    pageNumIsPending = null;

const scale = 1.5;
let canvas, ctx, fileInput, errorDiv;

const savePdfBlob = async (blob, defaultName) => {
    if (window.showSaveFilePicker) {
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: defaultName,
                types: [{ description: 'PDF ファイル', accept: { 'application/pdf': ['.pdf'] } }]
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
        } catch (err) {
            if (err.name !== 'AbortError') throw err;
        }
    } else {
        let filename = prompt('ファイル名を入力してください:', defaultName);
        if (filename === null) return;
        if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
};
// Stores the raw bytes of the currently loaded PDF for download and editing
let originalPdfBytes = null;

// Per-page fabric annotation storage, keyed by page number
const pageAnnotations = {};
const pageDimensions = {};

// fabricCanvas and textLayerDiv are initialized after the editor is shown
let fabricCanvas, textLayerDiv;

// fromPage: 1-based page being moved
// insertBefore: 1-based page to insert before (total+1 = append at end)
const reorderPages = async (fromPage, insertBefore) => {
    if (!originalPdfBytes) return;
    // No-op: inserting a page before itself or right after itself
    if (fromPage === insertBefore || fromPage === insertBefore - 1) return;
    pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);

    const { PDFDocument } = PDFLib;
    const srcDoc = await PDFDocument.load(originalPdfBytes.slice());
    const newDoc = await PDFDocument.create();
    const total = srcDoc.getPageCount();

    const indices = Array.from({ length: total }, (_, i) => i);
    const fromIdx = fromPage - 1;
    indices.splice(fromIdx, 1);

    let insertIdx = insertBefore > total
        ? indices.length
        : indices.indexOf(insertBefore - 1);
    if (insertIdx === -1) insertIdx = indices.length;
    indices.splice(insertIdx, 0, fromIdx);

    const copied = await newDoc.copyPages(srcDoc, indices);
    copied.forEach(p => newDoc.addPage(p));

    originalPdfBytes = new Uint8Array(await newDoc.save());

    const newAnnotations = {};
    const newDimensions = {};
    indices.forEach((oldIdx, newIdx) => {
        if (pageAnnotations[oldIdx + 1]) newAnnotations[newIdx + 1] = pageAnnotations[oldIdx + 1];
        if (pageDimensions[oldIdx + 1]) newDimensions[newIdx + 1] = pageDimensions[oldIdx + 1];
    });
    Object.keys(pageAnnotations).forEach(k => delete pageAnnotations[k]);
    Object.keys(pageDimensions).forEach(k => delete pageDimensions[k]);
    Object.assign(pageAnnotations, newAnnotations);
    Object.assign(pageDimensions, newDimensions);

    pageNum = indices.indexOf(pageNum - 1) + 1;
    pdfDoc = await pdfjsLib.getDocument({ data: originalPdfBytes.slice() }).promise;
    document.querySelector('#page-count').textContent = pdfDoc.numPages;
    selectedPages.clear();
    updateSelectedState();
    clearPageTextCache();
    await renderPage(pageNum);
    const sidebar = document.getElementById('sidebar-thumbnails');
    const savedScroll = sidebar.scrollTop;
    await renderSidebar();
    requestAnimationFrame(() => { sidebar.scrollTop = savedScroll; });
};

const initFabricCanvas = () => {
    if (fabricCanvas) return;

    fabricCanvas = new fabric.Canvas('fabric-canvas', {
        isDrawingMode: false,
        selection: true,
        backgroundColor: 'rgba(0,0,0,0)'
    });

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

    let isErasing = false;

// 1. Delete an object immediately on click down
fabricCanvas.on('mouse:down', function(options) {
    if (currentTool === 'delete') {
        isErasing = true;
        if (options.target) {
            fabricCanvas.remove(options.target);
            fabricCanvas.renderAll();
        }
    }
});

// 2. Delete objects continuously as the mouse drags across them
fabricCanvas.on('mouse:move', function(options) {
    if (isErasing && currentTool === 'delete') {
        if (options.target) {
            fabricCanvas.remove(options.target);
            fabricCanvas.renderAll();
        }
    }
});

// 3. Stop erasing when mouse button is released
fabricCanvas.on('mouse:up', function() {
    if (currentTool === 'delete' && isErasing) {
        isErasing = false;
        saveHistory(); // Auto-saves to your undo stack!
    }
});


    if (typeof initUndo === 'function') initUndo(fabricCanvas);

    const fabricWrapper = fabricCanvas.wrapperEl;
    fabricWrapper.style.position = 'absolute';
    fabricWrapper.style.top = '0';
    fabricWrapper.style.left = '0';

    textLayerDiv = document.getElementById('text-layer');

    // Wire up Tool.js now that fabricCanvas exists
    if (typeof initTools === 'function') initTools();
};

const goToPage = (num) => {
    if (!pdfDoc || num < 1 || num > pdfDoc.numPages || num === pageNum) return;
    pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);
    pageNum = num;
    queueRenderPage(pageNum);
    updateSidebarActive();
};


const loadPdfDocument = async (source) => {
    clearError();
    try {
        let docSource = source;
        if (typeof source === 'string') {
            const res = await fetch(source);
            originalPdfBytes = new Uint8Array(await res.arrayBuffer());
            docSource = { data: originalPdfBytes.slice() };
        } else if (source.data) {
            originalPdfBytes = new Uint8Array(source.data);
            docSource = { data: originalPdfBytes.slice() };
        }

        const doc = await pdfjsLib.getDocument(docSource).promise;
        pdfDoc = doc;
        document.querySelector('#page-count').textContent = pdfDoc.numPages;
        pageNum = 1;
        Object.keys(pageAnnotations).forEach(k => delete pageAnnotations[k]);
        selectedPages.clear();
        lastClickedPage = null;
        clearPageTextCache();
        showEditor();
        initEditorElements();
        initFabricCanvas();
        renderPage(pageNum);
        renderSidebar();
    } catch (err) {
        showError('Failed to load PDF: ' + err.message);
    }
};

// --- File validation ---
const validatePdfFile = async file => {
    if (!file) return 'Please select a PDF file.';
    if (file.type !== 'application/pdf') return 'Please select a PDF file.';
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46) {
        return 'The selected file is not a PDF.';
    }
    return null;
};

// Landing page file input
document.getElementById('landing-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    const err = await validatePdfFile(file);
    if (err) {
        document.getElementById('landing-error').textContent = err;
        return;
    }
    document.getElementById('landing-error').textContent = '';
    loadPdfDocument({ data: await file.arrayBuffer() });
});

// Drag and drop on landing dropzone
const dropzone = document.getElementById('dropzone');
dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', async e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    const err = await validatePdfFile(file);
    if (err) {
        document.getElementById('landing-error').textContent = err;
        return;
    }
    document.getElementById('landing-error').textContent = '';
    loadPdfDocument({ data: await file.arrayBuffer() });
});


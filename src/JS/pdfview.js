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

// 원본 PDF 바이트 저장 (다운로드용)
let originalPdfBytes = null;

// 페이지별 fabric 어노테이션 저장
const pageAnnotations = {};
const pageDimensions = {};

// fabric canvas 초기화
const fabricCanvas = new fabric.Canvas('fabric-canvas', {
    isDrawingMode: false,
    selection: true,
    backgroundColor: 'rgba(0,0,0,0)'
});
// Add this near your fabricCanvas initialization
fabricCanvas.on('path:created', function(e) {
    if (currentTool === 'eraser') {
        const path = e.path;
        path.set({
            // This is the composite operation you wanted!
            globalCompositeOperation: 'destination-out',
            selectable: false,
            evented: false,
            stroke: 'black', // The color doesn't matter, it's now a "hole"
            fill: null
        });
        
        // Move it to the front so it erases everything beneath it
        fabricCanvas.bringToFront(path);
        fabricCanvas.renderAll();
    }
});
//this call is what makes undo work, it call the other class etc
if (typeof initUndo === 'function') {
    initUndo(fabricCanvas);
}

// fabric이 만든 wrapper div를 PDF 캔버스 위에 정확히 올림
const fabricWrapper = fabricCanvas.wrapperEl;
fabricWrapper.style.position = 'absolute';
fabricWrapper.style.top = '0';
fabricWrapper.style.left = '0';

// // Text Layer for Highlighting
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

// --- PDF 렌더링 ---
const renderPage = num => {
    pageIsRendering = true;

    pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        page.render({ canvasContext: ctx, viewport }).promise.then(() => {
            pageIsRendering = false;

            // fabric 캔버스 크기 맞추기
            fabricCanvas.setWidth(viewport.width);
            fabricCanvas.setHeight(viewport.height);
            fabricCanvas.clear();

            // ページ変更時はテキストレイヤーをリセット
            textLayerDiv.innerHTML = '';

            // 저장된 어노테이션 복원
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

// --- 페이지 삭제 ---
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

// --- 다운로드 ---
document.getElementById('download-btn').addEventListener('click', async () => {
    if (!originalPdfBytes) return;

    // 현재 페이지 어노테이션 저장
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

        // 임시 fabric StaticCanvas로 PNG 생성
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

// --- 파일 업로드 ---
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

// 버튼 이벤트
document.querySelector('#prev-page').addEventListener('click', showPrevPage);
document.querySelector('#next-page').addEventListener('click', showNextPage);

// 기본 PDF 로드
loadPdfDocument(defaultUrl);


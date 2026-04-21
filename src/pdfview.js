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
});

// undo 히스토리
const undoStack = [];
const saveHistory = () => {
    undoStack.push(JSON.stringify(fabricCanvas.toJSON()));
    if (undoStack.length > 50) undoStack.shift();
};

fabricCanvas.on('object:added', saveHistory);
fabricCanvas.on('object:modified', saveHistory);
fabricCanvas.on('object:removed', saveHistory);

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

// fabric이 만든 wrapper div를 PDF 캔버스 위에 정확히 올림
const fabricWrapper = fabricCanvas.wrapperEl;
fabricWrapper.style.position = 'absolute';
fabricWrapper.style.top = '0';
fabricWrapper.style.left = '0';

let currentTool = 'select';

// ハイライト用テキストレイヤー
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

        // PDF座標（左下原点）→ Canvas CSS座標（左上原点）
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

// --- 툴 전환 ---
const setTool = (tool) => {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`)?.classList.add('active');

    const color = document.getElementById('color-picker').value;
    const size = parseInt(document.getElementById('brush-size').value);

    // ハイライトモード解除時はテキストレイヤーをクリア
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
        fabricCanvas.freeDrawingBrush.color = 'white';
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

// 텍스트 추가: 캔버스 클릭 시
document.getElementById('tool-text').addEventListener('click', () => setTool('text'));
fabricCanvas.on('mouse:down', (e) => {
    if (currentTool !== 'text') return;
    if (e.target) return; // 기존 오브젝트 클릭 시 무시

    const pointer = fabricCanvas.getPointer(e.e);
    const text = new fabric.IText('Type here', {
        left: pointer.x,
        top: pointer.y,
        fontSize: 20,
        fill: document.getElementById('color-picker').value,
        fontFamily: 'Arial',
    });
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    text.enterEditing();
    setTool('select');
});

// ハイライト: テキスト選択をマウスアップ時に適用
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

    // 選択範囲と被っている既存ハイライトを探す
    const existing = fabricCanvas.getObjects().filter(
        obj => obj.data && obj.data.type === 'highlight'
    );
    const toRemove = existing.filter(obj =>
        selRects.some(sr => rectsOverlap(sr, {
            x: obj.left, y: obj.top, width: obj.width, height: obj.height,
        }))
    );

    if (toRemove.length > 0) {
        // 既存ハイライトと被っている → 削除
        toRemove.forEach(obj => fabricCanvas.remove(obj));
    } else {
        // 被っていない → 新規追加
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

// 색상/브러시 크기 변경
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
};

const showNextPage = () => {
    if (pageNum >= pdfDoc.numPages) return;
    pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);
    pageNum++;
    queueRenderPage(pageNum);
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
    } catch (err) {
        showError('Failed to load PDF: ' + err.message);
    }
};

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


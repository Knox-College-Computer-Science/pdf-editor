

let currentTool = 'select';

const getTextProps = () => ({
    fontFamily: document.getElementById('font-family').value,
    fontSize: parseInt(document.getElementById('font-size').value) || 20,
    fill: document.getElementById('color-picker').value,
});

const setTool = (tool) => {
    currentTool = tool;
    updateToolButtons();

    const color = document.getElementById('color-picker').value;
    const size = parseInt(document.getElementById('brush-size').value, 10) || 3;
    const textControls = document.getElementById('text-controls');
    if (textControls) textControls.classList.toggle('visible', tool === 'text');

    if (tool !== 'highlight') {
        textLayerDiv.classList.remove('highlight-active');
        textLayerDiv.innerHTML = '';
        fabricCanvas.selection = true;
    }

    if (tool === 'eraser') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.EraserBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.width = size || 30;
        fabricCanvas.freeDrawingBrush.color = 'rgb(112, 110, 110)';
    } else if (tool === 'draw') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = color;
        fabricCanvas.freeDrawingBrush.width = size;
    } else if (tool === 'highlight') {
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = false;
        document.getElementById('color-picker').value = color;
        textLayerDiv.classList.add('highlight-active');
        ensureTextLayer();
    } else if (tool === 'delete') {
        currentTool = 'delete';             // Track the active tool globally
    fabricCanvas.isDrawingMode = false; // Turn off path drawing
    fabricCanvas.selection = false;     // Turn off the blue selection box
    fabricCanvas.defaultCursor = 'pointer'; // Make cursor look like a selection link
    }
    else {
        fabricCanvas.isDrawingMode = false;
    }
};

const updateToolButtons = () => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.id === `tool-${currentTool}`));
};

const deleteSelection = () => {
    const active = fabricCanvas.getActiveObjects();
    active.forEach(obj => fabricCanvas.remove(obj));
    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();
};

const handleColorChange = (event) => {
    if (fabricCanvas.isDrawingMode && currentTool === 'draw') {
        fabricCanvas.freeDrawingBrush.color = event.target.value;
    }
    const active = fabricCanvas.getActiveObject();
    if (active) {
        active.set('fill', event.target.value);
        if (active.stroke) active.set('stroke', event.target.value);
        fabricCanvas.renderAll();
    }
};

const handleBrushSizeChange = (event) => {
    if (fabricCanvas.isDrawingMode) {
        fabricCanvas.freeDrawingBrush.width = parseInt(event.target.value, 10);
    }
};

const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};

const updateColorHotbar = (color) => {
    document.querySelectorAll('.color-swatch').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
    });
};

const applyColor = (color) => {
    const picker = document.getElementById('color-picker');
    if (!picker) return;
    picker.value = color;
    updateColorHotbar(color);
    handleColorChange({ target: picker });
};

// Check whether two rectangles overlap or touch.
const rectsOverlap = (a, b) =>
    !(b.x > a.x + a.width || b.x + b.width < a.x ||
      b.y > a.y + a.height || b.y + b.height < a.y);

// Merge adjacent or overlapping highlight rectangles into larger unified boxes.
// This reduces duplicate / stacked highlights when text selection spans multiple
// PDF text spans that are rendered as separate DOM rects.
const mergeRectangles = (rects) => {
    if (rects.length === 0) return [];

    const sorted = rects.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const merged = [Object.assign({}, sorted[0])];

    for (let i = 1; i < sorted.length; i++) {
        const rect = sorted[i];
        const last = merged[merged.length - 1];

        // Allow a small gap tolerance so adjacent text boxes on the same line
        // are merged instead of generating separate highlight rectangles.
        const overlapY = rect.y <= last.y + last.height + 2;
        const overlapX = rect.x <= last.x + last.width + 2 && last.x <= rect.x + rect.width + 2;

        if (overlapY && overlapX) {
            const x1 = Math.min(last.x, rect.x);
            const y1 = Math.min(last.y, rect.y);
            const x2 = Math.max(last.x + last.width, rect.x + rect.width);
            const y2 = Math.max(last.y + last.height, rect.y + rect.height);
            last.x = x1;
            last.y = y1;
            last.width = x2 - x1;
            last.height = y2 - y1;
        } else {
            merged.push(Object.assign({}, rect));
        }
    }

    return merged;
};

const handlePathCreated = (e) => {
    if (currentTool !== 'eraser') return;
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
};

const handleCanvasMouseDown = (e) => {
    if (currentTool !== 'text' || e.target) return;
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
    text.selectAll(); // Select the placeholder so typing replaces it immediately
    setTool('select');
};

const handleFontFamilyChange = () => {
    const obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        obj.set('fontFamily', document.getElementById('font-family').value);
        fabricCanvas.renderAll();
    }
};

const handleFontSizeChange = () => {
    const obj = fabricCanvas.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        obj.set('fontSize', parseInt(document.getElementById('font-size').value) || 20);
        fabricCanvas.renderAll();
    }
};

const syncFontControls = (e) => {
    const obj = e.selected?.[0];
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
        document.getElementById('font-family').value = obj.fontFamily || 'Arial';
        document.getElementById('font-size').value = obj.fontSize || 20;
    }
};

const handleTextLayerHighlight = () => {
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

    const mergedRects = mergeRectangles(selRects);
    if (mergedRects.length === 0) return;

    const existing = fabricCanvas.getObjects().filter(
        obj => obj.data && obj.data.type === 'highlight'
    );
    const toRemove = existing.filter(obj =>
        mergedRects.some(sr => rectsOverlap(sr, {
            x: obj.left, y: obj.top, width: obj.width, height: obj.height,
        }))
    );

    if (toRemove.length > 0) {
        toRemove.forEach(obj => fabricCanvas.remove(obj));
    } else {
        mergedRects.forEach(sr => {
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
};

const initTools = () => {
    updateToolButtons();
    document.querySelector('#tool-select').addEventListener('click', () => setTool('select'));
    document.querySelector('#tool-text').addEventListener('click', () => setTool('text'));
    document.querySelector('#tool-draw').addEventListener('click', () => setTool('draw'));
    document.querySelector('#tool-eraser').addEventListener('click', () => setTool('eraser'));
    document.querySelector('#tool-highlight').addEventListener('click', () => setTool('highlight'));
    document.querySelector('#tool-delete').addEventListener('click', () => setTool('delete'));
    document.querySelector('#tool-search').addEventListener('click', openSearchBar);
    document.querySelector('#color-picker').addEventListener('input', handleColorChange);
    document.querySelectorAll('.color-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
            const currentColor = document.getElementById('color-picker').value;
            if (btn.dataset.color) {
                applyColor(btn.dataset.color);
            } else {
                btn.dataset.color = currentColor;
                btn.style.background = currentColor;
                btn.classList.remove('assignable');
                btn.title = `Saved ${currentColor}`;
                applyColor(currentColor);
            }
        });
    });
    document.querySelector('#color-picker').addEventListener('input', (event) => {
        handleColorChange(event);
        updateColorHotbar(event.target.value);
    });
    document.querySelector('#brush-size').addEventListener('input', handleBrushSizeChange);

    fabricCanvas.on('path:created', handlePathCreated);
    fabricCanvas.on('mouse:down', handleCanvasMouseDown);
    fabricCanvas.on('selection:created', syncFontControls);
    fabricCanvas.on('selection:updated', syncFontControls);
    textLayerDiv.addEventListener('mouseup', handleTextLayerHighlight);

    document.getElementById('font-family').addEventListener('change', handleFontFamilyChange);
    document.getElementById('font-size').addEventListener('input', handleFontSizeChange);
};

window.addEventListener('DOMContentLoaded', () => {
    if (typeof fabricCanvas === 'undefined' || !document.querySelector('#tool-select')) {
        return;
    }
    initTools();
});

// Text Layer for Highlighting
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



let currentTool = 'select';

const getTextProps = () => ({
    fontFamily: document.getElementById('font-family').value,
    fontSize: parseInt(document.getElementById('font-size').value) || 20,
    fill: document.getElementById('color-picker').value,
});
//the buttons that make up the tool bar
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
// not being used anymore, but keeping it in case we want to use it again
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
// makes the empty buttons into a color
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
  // Safety check: If there are no rectangles selected, return an empty array immediately
    if (rects.length === 0) return [];

    // Create a shallow copy of the incoming rectangles.
    // This protects the original selection objects from being directly mutated during the merge process.
    let result = rects.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
    
    // Track whether any merge occurred during a pass. 
    // If we merge rectangles, we need to restart the scan because the array shape changed.
    let mergedSomething;

    do {
        // Assume no merges will happen in this loop pass
        mergedSomething = false;

        // Loop through every rectangle in the array
        for (let i = 0; i < result.length; i++) {
            // Compare the current rectangle (r1) with every subsequent rectangle (r2)
            for (let j = i + 1; j < result.length; j++) {
                const r1 = result[i];
                const r2 = result[j];

                // --- 1. VERTICAL LINE CHECK ---
                // Calculate the exact vertical center point of both rectangles.
                // This is much more reliable than checking top/bottom edges, which fluctuate due to font sizes.
                const centerY1 = r1.y + r1.height / 2;
                const centerY2 = r2.y + r2.height / 2;
                
                // Set a dynamic threshold: centers can only deviate by up to 50% of the smaller box's height.
                // This allows bullets and text to match, but completely blocks separate lines of text from merging.
                const maxCenterDistance = Math.min(r1.height, r2.height) * 0.5;
                const isSameLine = Math.abs(centerY1 - centerY2) < maxCenterDistance;

                // --- 2. HORIZONTAL PROXIMITY CHECK ---
                // We allow an 8px horizontal gap (toleranceX). 
                // This bridges the invisible gap between a bullet point element (•) and the first word of the text.
                const toleranceX = 8; 
                const isAdjacentX = (r1.x <= r2.x + r2.width + toleranceX) && (r2.x <= r1.x + r1.width + toleranceX);

                // --- 3. THE MERGE CONDITION ---
                // Only merge the two rectangles if they are confirmed to be on the SAME line AND close horizontally.
                if (isSameLine && isAdjacentX) {
                    
                    // Calculate the new boundaries for a single, unified bounding box that encloses both r1 and r2
                    const x1 = Math.min(r1.x, r2.x);
                    const y1 = Math.min(r1.y, r2.y);
                    const x2 = Math.max(r1.x + r1.width, r2.x + r2.width);
                    const y2 = Math.max(r1.y + r1.height, r2.y + r2.height);

                    // Update r1 in place to become this new expanded bounding box
                    r1.x = x1;
                    r1.y = y1;
                    r1.width = x2 - x1;
                    r1.height = y2 - y1;

                    // Remove r2 from the array since its space has now been completely absorbed by r1
                    result.splice(j, 1);

                    // Flag that a merge happened, which tells the outer loop it needs to run another pass
                    mergedSomething = true;
                    
                    // Break out of the inner loop early to restart scanning with our updated array
                    break;
                }
            }
            // If a merge happened, break out of the middle loop to reset the cycle
            if (mergedSomething) break;
        }
    // Keep repeating the entire scan until we loop through all rectangles without merging anything
} while (mergedSomething);

    // Sort the final merged rectangles strictly from top-to-bottom, left-to-right.
    // This ensures Fabric.js renders them in a highly predictable visual order on the canvas.
    return result.sort((a, b) => a.y - b.y || a.x - b.x);
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
// this is what makes the highlight tool work, it checks if the highlight tool is selected and then gets the selection and creates a rectangle around it
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
// what makes the highlighter erase
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
//without initializing the tools, the tool bar will not work and the user will not be able to select any of the tools
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
        // Right-click to reset/clear the saved color
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            delete btn.dataset.color;
            btn.style.background = '';
            btn.classList.add('assignable');
            btn.title = 'Click to save current color';
            updateColorHotbar(document.getElementById('color-picker').value);
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

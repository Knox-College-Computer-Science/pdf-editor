

let currentTool = null;

//the buttons that make up the tool bar
const setTool = (tool) => {
    if (!tool) return;
    currentTool = tool;

    if (fabricCanvas) {
        const active = fabricCanvas.getActiveObject();
        if (active) {
            fabricCanvas.discardActiveObject();
            if (typeof fabricCanvas.requestRenderAll === 'function') {
                fabricCanvas.requestRenderAll();
            } else {
                fabricCanvas.renderAll();
            }
        }
    }

    updateToolButtons();
    updateTextToolVisibility(tool === 'text');

    const color = document.getElementById('color-picker').value;
    const size = parseInt(document.getElementById('brush-size').value, 10) || 3;
    const textControls = document.getElementById('text-controls');
    if (textControls) textControls.classList.toggle('visible', tool === 'text');

    const fabricWrapper = fabricCanvas.wrapperEl;

    // Reset text layer state
    textLayerDiv.classList.remove('highlight-active', 'style-pick-active');
    fabricWrapper.style.pointerEvents = '';

    // Clear text layer state for tools that are not text, highlight, or mouse
    if (tool !== 'highlight' && tool !== 'text' && tool !== 'mouse') {
        textLayerDiv.innerHTML = '';
        if (fabricCanvas) fabricCanvas.selection = true;
    }

    // Ensure we start with object hit-testing enabled; specific tools may disable it
    if (fabricCanvas) fabricCanvas.skipTargetFind = false;

    if (tool === 'eraser') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.EraserBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.width = size || 30;
        fabricCanvas.freeDrawingBrush.color = 'rgb(112, 110, 110)';
        // Use rounded joins/caps to avoid sharp self-intersection artifacts
        fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';
        fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
    } else if (tool === 'draw') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = color;
        fabricCanvas.freeDrawingBrush.width = size;
        // Prevent corners from being rendered as transparent gaps by using rounded joins/caps
        fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';
        fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
    } else if (tool === 'highlight') {
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = false;
        document.getElementById('color-picker').value = color;
        textLayerDiv.classList.add('highlight-active');
        fabricWrapper.style.pointerEvents = 'none';
        ensureTextLayer();
    } else if (tool === 'text') {
        fabricCanvas.isDrawingMode = false;
        textLayerDiv.classList.add('style-pick-active');
        fabricWrapper.style.pointerEvents = 'none';
        ensureTextLayer();
    } else if (tool === 'mouse') {
        // Mouse tool: let the user interact with the underlying text layer, but
        // prevent Fabric objects from being targetable or selected.
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = false;
        fabricCanvas.skipTargetFind = true;
        fabricCanvas.defaultCursor = 'default';
        fabricWrapper.style.pointerEvents = 'none';
        // Enable pointer events on the text layer so DOM text can be selected
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
    const path = e.path;
    // Ensure drawing paths have safe join/cap settings and correct composite mode
    if (currentTool === 'eraser') {
        path.set({
            globalCompositeOperation: 'destination-out',
            selectable: false,
            evented: false,
            stroke: 'black',
            fill: null,
            strokeLineJoin: 'round',
            strokeLineCap: 'round',
        });
    } else if (currentTool === 'draw') {
        // Normal drawing path: make sure it draws over content and uses rounded corners
        path.set({
            globalCompositeOperation: 'source-over',
            selectable: true,
            evented: true,
            fill: null,
            strokeLineJoin: 'round',
            strokeLineCap: 'round',
        });
    } else {
        // For other tools, ensure safe defaults
        path.set({
            globalCompositeOperation: 'source-over',
            fill: null,
        });
    }
    fabricCanvas.bringToFront(path);
    fabricCanvas.renderAll();
};

const handleCanvasMouseDown = (e) => {
    if (currentTool !== 'text' || e.target) return;
    const pointer = fabricCanvas.getPointer(e.e);

    // Apply nearest PDF text style before reading props
    if (typeof findNearestTextStyle === 'function') {
        const nearest = findNearestTextStyle(pointer.x, pointer.y);
        if (nearest) applyStyleToControls(nearest);
    }

    const { fontFamily, fontSize, fill } = getTextProps();
    // Create a wrapping Textbox constrained to the page right edge so text
    // automatically wraps when it reaches the PDF page border.
    const pageWidth = fabricCanvas.getWidth();
    const paddingRight = 8; // gap from page edge
    const maxWidth = Math.max(40, pageWidth - pointer.x - paddingRight);
    const text = new fabric.Textbox('Type here', {
        left: pointer.x,
        top: pointer.y,
        fontSize,
        fill,
        fontFamily,
        width: maxWidth,
        splitByGrapheme: true,
    });
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll(); // Select the placeholder so typing replaces it immediately
    
};


const clearTextControls = () => {
    if (currentTool !== 'text') {
        document.getElementById('text-controls').classList.remove('visible');
        updateToolButtons();
    }
};

const enableFabricInteraction = () => {
    fabricCanvas.wrapperEl.style.pointerEvents = '';
    textLayerDiv.classList.remove('style-pick-active');
};

const handleTextLayerMouseUp = () => {
    if (currentTool === 'text') {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            const anchorSpan = selection.anchorNode?.parentElement;
            selection.removeAllRanges();
            if (anchorSpan && textLayerDiv.contains(anchorSpan)) {
                const x = parseFloat(anchorSpan.style.left);
                const y = parseFloat(anchorSpan.style.top);
                if (typeof findNearestTextStyle === 'function') {
                    const nearest = findNearestTextStyle(x, y);
                    if (nearest) applyStyleToControls(nearest);
                }
            }
        }
        enableFabricInteraction();
        return;
    }
    if (currentTool === 'highlight') handleTextLayerHighlight();
};

// this is what makes the highlight tool work, it checks if the highlight tool is selected and then gets the selection and creates a rectangle around it
const handleTextLayerHighlight = () => {
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
    const mouseBtnEl = document.querySelector('#tool-mouse');
    if (mouseBtnEl) mouseBtnEl.addEventListener('click', () => {
        setTool('mouse');
        // Ensure the canvas cursor resets to default
        if (fabricCanvas) fabricCanvas.defaultCursor = 'default';
    });
    document.querySelector('#tool-select').addEventListener('click', () => setTool('select'));
    document.querySelector('#tool-text').addEventListener('click', () => setTool('text'));
    document.querySelector('#tool-draw').addEventListener('click', () => setTool('draw'));
    document.querySelector('#tool-eraser').addEventListener('click', () => setTool('eraser'));
    document.querySelector('#tool-highlight').addEventListener('click', () => setTool('highlight'));
    document.querySelector('#tool-delete').addEventListener('click', () => setTool('delete'));
    document.querySelector('#tool-bold').addEventListener('click', () => toggleTextStyle('fontWeight', 'bold', 'normal'));
    document.querySelector('#tool-italic').addEventListener('click', () => toggleTextStyle('fontStyle', 'italic', 'normal'));
    document.querySelector('#tool-underline').addEventListener('click', toggleUnderline);
    document.querySelector('#tool-bullet').addEventListener('click', () => toggleList('bullet'));
    document.querySelector('#tool-numbered').addEventListener('click', () => toggleList('numbered'));
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
    fabricCanvas.on('selection:cleared', clearTextControls);
    // Keep textbox width constrained to page bounds when moving or after modification
    fabricCanvas.on('object:moving', (e) => {
        const obj = e.target;
        if (!obj || obj.type !== 'textbox') return;
        const pageW = fabricCanvas.getWidth();
        const paddingRight = 8;
        if (obj.left + obj.width > pageW - paddingRight) {
            obj.left = Math.max(0, pageW - paddingRight - obj.width);
            fabricCanvas.requestRenderAll();
        }
    });
    fabricCanvas.on('object:modified', (e) => {
        const obj = e.target;
        if (!obj || obj.type !== 'textbox') return;
        const pageW = fabricCanvas.getWidth();
        const paddingRight = 8;
        const maxW = Math.max(40, pageW - obj.left - paddingRight);
        if (obj.width > maxW) {
            obj.set('width', maxW);
            fabricCanvas.requestRenderAll();
        }
    });
    fabricCanvas.on('text:editing:entered', (e) => {
        const obj = e.target;
        document.getElementById('font-family').value = obj.fontFamily || 'Arial';
        document.getElementById('font-size').value = obj.fontSize || 20;
        document.getElementById('color-picker').value = obj.fill || '#000000';
        document.getElementById('text-controls').classList.add('visible');
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('tool-text').classList.add('active');
    });
    fabricCanvas.on('text:editing:exited', () => {
        if (currentTool !== 'text') {
            document.getElementById('text-controls').classList.remove('visible');
            updateToolButtons();
        }
    });
    textLayerDiv.addEventListener('mouseup', handleTextLayerMouseUp);

    document.getElementById('font-family').addEventListener('change', handleFontFamilyChange);
    document.getElementById('font-size').addEventListener('input', handleFontSizeChange);

    document.addEventListener('keydown', (e) => {
        const active = fabricCanvas.getActiveObject();
        if (e.key === 'Enter' && active && isTextObject(active) && active.isEditing) {
            const text = active.text || '';
            const cursor = typeof active.selectionStart === 'number' ? active.selectionStart : text.length;
            const before = text.slice(0, cursor);
            const after = text.slice(cursor);
            const lineStart = before.lastIndexOf('\n') + 1;
            const currentLine = before.slice(lineStart);
            const bulletMatch = currentLine.match(/^(•\s)/);
            const numberedMatch = currentLine.match(/^(\s*)(\d+)\.\s/);
            if (bulletMatch || numberedMatch) {
                e.preventDefault();
                let insert = '\n';
                if (bulletMatch) {
                    insert += bulletMatch[1];
                } else if (numberedMatch) {
                    const prefix = numberedMatch[1] || '';
                    const nextNumber = parseInt(numberedMatch[2], 10) + 1;
                    insert += `${prefix}${nextNumber}. `;
                }
                active.text = before + insert + after;
                const newCursor = cursor + insert.length;
                active.selectionStart = active.selectionEnd = newCursor;
                active.fire('changed');
                fabricCanvas.requestRenderAll();
                return;
            }
        }
        if (e.key === 'Backspace' && active && isTextObject(active) && active.isEditing) {
            const text = active.text || '';
            const start = typeof active.selectionStart === 'number' ? active.selectionStart : 0;
            const end = typeof active.selectionEnd === 'number' ? active.selectionEnd : start;
            if (start === end && start > 0) {
                const lineStart = text.lastIndexOf('\n', start - 1) + 1;
                const nextNewline = text.indexOf('\n', start);
                const lineEnd = nextNewline === -1 ? text.length : nextNewline;
                const lineText = text.slice(lineStart, lineEnd);
                const bulletPrefixMatch = lineText.match(/^(•\s)/);
                const numberedPrefixMatch = lineText.match(/^(\s*\d+\.\s)/);
                const prefix = bulletPrefixMatch ? bulletPrefixMatch[1] : numberedPrefixMatch ? numberedPrefixMatch[1] : null;
                const prefixEnd = prefix ? lineStart + prefix.length : -1;
                if (prefix && start > lineStart && start <= prefixEnd) {
                    e.preventDefault();
                    const strippedLine = lineText.slice(prefix.length);
                    const updatedText = text.slice(0, lineStart) + strippedLine + text.slice(lineEnd);
                    active.set('text', updatedText);

                    if (strippedLine === '' && lineStart > 0) {
                        const prevLineEnd = lineStart - 1; // index of the newline before the current line
                        const prevLineStart = updatedText.lastIndexOf('\n', prevLineEnd - 1) + 1;
                        const prevLineText = updatedText.slice(prevLineStart, prevLineEnd);
                        const prevPrefixMatch = prevLineText.match(/^(\s*(?:•\s|\d+\.\s))/);
                        active.selectionStart = active.selectionEnd = prevPrefixMatch
                            ? prevLineStart + prevPrefixMatch[1].length
                            : prevLineEnd;
                    } else {
                        active.selectionStart = active.selectionEnd = lineStart;
                    }

                    active.fire('changed');
                    active.setCoords && active.setCoords();
                    fabricCanvas.requestRenderAll();
                    return;
                }
            }
        }
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (!active) return;
        // Don't intercept while editing text
        if (active.isEditing) return;
        // Don't intercept if focus is inside an input/textarea
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        deleteSelection();
    });

    // Support paste into a fabric.Textbox while it's being edited.
    // Some browsers don't forward clipboard input to Fabric's hidden textarea reliably,
    // so we intercept the paste and manually insert text at the current selection.
    document.addEventListener('paste', (e) => {
        try {
            const active = fabricCanvas.getActiveObject();
            if (!active || active.type !== 'textbox' || !active.isEditing) return;
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text') || '';
            const text = active.text || '';
            const start = typeof active.selectionStart === 'number' ? active.selectionStart : text.length;
            const end = typeof active.selectionEnd === 'number' ? active.selectionEnd : start;
            const before = text.slice(0, start);
            const after = text.slice(end);
            active.text = before + paste + after;
            const cursor = start + paste.length;
            active.selectionStart = active.selectionEnd = cursor;
            active.fire('changed');
            fabricCanvas.requestRenderAll();
        } catch (_) {
            // Fall back to default behavior if anything goes wrong
        }
    });
};

window.addEventListener('DOMContentLoaded', () => {
    if (typeof fabricCanvas === 'undefined' || !document.querySelector('#tool-select')) {
        return;
    }
    initTools();
});

// Text Layer for Highlighting
const ensureTextLayer = async () => {
    if (textLayerDiv.querySelector('span')) return;
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';

    const { items } = await getPageTextCached(pageNum);
    items.forEach(item => {
        const span = document.createElement('span');
        span.textContent = item.str;
        span.style.left = item.cssLeft + 'px';
        span.style.top = item.cssTop + 'px';
        span.style.width = item.cssWidth + 'px';
        span.style.height = item.cssHeight + 'px';
        span.style.fontSize = item.cssHeight + 'px';
        textLayerDiv.appendChild(span);
    });
};

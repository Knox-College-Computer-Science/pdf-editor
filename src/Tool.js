// --- 툴 전환 ---
const setTool = (tool) => {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`)?.classList.add('active');

    const color = document.getElementById('color-picker').value;
    const size = parseInt(document.getElementById('brush-size').value);

    // Reset text layer
    if (tool !== 'highlight') {
        textLayerDiv.classList.remove('highlight-active');
        textLayerDiv.innerHTML = '';
        fabricCanvas.selection = true;
    }

    // --- CONSOLIDATED TOOL LOGIC ---
    if (tool === 'eraser') {
      fabricCanvas.isDrawingMode = true;
    fabricCanvas.freeDrawingBrush = new fabric.EraserBrush(fabricCanvas);
    fabricCanvas.freeDrawingBrush.width = size || 30;
    // Color doesn't matter for destination-out, but keep it transparent-ish 
    // to avoid seeing a black flash before it renders.
    fabricCanvas.freeDrawingBrush.color = 'rgba(0,0,0,0)';
    } else if (tool === 'draw') {
        fabricCanvas.isDrawingMode = true; 
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = color;
        fabricCanvas.freeDrawingBrush.width = size;

    } else if (tool === 'highlight') {
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = false;
        document.getElementById('color-picker').value = '#ffff00';
        textLayerDiv.classList.add('highlight-active');
        ensureTextLayer();

    } else {
        // Selection/Pointer mode
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
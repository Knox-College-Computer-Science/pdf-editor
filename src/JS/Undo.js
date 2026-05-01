// Undo helper for fabricCanvas.
window.initUndo = function(fabricCanvas) {
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
};
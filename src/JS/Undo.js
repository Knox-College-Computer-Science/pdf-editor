// Undo helper for fabricCanvas.
// Redo is also in this File because im lazy and did not want to make a new one for it 
window.initUndo = function(fabricCanvas) {
    const undoStack = [];
    const redoStack = [];
    let isRestoring = false;

    const saveHistory = () => {
        if (isRestoring) return;
        undoStack.push(JSON.stringify(fabricCanvas.toJSON()));
        if (undoStack.length > 50) undoStack.shift();
        redoStack.length = 0;
    };

    const restoreState = (state) => {
        if (!state) return;
        isRestoring = true;
        fabricCanvas.loadFromJSON(state, () => {
            fabricCanvas.renderAll();
            isRestoring = false;
        });
    };

    fabricCanvas.on('object:added', saveHistory);
    fabricCanvas.on('object:modified', saveHistory);
    fabricCanvas.on('object:removed', saveHistory);

    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (undoStack.length <= 1) {
                const current = undoStack.pop();
                if (current) redoStack.push(current);
                fabricCanvas.clear();
                undoStack.length = 0;
                return;
            }
            const current = undoStack.pop();
            redoStack.push(current);
            const prev = undoStack[undoStack.length - 1];
            restoreState(prev);
        } 
        else if ((e.ctrlKey || e.metaKey) && key === 's') {
            e.preventDefault();
        }
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'z') {
            const target = e.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) {
                return;
            }
            if (redoStack.length === 0) return;
            e.preventDefault();
            const next = redoStack.pop();
            if (next) {
                undoStack.push(next);
                restoreState(next);
            }
        }
    });
};
// Undo helper for fabricCanvas.
// Redo is also in this File because im lazy and did not want to make a new one for it 
//copy and paste are also in this file 
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
        else if ((e.ctrlKey || e.metaKey) && key === 'c') {
            // Copy highlighted text to clipboard
            const selectedText = window.getSelection().toString();
            if (selectedText) {
                navigator.clipboard.writeText(selectedText).catch(err => {
                    console.error('Failed to copy to clipboard:', err);
                });
            }
        }
        else if ((e.ctrlKey || e.metaKey) && key === 'v') {
            // Paste from clipboard
            const target = e.target;
            // If focus is in an input/textarea/contentEditable, allow default paste
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) {
                return;
            }
            const active = fabricCanvas.getActiveObject();
            // If there's an active text object and it's currently being edited, allow the browser
            // to handle the paste (this lets Firefox's hidden textarea receive clipboard data).
            if (active && (active.type === 'i-text' || active.type === 'text' || active.type === 'textbox') && active.isEditing) {
                return;
            }

            // Otherwise, attempt to read the clipboard and insert into the active object (if any).
            navigator.clipboard.readText().then(text => {
                if (!text) return;
                const active2 = fabricCanvas.getActiveObject();
                if (active2 && (active2.type === 'i-text' || active2.type === 'text' || active2.type === 'textbox')) {
                    // If editing isn't active, replace or insert text at selection if possible
                    if (active2.isEditing && typeof active2.insertChars === 'function') {
                        const pos = active2.selectionStart || 0;
                        active2.insertChars(text, pos);
                    } else if (typeof active2.set === 'function') {
                        active2.set('text', text);
                    }
                    fabricCanvas.renderAll();
                    saveHistory();
                } else {
                    // No active text object to receive paste; ignore and allow default behavior
                    console.log('Paste detected but no active text object');
                }
            }).catch(err => {
                // If clipboard API is not available or fails, let the browser handle paste by default.
                console.error('Failed to read from clipboard:', err);
            });
        }
    });
};
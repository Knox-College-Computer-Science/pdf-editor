import { describe, it, expect, vi, beforeEach } from 'vitest';

// Re-implementation of initUndo logic from src/JS/Undo.js for isolated testing
function createUndoController(fabricCanvas) {
    const undoStack = [];

    const saveHistory = () => {
        undoStack.push(JSON.stringify(fabricCanvas.toJSON()));
        if (undoStack.length > 50) undoStack.shift();
    };

    fabricCanvas.on('object:added', saveHistory);
    fabricCanvas.on('object:modified', saveHistory);
    fabricCanvas.on('object:removed', saveHistory);

    const undo = () => {
        if (undoStack.length <= 1) {
            fabricCanvas.clear();
            undoStack.length = 0;
            return;
        }
        undoStack.pop();
        const prev = undoStack[undoStack.length - 1];
        fabricCanvas.loadFromJSON(prev, () => fabricCanvas.renderAll());
    };

    return { undoStack, saveHistory, undo };
}

const makeFabricMock = (initialState = {}) => {
    const listeners = {};
    let state = initialState;

    return {
        toJSON: vi.fn(() => state),
        clear: vi.fn(() => { state = {}; }),
        loadFromJSON: vi.fn((json, cb) => { state = JSON.parse(json); cb?.(); }),
        renderAll: vi.fn(),
        on: (event, cb) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(cb);
        },
        emit: (event) => listeners[event]?.forEach(cb => cb()),
    };
};

describe('Undo stack', () => {
    let canvas;
    let controller;

    beforeEach(() => {
        canvas = makeFabricMock({ objects: [] });
        controller = createUndoController(canvas);
    });

    it('starts with an empty stack', () => {
        expect(controller.undoStack).toHaveLength(0);
    });

    it('saves state when object:added fires', () => {
        canvas.toJSON.mockReturnValue({ objects: ['obj1'] });
        canvas.emit('object:added');
        expect(controller.undoStack).toHaveLength(1);
    });

    it('saves state on object:modified and object:removed too', () => {
        canvas.emit('object:modified');
        canvas.emit('object:removed');
        expect(controller.undoStack).toHaveLength(2);
    });

    it('undo with empty stack clears the canvas', () => {
        controller.undo();
        expect(canvas.clear).toHaveBeenCalled();
        expect(controller.undoStack).toHaveLength(0);
    });

    it('undo with single entry clears the canvas', () => {
        canvas.emit('object:added');
        controller.undo();
        expect(canvas.clear).toHaveBeenCalled();
        expect(controller.undoStack).toHaveLength(0);
    });

    it('undo reverts to the previous state', () => {
        canvas.toJSON.mockReturnValueOnce({ objects: ['a'] });
        canvas.emit('object:added');
        canvas.toJSON.mockReturnValueOnce({ objects: ['a', 'b'] });
        canvas.emit('object:added');

        expect(controller.undoStack).toHaveLength(2);
        controller.undo();
        expect(controller.undoStack).toHaveLength(1);
        expect(canvas.loadFromJSON).toHaveBeenCalledWith(
            JSON.stringify({ objects: ['a'] }),
            expect.any(Function)
        );
    });

    it('caps the stack at 50 entries', () => {
        for (let i = 0; i < 60; i++) {
            canvas.toJSON.mockReturnValue({ objects: [i] });
            canvas.emit('object:added');
        }
        expect(controller.undoStack.length).toBeLessThanOrEqual(50);
    });

    it('multiple undos walk back through history', () => {
        ['a', 'b', 'c'].forEach(obj => {
            canvas.toJSON.mockReturnValueOnce({ objects: [obj] });
            canvas.emit('object:added');
        });

        controller.undo(); // back to 'b'
        controller.undo(); // back to 'a'
        expect(controller.undoStack).toHaveLength(1);
        expect(canvas.loadFromJSON).toHaveBeenLastCalledWith(
            JSON.stringify({ objects: ['a'] }),
            expect.any(Function)
        );
    });
});

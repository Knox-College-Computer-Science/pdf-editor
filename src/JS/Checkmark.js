// --- Checkmark ---

let selectedSym = '✓';
let selectedColor = '#1b5e20';

const openCheckmarkModal = () => {
    document.getElementById('checkmark-modal').classList.remove('hidden');
    updateCheckmarkPreview();
};

const closeCheckmarkModal = () => {
    document.getElementById('checkmark-modal').classList.add('hidden');
};

const updateCheckmarkPreview = () => {
    const preview = document.getElementById('checkmark-preview');
    preview.textContent = selectedSym;
    preview.style.color = selectedColor;
};

const addCheckmarkToCanvas = () => {
    if (!fabricCanvas) return;

    const canvasEl = document.getElementById('pdf-render');
    const canvasRect = canvasEl.getBoundingClientRect();
    const mainContent = document.querySelector('.main-content');
    const viewRect = mainContent.getBoundingClientRect();

    const visibleTop = Math.max(0, viewRect.top - canvasRect.top);
    const visibleBottom = Math.min(fabricCanvas.height, viewRect.bottom - canvasRect.top);
    const visibleLeft = Math.max(0, viewRect.left - canvasRect.left);
    const visibleRight = Math.min(fabricCanvas.width, viewRect.right - canvasRect.left);

    const centerX = (visibleLeft + visibleRight) / 2;
    const centerY = (visibleTop + visibleBottom) / 2;

    const mark = new fabric.IText(selectedSym, {
        left: centerX,
        top: centerY,
        fontSize: 36,
        fill: selectedColor,
        fontWeight: '700',
        originX: 'center',
        originY: 'center',
        selectable: true,
    });

    fabricCanvas.add(mark);
    fabricCanvas.setActiveObject(mark);
    fabricCanvas.renderAll();
    closeCheckmarkModal();
    setTool('select');
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tool-checkmark').addEventListener('click', openCheckmarkModal);
    document.getElementById('checkmark-add-btn').addEventListener('click', addCheckmarkToCanvas);
    document.getElementById('checkmark-close-btn').addEventListener('click', closeCheckmarkModal);

    document.getElementById('checkmark-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeCheckmarkModal();
    });

    document.querySelectorAll('.checkmark-sym-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.checkmark-sym-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedSym = btn.dataset.sym;
            updateCheckmarkPreview();
        });
    });

    document.querySelectorAll('.checkmark-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.checkmark-color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedColor = btn.dataset.color;
            updateCheckmarkPreview();
        });
    });
});

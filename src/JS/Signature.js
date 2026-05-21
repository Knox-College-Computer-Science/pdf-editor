// --- Signature ---

const SIGNATURE_FONT = 'Dancing Script';

const openSignatureModal = () => {
    document.getElementById('signature-modal').classList.remove('hidden');
    const input = document.getElementById('signature-name-input');
    input.focus();
    input.select();
    updateSignaturePreview();
};

const closeSignatureModal = () => {
    document.getElementById('signature-modal').classList.add('hidden');
};

const updateSignaturePreview = () => {
    const name = document.getElementById('signature-name-input').value;
    document.getElementById('signature-preview').textContent = name.trim() || 'Your Name';
};

const addSignatureToCanvas = () => {
    const name = document.getElementById('signature-name-input').value.trim();
    if (!name || !fabricCanvas) return;

    const sig = new fabric.IText(name, {
        left: fabricCanvas.width / 2,
        top: fabricCanvas.height * 0.75,
        fontFamily: SIGNATURE_FONT,
        fontSize: 52,
        fill: '#1a237e',
        fontWeight: '700',
        originX: 'center',
        originY: 'center',
    });

    fabricCanvas.add(sig);
    fabricCanvas.setActiveObject(sig);
    fabricCanvas.renderAll();
    closeSignatureModal();
    setTool('select');
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tool-signature').addEventListener('click', openSignatureModal);

    document.getElementById('signature-name-input').addEventListener('input', updateSignaturePreview);

    document.getElementById('signature-name-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') addSignatureToCanvas();
        if (e.key === 'Escape') closeSignatureModal();
    });

    document.getElementById('signature-add-btn').addEventListener('click', addSignatureToCanvas);
    document.getElementById('signature-close-btn').addEventListener('click', closeSignatureModal);

    document.getElementById('signature-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeSignatureModal();
    });
});

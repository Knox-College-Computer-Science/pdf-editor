const initEditorElements = () => {
    if (canvas) return;
    canvas = document.querySelector('#pdf-render');
    ctx = canvas.getContext('2d');
    fileInput = document.querySelector('#file-input');
    errorDiv = document.querySelector('#file-error');

    fileInput.addEventListener('change', async e => {
        const file = e.target.files[0];
        const validationError = await validatePdfFile(file);
        if (validationError) { showError(validationError); return; }
        loadPdfDocument({ data: await file.arrayBuffer() });
    });

    document.getElementById('insert-pdf-input').addEventListener('change', async e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const validationError = await validatePdfFile(file);
        if (validationError) { showError(validationError); return; }
        if (!originalPdfBytes) { showError('Please open a PDF first before inserting.'); return; }

        const { PDFDocument } = PDFLib;
        const [baseDoc, insertDoc] = await Promise.all([
            PDFDocument.load(originalPdfBytes.slice()),
            PDFDocument.load(await file.arrayBuffer()),
        ]);
        const copiedPages = await baseDoc.copyPages(insertDoc, insertDoc.getPageIndices());
        copiedPages.forEach(page => baseDoc.addPage(page));
        const mergedBytes = await baseDoc.save();
        originalPdfBytes = new Uint8Array(mergedBytes);
        Object.keys(pageAnnotations).forEach(k => delete pageAnnotations[k]);
        clearPageTextCache();
        const doc = await pdfjsLib.getDocument({ data: originalPdfBytes.slice() }).promise;
        pdfDoc = doc;
        document.querySelector('#page-count').textContent = pdfDoc.numPages;
        renderPage(pageNum);
        renderSidebar();
    });

    document.getElementById('delete-page-btn').addEventListener('click', async () => {
        if (!originalPdfBytes) return;
        if (pdfDoc.numPages === 1) { alert('Cannot delete the only page.'); return; }
        if (!confirm(`Delete page ${pageNum}?`)) return;
        const { PDFDocument } = PDFLib;
        const pdfLibDoc = await PDFDocument.load(originalPdfBytes.slice());
        pdfLibDoc.removePage(pageNum - 1);
        const savedBytes = await pdfLibDoc.save();
        originalPdfBytes = new Uint8Array(savedBytes);
        Object.keys(pageAnnotations).forEach(k => delete pageAnnotations[k]);
        pageNum = Math.min(pageNum, pdfLibDoc.getPageCount());
        const doc = await pdfjsLib.getDocument({ data: originalPdfBytes.slice() }).promise;
        pdfDoc = doc;
        document.querySelector('#page-count').textContent = pdfDoc.numPages;
        selectedPages.clear();
        updateSelectedState();
        clearPageTextCache();
        renderPage(pageNum);
        renderSidebar();
    });

    document.getElementById('extract-btn').addEventListener('click', async () => {
        if (!originalPdfBytes || selectedPages.size === 0) return;
        pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);

        const pagesToExtract = Array.from(selectedPages).sort((a, b) => a - b);
        const { PDFDocument } = PDFLib;
        const srcDoc = await PDFDocument.load(originalPdfBytes.slice());
        const newDoc = await PDFDocument.create();
        const indices = pagesToExtract.map(p => p - 1);
        const copied = await newDoc.copyPages(srcDoc, indices);
        copied.forEach(p => newDoc.addPage(p));

        const newPages = newDoc.getPages();
        for (let i = 0; i < pagesToExtract.length; i++) {
            const pNum = pagesToExtract[i];
            const annotation = pageAnnotations[pNum];
            if (!annotation || !annotation.objects || annotation.objects.length === 0) continue;
            const dim = pageDimensions[pNum];
            if (!dim) continue;
            const tempCanvas = new fabric.StaticCanvas(null, { width: dim.width, height: dim.height });
            await new Promise(resolve => tempCanvas.loadFromJSON(annotation, resolve));
            tempCanvas.renderAll();
            const pngDataUrl = tempCanvas.toDataURL({ format: 'png' });
            const base64 = pngDataUrl.split(',')[1];
            const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const pngImage = await newDoc.embedPng(pngBytes);
            const page = newPages[i];
            const { width, height } = page.getSize();
            page.drawImage(pngImage, { x: 0, y: 0, width, height });
        }

        const savedBytes = await newDoc.save();
        await savePdfBlob(new Blob([savedBytes], { type: 'application/pdf' }), 'extracted.pdf');

        selectedPages.clear();
        updateSelectedState();
    });

    document.getElementById('help-btn').addEventListener('click', () => {
        document.getElementById('help-modal').classList.remove('hidden');
    });
    document.getElementById('help-close-btn').addEventListener('click', () => {
        document.getElementById('help-modal').classList.add('hidden');
    });
    document.getElementById('help-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) document.getElementById('help-modal').classList.add('hidden');
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') document.getElementById('help-modal').classList.add('hidden');
    });

    const buildAnnotatedPdf = async () => {
        pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);
        const { PDFDocument } = PDFLib;
        const pdfLibDoc = await PDFDocument.load(originalPdfBytes.slice());
        const pages = pdfLibDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
            const pNum = i + 1;
            const annotation = pageAnnotations[pNum];
            if (!annotation || !annotation.objects || annotation.objects.length === 0) continue;
            const dim = pageDimensions[pNum];
            if (!dim) continue;
            const tempCanvas = new fabric.StaticCanvas(null, { width: dim.width, height: dim.height });
            await new Promise(resolve => tempCanvas.loadFromJSON(annotation, resolve));
            tempCanvas.renderAll();
            const pngDataUrl = tempCanvas.toDataURL({ format: 'png' });
            const base64 = pngDataUrl.split(',')[1];
            const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const pngImage = await pdfLibDoc.embedPng(pngBytes);
            const page = pages[i];
            const { width, height } = page.getSize();
            page.drawImage(pngImage, { x: 0, y: 0, width, height });
        }
        return new Blob([await pdfLibDoc.save()], { type: 'application/pdf' });
    };

    document.getElementById('download-btn').addEventListener('click', async () => {
        if (!originalPdfBytes) return;
        await savePdfBlob(await buildAnnotatedPdf(), 'edited.pdf');
    });

    document.getElementById('print-btn').addEventListener('click', async () => {
        if (!originalPdfBytes) return;
        const url = URL.createObjectURL(await buildAnnotatedPdf());
        const win = window.open(url, '_blank');
        win.onload = () => { win.print(); };
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    });

    document.querySelector('#prev-page').addEventListener('click', showPrevPage);
    document.querySelector('#next-page').addEventListener('click', showNextPage);
};
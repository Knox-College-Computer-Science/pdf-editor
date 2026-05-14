// --- PDF rendering ---
const renderPage = num => {
    pageIsRendering = true;

    pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        page.render({ canvasContext: ctx, viewport }).promise.then(() => {
            pageIsRendering = false;

            // Resize fabric canvas to match the rendered PDF page
            fabricCanvas.setWidth(viewport.width);
            fabricCanvas.setHeight(viewport.height);
            fabricCanvas.clear();

            // Reset text layer on page change
            textLayerDiv.innerHTML = '';

            // Restore saved annotations for this page
            pageDimensions[num] = { width: viewport.width, height: viewport.height };
            if (pageAnnotations[num]) {
                fabricCanvas.loadFromJSON(pageAnnotations[num], () => fabricCanvas.renderAll());
            }

            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
            }
        });

        document.querySelector('#page-num').textContent = num;
    });
};

const queueRenderPage = num => {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderPage(num);
    }
};

const showPrevPage = () => {
    if (pageNum <= 1) return;
    pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);
    pageNum--;
    queueRenderPage(pageNum);
    updateSidebarActive();
};

const showNextPage = () => {
    if (pageNum >= pdfDoc.numPages) return;
    pageAnnotations[pageNum] = fabricCanvas.toJSON(['data']);
    pageNum++;
    queueRenderPage(pageNum);
    updateSidebarActive();
};

const showError = message => {
    if (errorDiv) errorDiv.textContent = message;
};

const clearError = () => {
    if (errorDiv) errorDiv.textContent = '';
};
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const defaultUrl = 'pdf.pdf';

let pdfDoc = null,
    pageNum = 1,
    pageIsRendering = false,
    pageNumIsPending = null;

const scale = 1.5,
    canvas = document.querySelector('#pdf-render'),
    ctx = canvas.getContext('2d'),
    fileInput = document.querySelector('#file-input'),
    errorDiv = document.querySelector('#file-error');

// Render the page
const renderPage = num => {
    pageIsRendering = true;

    // Get page
    pdfDoc.getPage(num).then(page => {
        // Set scale
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderCtx = {
            canvasContext: ctx,
            viewport
        };

        page.render(renderCtx).promise.then(() => {
            pageIsRendering = false;

            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
            }
        });

        // Output current page
        document.querySelector('#page-num').textContent = num;
    });
};

// Check for pages rendering
const queueRenderPage = num => {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderPage(num);
    }
};

// Show Prev Page
const showPrevPage = () => {
    if (pageNum <= 1) {
        return;
    }
    pageNum--;
    queueRenderPage(pageNum);
};

// Show Next Page
const showNextPage = () => {
    if (pageNum >= pdfDoc.numPages) {
        return;
    }
    pageNum++;
    queueRenderPage(pageNum);
};

const showError = message => {
    errorDiv.textContent = message;
    document.querySelector('.top-bar').style.display = 'none';
};

const clearError = () => {
    errorDiv.textContent = '';
    document.querySelector('.top-bar').style.display = 'flex';
};

const loadPdfDocument = source => {
    clearError();
    pdfjsLib.getDocument(source).promise.then(pdfDoc_ => {
        pdfDoc = pdfDoc_;

        document.querySelector('#page-count').textContent = pdfDoc.numPages;
        pageNum = 1;
        queueRenderPage(pageNum);
    })
        .catch(err => {
            showError('Failed to load PDF: ' + err.message);
        });
};

const validatePdfFile = async file => {
    if (!file) {
        return 'Please select a PDF file.';
    }

    if (file.type !== 'application/pdf') {
        return 'Please select a PDF file.';
    }

    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46) {
        return 'The selected file is not a PDF.';
    }

    return null;
};

fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    const validationError = await validatePdfFile(file);
    if (validationError) {
        showError(validationError);
        return;
    }

    const arrayBuffer = await file.arrayBuffer();
    loadPdfDocument({ data: arrayBuffer });
});

// Get Document
loadPdfDocument(defaultUrl);

// Button Events
document.querySelector('#prev-page').addEventListener('click', showPrevPage);
document.querySelector('#next-page').addEventListener('click', showNextPage);
// --- Sidebar ---
const THUMB_SCALE = 0.25;

const updateSidebarActive = () => {
    document.querySelectorAll('.sidebar-thumb').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.page) === pageNum);
    });
    const active = document.querySelector('.sidebar-thumb.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

const renderSidebar = async () => {
    const container = document.getElementById('sidebar-thumbnails');
    container.innerHTML = '';
    if (!pdfDoc) return;

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'sidebar-thumb' + (i === pageNum ? ' active' : '');
        wrapper.dataset.page = i;

        const img = document.createElement('img');
        img.alt = `Page ${i}`;

        const label = document.createElement('span');
        label.textContent = i;

        wrapper.appendChild(img);
        wrapper.appendChild(label);
        wrapper.addEventListener('click', () => goToPage(parseInt(wrapper.dataset.page)));
        container.appendChild(wrapper);

        // Render each thumbnail asynchronously
        (async (pageIndex, imgEl) => {
            const page = await pdfDoc.getPage(pageIndex);
            const vp = page.getViewport({ scale: THUMB_SCALE });
            const tc = document.createElement('canvas');
            tc.width = vp.width;
            tc.height = vp.height;
            await page.render({ canvasContext: tc.getContext('2d'), viewport: vp }).promise;
            imgEl.src = tc.toDataURL();
        })(i, img);
    }
};
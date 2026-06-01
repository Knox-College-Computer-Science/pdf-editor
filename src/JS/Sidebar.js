// --- Sidebar ---
const THUMB_SCALE = 0.25;

let selectedPages = new Set();
let lastClickedPage = null;

const updateSidebarActive = () => {
    document.querySelectorAll('.sidebar-thumb').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.page) === pageNum);
    });
    const active = document.querySelector('.sidebar-thumb.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

const updateSelectedState = () => {
    document.querySelectorAll('.sidebar-thumb').forEach(el => {
        el.classList.toggle('selected', selectedPages.has(parseInt(el.dataset.page)));
    });
    const bar = document.getElementById('sidebar-extract-bar');
    if (!bar) return;
    if (selectedPages.size > 0) {
        bar.classList.remove('hidden');
        bar.querySelector('.extract-count').textContent =
            `${selectedPages.size} page${selectedPages.size > 1 ? 's' : ''} selected`;
    } else {
        bar.classList.add('hidden');
    }
};

let dragSrcPage = null;
let dropInsertBefore = null;
let dropIndicator = null;
let sidebarContainerListenersAdded = false;

const getDropIndicator = () => {
    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'drop-indicator';
    }
    return dropIndicator;
};

const removeDropIndicator = () => {
    const ind = getDropIndicator();
    if (ind.parentNode) ind.parentNode.removeChild(ind);
    dropInsertBefore = null;
};

const renderSidebar = async () => {
    const container = document.getElementById('sidebar-thumbnails');
    container.innerHTML = '';
    if (!pdfDoc) return;

    if (!sidebarContainerListenersAdded) {
        sidebarContainerListenersAdded = true;
        container.addEventListener('dragleave', e => {
            if (!container.contains(e.relatedTarget)) removeDropIndicator();
        });
        container.addEventListener('drop', e => e.preventDefault());
    }

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'sidebar-thumb' + (i === pageNum ? ' active' : '') + (selectedPages.has(i) ? ' selected' : '');
        wrapper.dataset.page = i;
        wrapper.draggable = true;

        const img = document.createElement('img');
        img.alt = `Page ${i}`;

        const label = document.createElement('span');
        label.textContent = i;

        wrapper.appendChild(img);
        wrapper.appendChild(label);
        wrapper.addEventListener('click', e => {
            const clickedPage = parseInt(wrapper.dataset.page);
            if (e.shiftKey) {
                e.preventDefault();
                const anchor = lastClickedPage !== null ? lastClickedPage : clickedPage;
                const min = Math.min(anchor, clickedPage);
                const max = Math.max(anchor, clickedPage);
                for (let p = min; p <= max; p++) selectedPages.add(p);
                updateSelectedState();
                lastClickedPage = clickedPage;
            } else if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (selectedPages.has(clickedPage)) {
                    selectedPages.delete(clickedPage);
                } else {
                    selectedPages.add(clickedPage);
                }
                lastClickedPage = clickedPage;
                updateSelectedState();
            } else {
                selectedPages.clear();
                updateSelectedState();
                lastClickedPage = clickedPage;
                goToPage(clickedPage);
            }
        });

        wrapper.addEventListener('dragstart', e => {
            dragSrcPage = parseInt(wrapper.dataset.page);
            e.dataTransfer.effectAllowed = 'move';
            // Delay so the drag ghost is captured before the element fades
            setTimeout(() => wrapper.classList.add('dragging'), 0);
        });

        wrapper.addEventListener('dragend', () => {
            wrapper.classList.remove('dragging');
            removeDropIndicator();
            dragSrcPage = null;
        });

        wrapper.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            const rect = wrapper.getBoundingClientRect();
            const ind = getDropIndicator();
            if (e.clientY < rect.top + rect.height / 2) {
                container.insertBefore(ind, wrapper);
                dropInsertBefore = parseInt(wrapper.dataset.page);
            } else {
                container.insertBefore(ind, wrapper.nextSibling);
                dropInsertBefore = parseInt(wrapper.dataset.page) + 1;
            }
        });

        wrapper.addEventListener('drop', e => {
            e.preventDefault();
            const dest = dropInsertBefore;
            removeDropIndicator();
            if (dragSrcPage !== null && dest !== null) {
                reorderPages(dragSrcPage, dest);
            }
            dragSrcPage = null;
        });

        container.appendChild(wrapper);

        // Render each thumbnail asynchronously
        (async (pageIndex, imgEl) => {
            const page = await pdfDoc.getPage(pageIndex);
            const dpr = window.devicePixelRatio || 1;
            const vp = page.getViewport({ scale: THUMB_SCALE * dpr });
            const tc = document.createElement('canvas');
            tc.width = vp.width;
            tc.height = vp.height;
            tc.style.width = (vp.width / dpr) + 'px';
            tc.style.height = (vp.height / dpr) + 'px';
            await page.render({ canvasContext: tc.getContext('2d'), viewport: vp }).promise;
            imgEl.src = tc.toDataURL();
        })(i, img);
    }

};

// --- Sidebar ---
const THUMB_SCALE = 0.25;

const updateSidebarActive = () => {
    document.querySelectorAll('.sidebar-thumb').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.page) === pageNum);
    });
    const active = document.querySelector('.sidebar-thumb.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
        wrapper.className = 'sidebar-thumb' + (i === pageNum ? ' active' : '');
        wrapper.dataset.page = i;
        wrapper.draggable = true;

        const img = document.createElement('img');
        img.alt = `Page ${i}`;

        const label = document.createElement('span');
        label.textContent = i;

        wrapper.appendChild(img);
        wrapper.appendChild(label);
        wrapper.addEventListener('click', () => goToPage(parseInt(wrapper.dataset.page)));

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
            const vp = page.getViewport({ scale: THUMB_SCALE });
            const tc = document.createElement('canvas');
            tc.width = vp.width;
            tc.height = vp.height;
            await page.render({ canvasContext: tc.getContext('2d'), viewport: vp }).promise;
            imgEl.src = tc.toDataURL();
        })(i, img);
    }

};

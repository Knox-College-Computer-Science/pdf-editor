import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mirrors the page navigation logic from src/JS/pdfview.js
function createPageNav({ numPages, onRender, onSidebar }) {
    let pageNum = 1;
    let pageIsRendering = false;
    let pageNumIsPending = null;
    const pageAnnotations = {};

    const saveAnnotations = (fabricCanvas) => {
        pageAnnotations[pageNum] = fabricCanvas?.toJSON(['data']) ?? null;
    };

    const queueRenderPage = (num) => {
        if (pageIsRendering) {
            pageNumIsPending = num;
        } else {
            onRender(num);
        }
    };

    const goToPage = (num, fabricCanvas) => {
        if (num < 1 || num > numPages || num === pageNum) return false;
        saveAnnotations(fabricCanvas);
        pageNum = num;
        queueRenderPage(pageNum);
        onSidebar();
        return true;
    };

    const showPrevPage = (fabricCanvas) => {
        if (pageNum <= 1) return false;
        saveAnnotations(fabricCanvas);
        pageNum--;
        queueRenderPage(pageNum);
        onSidebar();
        return true;
    };

    const showNextPage = (fabricCanvas) => {
        if (pageNum >= numPages) return false;
        saveAnnotations(fabricCanvas);
        pageNum++;
        queueRenderPage(pageNum);
        onSidebar();
        return true;
    };

    return {
        get pageNum() { return pageNum; },
        get pageAnnotations() { return pageAnnotations; },
        get pageNumIsPending() { return pageNumIsPending; },
        set pageIsRendering(v) { pageIsRendering = v; },
        goToPage,
        showPrevPage,
        showNextPage,
    };
}

describe('Page navigation', () => {
    let nav;
    const onRender = vi.fn();
    const onSidebar = vi.fn();
    const mockCanvas = { toJSON: vi.fn(() => ({ objects: [] })) };

    beforeEach(() => {
        vi.clearAllMocks();
        nav = createPageNav({ numPages: 5, onRender, onSidebar });
    });

    describe('goToPage', () => {
        it('navigates to a valid page', () => {
            const result = nav.goToPage(3, mockCanvas);
            expect(result).toBe(true);
            expect(nav.pageNum).toBe(3);
            expect(onRender).toHaveBeenCalledWith(3);
        });

        it('does nothing when target is current page', () => {
            const result = nav.goToPage(1, mockCanvas);
            expect(result).toBe(false);
            expect(onRender).not.toHaveBeenCalled();
        });

        it('does nothing for page 0', () => {
            expect(nav.goToPage(0, mockCanvas)).toBe(false);
        });

        it('does nothing for page beyond numPages', () => {
            expect(nav.goToPage(6, mockCanvas)).toBe(false);
        });

        it('saves annotations before switching page', () => {
            nav.goToPage(2, mockCanvas);
            expect(mockCanvas.toJSON).toHaveBeenCalled();
            expect(nav.pageAnnotations[1]).toBeDefined();
        });

        it('updates sidebar on navigation', () => {
            nav.goToPage(2, mockCanvas);
            expect(onSidebar).toHaveBeenCalled();
        });
    });

    describe('showPrevPage', () => {
        it('does nothing on page 1', () => {
            expect(nav.showPrevPage(mockCanvas)).toBe(false);
            expect(onRender).not.toHaveBeenCalled();
        });

        it('decrements page from page 3', () => {
            nav.goToPage(3, mockCanvas);
            vi.clearAllMocks();
            nav.showPrevPage(mockCanvas);
            expect(nav.pageNum).toBe(2);
            expect(onRender).toHaveBeenCalledWith(2);
        });
    });

    describe('showNextPage', () => {
        it('does nothing on last page', () => {
            nav.goToPage(5, mockCanvas);
            vi.clearAllMocks();
            expect(nav.showNextPage(mockCanvas)).toBe(false);
            expect(onRender).not.toHaveBeenCalled();
        });

        it('increments page from page 1', () => {
            nav.showNextPage(mockCanvas);
            expect(nav.pageNum).toBe(2);
            expect(onRender).toHaveBeenCalledWith(2);
        });
    });

    describe('queueRenderPage', () => {
        it('queues render when page is already rendering', () => {
            nav.pageIsRendering = true;
            nav.showNextPage(mockCanvas);
            expect(onRender).not.toHaveBeenCalled();
            expect(nav.pageNumIsPending).toBe(2);
        });
    });
});

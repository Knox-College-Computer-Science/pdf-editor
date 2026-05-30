# NoBSPDFeditor

A browser-based PDF editor. All editing happens locally — nothing is uploaded anywhere.

---

## Setup & Installation

You need Node.js (v18+) for running tests. For the app itself, you just need a browser and a local HTTP server (browsers block ES modules over `file://`).

**Install test dependencies:**
```bash
npm install
```

**Run the app** — pick any of these:

- VS Code Live Server: right-click `src/index.html` → Open with Live Server
- Python: `cd src && python3 -m http.server 8000`, then go to `http://localhost:8000`
- Node: `npx serve src`

The app loads PDF.js, pdf-lib, and Fabric.js from CDN, so you need an internet connection the first time. After that the browser caches them.

---

## How to Use It

### Opening a File

On the landing screen, drag a PDF onto the drop zone or click "Choose File". The file is checked against both its MIME type and its first 4 magic bytes (`%PDF`), so renaming a non-PDF to `.pdf` won't work.

While editing, "Open PDF" in the toolbar opens a new file. Any unsaved annotations are lost without a warning.

### Tools

**Select** — the default tool. Click annotations to select and move them. Shift+click or drag-select for multiple.

**Text** — click anywhere on the page to add a text box. If you click near existing PDF text, the tool tries to match the nearest text's font, size, and color. Font family and size are controlled by the dropdowns that appear in the toolbar when this tool is active.

**Draw** — freehand drawing. Color and brush size come from the color picker and brush size slider.

**Eraser** — erases drawn paths using a compositing brush. It doesn't touch the original PDF content underneath.

**Highlight** — drag over PDF text to highlight it. Uses the current color at 40% opacity. Adjacent highlight boxes on the same line get merged automatically so you don't end up with double highlights.

**Signature** — opens a modal where you type a signature. It gets placed in the center of the viewport in cursive (Dancing Script). The last 3 signatures you used are saved in localStorage as shortcuts.

**Checkmark** — lets you place a ✓ or ✗ in green, black, dark blue, or red. Placed in the center of the viewport.

**Delete** — click any annotation to delete it.

**Search** — Ctrl+F or the magnifying glass. Case-insensitive, searches all pages. Enter/Shift+Enter to go forward/back through results.

**Undo/Redo** — Ctrl+Z / Ctrl+Shift+Z. Works for annotation changes only (not page deletions or reordering).

### Pages

The left sidebar shows thumbnails of all pages. Drag a thumbnail to reorder pages. Ctrl+click or Shift+click to select multiple pages, then use the "Extract" button that appears to save them as a separate PDF.

"Insert PDF" appends another PDF's pages to the end of the current document.

"Delete Page" removes the current page permanently — this cannot be undone.

### Saving

"Download" saves the annotated PDF. Annotations are flattened to a PNG image and embedded on each page, so the saved file is a visual composite — text annotations won't be selectable or searchable in the output.

"Print" does the same thing but opens a print dialog instead.

---

## Assumptions

- The PDF starts with `%PDF` (bytes `0x25 0x50 0x44 0x46`). Any file without these bytes is rejected, even if the MIME type says PDF.
- PDFs that are password-protected or use unsupported PDF features will fail to load. The app shows the error but doesn't try to recover.
- The rendering scale is 1.5× (multiplied by device pixel ratio on HiDPI screens). This was chosen as a reasonable quality/performance balance.
- Annotations are saved as raster images in the output PDF, not as a real annotation layer. There is no way to edit them after downloading.
- The undo stack is in-memory only, capped at 50 states, and is lost on page reload.
- Page deletion and structural operations (reorder, insert) bypass the undo system entirely.
- When placing text, the "snap to nearest text style" threshold is 50 CSS pixels. Clicks farther than that from any PDF text use toolbar defaults.
- For highlight merging, two rectangles are considered on the same line if their vertical centers are within 50% of the box height of each other. A horizontal gap up to 8px between them is also tolerated (for spacing between words).
- Two rectangles that share only an edge (touching but not overlapping) are treated as overlapping — this is intentional so that consecutive highlighted words merge into one box.
- `localStorage` is used for recent signatures. If it's unavailable (e.g. some private browsing modes), recent signatures just won't appear.
- The `showSaveFilePicker` API is used when available. If the browser doesn't support it (Firefox, non-HTTPS contexts), a standard `<a download>` link is used as a fallback.

---

## Testing

### Running the Tests

```bash
npm test
```

This runs all unit tests once and exits. You should see:

```
✓ tests/unit/hexToRgba.test.js       (7 tests)
✓ tests/unit/pageNav.test.js         (9 tests)
✓ tests/unit/rectsOverlap.test.js    (8 tests)
✓ tests/unit/undo.test.js            (8 tests)
✓ tests/unit/validatePdfFile.test.js (8 tests)

Test Files  5 passed (5)
     Tests  40 passed (40)
```

To re-run automatically on save while developing:
```bash
npm run test:watch
```

To run a single file:
```bash
npx vitest run tests/unit/undo.test.js
```

### What's Being Tested

Tests are in `tests/unit/`. Each file extracts a pure function from the source and tests it in isolation — no browser, no DOM, no Fabric.js needed.

**`hexToRgba.test.js`** — `hexToRgba(hex, alpha)` in Tool.js. Converts a CSS hex color string to an `rgba(...)` string. Used any time a color needs to be applied with transparency (e.g. highlights at 0.4 opacity).

**`rectsOverlap.test.js`** — `rectsOverlap(a, b)` in Tool.js. Returns whether two axis-aligned rectangles overlap or touch. Used by the highlight merging logic.

**`validatePdfFile.test.js`** — `validatePdfFile(file)` in pdfview.js. Async function that checks MIME type and magic bytes. Returns an error string or `null`.

**`pageNav.test.js`** — The page navigation logic (goToPage, showPrevPage, showNextPage, queueRenderPage) extracted from pdfview.js. Tests boundary conditions, annotation saving as a side effect, sidebar updates, and the render-queue guard.

**`undo.test.js`** — The undo stack logic from Undo.js. Tests that Fabric.js events trigger saves, undo restores prior state, the stack caps at 50, and multiple sequential undos work correctly.

### Input Partitioning

#### `hexToRgba(hex, alpha)`

The main partitions are: primary/basic colors, alpha = 1 (fully opaque), alpha = 0.4 (highlight use case), alpha = 0 (transparent), lowercase hex digits, and the all-zeros case (black). One test per partition.

#### `rectsOverlap(a, b)`

Partitions: identical rects, partial (corner) overlap, containment (one inside the other), edge-only touching, separated horizontally, separated vertically, diagonal separation (no overlap), and a zero-size degenerate rect. The edge-touching case is important because the boundary condition uses `≤` — touching counts as overlapping.

#### `validatePdfFile(file)`

Invalid inputs: null, undefined, wrong MIME type (text/plain, image/png), correct MIME but wrong magic bytes, PNG magic bytes with PDF MIME. Valid inputs: correct MIME + correct magic bytes, and correct magic bytes with trailing garbage (only first 4 bytes are checked). The `File` API doesn't exist in Node, so the tests use a minimal mock object that provides `.type` and `.slice().arrayBuffer()`.

#### Page Navigation

Tested on a 5-page document. Partitions for `goToPage`: valid page in range, target = current (no-op), target = 0 (below range), target > numPages (above range). Side effects tested separately: annotations are saved before leaving the page, sidebar callback is triggered. For `showPrevPage`/`showNextPage`: already at the boundary (first/last page), and normal navigation from mid-document. The render-queue guard is tested by setting `pageIsRendering = true` before navigating — the render call should be deferred, not dropped.

#### Undo Stack

Partitions: empty stack on init, each of the three Fabric events (`object:added`, `object:modified`, `object:removed`) triggers a save, undo on empty stack clears canvas, undo on single-entry stack clears canvas, normal undo restores previous state, stack caps at 50 entries (60 events fired, length checked), and multiple sequential undos walk back through history correctly.

### Testing Framework Assumptions

The test runner is **Vitest 2.x**. A few things worth knowing if you're reading the tests:

- `describe`, `it`, `expect`, `vi`, `beforeEach` are all imported explicitly from `'vitest'` at the top of each file.
- `vi.fn()` creates a mock function that records all calls. `.mockReturnValue(x)` makes it always return `x`; `.mockReturnValueOnce(x)` makes it return `x` only on the next call.
- `vi.clearAllMocks()` in `beforeEach` resets call history so tests don't interfere with each other.
- Vitest runs in a Node environment by default (no DOM). This is fine here because all tested functions are pure logic with no DOM dependency. The `validatePdfFile` tests use a hand-rolled `File`-like mock for the same reason.
- Async tests use `async/await`. Vitest automatically waits for the returned promise.
- `.toBe()` is strict equality (`===`). `.toBeNull()` is equivalent to `.toBe(null)`. `.toHaveBeenCalledWith()` checks exact arguments.

### What Isn't Tested

The following areas depend on browser APIs and aren't covered by unit tests:

- PDF.js rendering (needs a real canvas and PDF worker)
- Fabric.js canvas interaction (needs DOM)
- pdf-lib PDF composition (needs full runtime)
- File input and drag-and-drop events
- Search highlight overlay
- localStorage (signatures)
- Keyboard shortcuts
- Print and Download
- Drag-to-reorder in the sidebar

These are tested manually by running the app in a browser.

---

## Known Bugs / Limitations

- The Highlight tool has to be reselected after navigating to a different page.
- After erasing something, selecting that area with the Select tool can visually restore it.
- Page deletion can't be undone.
- Annotations in the downloaded PDF are baked in as an image — not editable or searchable afterward.
- Password-protected PDFs are not supported.

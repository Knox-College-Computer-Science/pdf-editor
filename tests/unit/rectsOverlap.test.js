import { describe, it, expect } from 'vitest';

// Extracted from src/JS/Tool.js
const rectsOverlap = (a, b) =>
    !(b.x > a.x + a.width || b.x + b.width < a.x ||
      b.y > a.y + a.height || b.y + b.height < a.y);

describe('rectsOverlap', () => {
    it('returns true for identical rects', () => {
        const r = { x: 10, y: 10, width: 50, height: 50 };
        expect(rectsOverlap(r, r)).toBe(true);
    });

    it('returns true for clearly overlapping rects', () => {
        const a = { x: 0, y: 0, width: 100, height: 100 };
        const b = { x: 50, y: 50, width: 100, height: 100 };
        expect(rectsOverlap(a, b)).toBe(true);
    });

    it('returns true when one rect is inside the other', () => {
        const outer = { x: 0, y: 0, width: 200, height: 200 };
        const inner = { x: 50, y: 50, width: 50, height: 50 };
        expect(rectsOverlap(outer, inner)).toBe(true);
    });

    it('returns false for rects separated horizontally', () => {
        const a = { x: 0, y: 0, width: 50, height: 50 };
        const b = { x: 100, y: 0, width: 50, height: 50 };
        expect(rectsOverlap(a, b)).toBe(false);
    });

    it('returns false for rects separated vertically', () => {
        const a = { x: 0, y: 0, width: 50, height: 50 };
        const b = { x: 0, y: 100, width: 50, height: 50 };
        expect(rectsOverlap(a, b)).toBe(false);
    });

    it('returns false for rects in opposite corners', () => {
        const a = { x: 0, y: 0, width: 40, height: 40 };
        const b = { x: 60, y: 60, width: 40, height: 40 };
        expect(rectsOverlap(a, b)).toBe(false);
    });

    it('returns true for rects that touch on an edge', () => {
        // b.x === a.x + a.width → b.x + b.width < a.x is false, b.x > a.x+a.width is false → overlaps
        const a = { x: 0, y: 0, width: 50, height: 50 };
        const b = { x: 50, y: 0, width: 50, height: 50 };
        expect(rectsOverlap(a, b)).toBe(true);
    });

    it('handles zero-size rect', () => {
        const a = { x: 10, y: 10, width: 0, height: 0 };
        const b = { x: 0, y: 0, width: 50, height: 50 };
        expect(rectsOverlap(a, b)).toBe(true);
    });
});

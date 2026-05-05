import { describe, it, expect } from 'vitest';

// Extracted from src/JS/Tool.js
const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};

describe('hexToRgba', () => {
    it('converts red correctly', () => {
        expect(hexToRgba('#ff0000', 1)).toBe('rgba(255,0,0,1)');
    });

    it('converts green correctly', () => {
        expect(hexToRgba('#00ff00', 1)).toBe('rgba(0,255,0,1)');
    });

    it('converts blue correctly', () => {
        expect(hexToRgba('#0000ff', 1)).toBe('rgba(0,0,255,1)');
    });

    it('applies alpha for highlight (0.4)', () => {
        expect(hexToRgba('#ffff00', 0.4)).toBe('rgba(255,255,0,0.4)');
    });

    it('handles alpha = 0 (transparent)', () => {
        expect(hexToRgba('#ffffff', 0)).toBe('rgba(255,255,255,0)');
    });

    it('handles lowercase hex', () => {
        expect(hexToRgba('#aabbcc', 0.5)).toBe('rgba(170,187,204,0.5)');
    });

    it('handles black (#000000)', () => {
        expect(hexToRgba('#000000', 1)).toBe('rgba(0,0,0,1)');
    });
});

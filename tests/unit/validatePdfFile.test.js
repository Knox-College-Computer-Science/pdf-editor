import { describe, it, expect } from 'vitest';

// Extracted from src/JS/pdfview.js
const validatePdfFile = async (file) => {
    if (!file) return 'Please select a PDF file.';
    if (file.type !== 'application/pdf') return 'Please select a PDF file.';
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46) {
        return 'The selected file is not a PDF.';
    }
    return null;
};

// Minimal File-like mock
const makeFile = (bytes, type) => ({
    type,
    slice: (start, end) => ({
        arrayBuffer: async () => new Uint8Array(bytes.slice(start, end)).buffer,
    }),
});

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

describe('validatePdfFile', () => {
    it('returns error for null input', async () => {
        expect(await validatePdfFile(null)).toBe('Please select a PDF file.');
    });

    it('returns error for undefined input', async () => {
        expect(await validatePdfFile(undefined)).toBe('Please select a PDF file.');
    });

    it('returns error for wrong MIME type', async () => {
        const file = makeFile(PDF_MAGIC, 'text/plain');
        expect(await validatePdfFile(file)).toBe('Please select a PDF file.');
    });

    it('returns error for image MIME type', async () => {
        const file = makeFile(PDF_MAGIC, 'image/png');
        expect(await validatePdfFile(file)).toBe('Please select a PDF file.');
    });

    it('returns error when magic bytes are wrong even with correct MIME', async () => {
        const file = makeFile([0x00, 0x01, 0x02, 0x03], 'application/pdf');
        expect(await validatePdfFile(file)).toBe('The selected file is not a PDF.');
    });

    it('returns error for PNG file disguised as PDF', async () => {
        const pngMagic = [0x89, 0x50, 0x4e, 0x47]; // PNG header
        const file = makeFile(pngMagic, 'application/pdf');
        expect(await validatePdfFile(file)).toBe('The selected file is not a PDF.');
    });

    it('returns null for a valid PDF', async () => {
        const file = makeFile([...PDF_MAGIC, 0x2d, 0x31, 0x2e, 0x34], 'application/pdf');
        expect(await validatePdfFile(file)).toBeNull();
    });

    it('only checks first 4 bytes for magic', async () => {
        // Extra garbage after magic is fine for validation
        const file = makeFile([...PDF_MAGIC, 0xff, 0xff, 0xff], 'application/pdf');
        expect(await validatePdfFile(file)).toBeNull();
    });
});

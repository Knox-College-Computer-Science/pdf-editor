const getTextProps = () => ({
    fontFamily: document.getElementById('font-family').value,
    fontSize: parseInt(document.getElementById('font-size').value) || 20,
    fill: document.getElementById('color-picker').value,
});

const isTextObject = (obj) => obj && ['i-text', 'text', 'textbox'].includes(obj.type);

const getSelectionRange = (active) => {
    if (!active || !active.isEditing) return null;
    const start = typeof active.selectionStart === 'number' ? active.selectionStart : 0;
    const end = typeof active.selectionEnd === 'number' ? active.selectionEnd : start;
    return end > start ? { start, end } : null;
};

const getSelectionStyleValue = (active, styleKey) => {
    if (!active || !active.isEditing || typeof active.getSelectionStyles !== 'function') return undefined;
    const range = getSelectionRange(active);
    const start = range ? range.start : 0;
    const end = range ? range.end : (active.text || '').length;
    if (start === end) return undefined;
    const styles = active.getSelectionStyles(start, end);
    if (Array.isArray(styles)) {
        const values = styles
            .map(s => s && typeof s === 'object' ? s[styleKey] : undefined)
            .filter(v => v !== undefined);
        if (values.length === 0) return undefined;
        return values.every(v => v === values[0]) ? values[0] : undefined;
    }
    if (styles && typeof styles === 'object' && styleKey in styles) {
        return styles[styleKey];
    }
    return undefined;
};

const setSelectionStyles = (active, styles) => {
    if (!active) return;
    const range = getSelectionRange(active);
    const start = range ? range.start : 0;
    const end = range ? range.end : (active.text || '').length;
    if (typeof active.setSelectionStyles === 'function' && end > start) {
        active.setSelectionStyles(styles, start, end);
        return;
    }
    active.set(styles);
};

const toggleTextStyle = (styleKey, onValue, offValue) => {
    const active = fabricCanvas.getActiveObject();
    if (!isTextObject(active)) return;
    let current = getSelectionStyleValue(active, styleKey);
    if (current === undefined) {
        current = active[styleKey];
    }
    const nextValue = current === onValue ? offValue : onValue;
    setSelectionStyles(active, { [styleKey]: nextValue });
    active.setCoords && active.setCoords();
    fabricCanvas.requestRenderAll();
};

const toggleUnderline = () => {
    const active = fabricCanvas.getActiveObject();
    if (!isTextObject(active)) return;
    let current = getSelectionStyleValue(active, 'underline');
    if (current === undefined) {
        current = Boolean(active.underline);
    }
    setSelectionStyles(active, { underline: !current });
    active.setCoords && active.setCoords();
    fabricCanvas.requestRenderAll();
};

const toggleList = (type) => {
    const active = fabricCanvas.getActiveObject();
    if (!isTextObject(active)) return;
    const text = active.text || '';
    const makeLines = text.split('\n');
    let firstLine = 0;
    let lastLine = makeLines.length - 1;
    let selectionStart = 0;
    let selectionEnd = text.length;

    if (active.isEditing) {
        selectionStart = typeof active.selectionStart === 'number' ? active.selectionStart : 0;
        selectionEnd = typeof active.selectionEnd === 'number' ? active.selectionEnd : selectionStart;
        if (selectionEnd < selectionStart) [selectionStart, selectionEnd] = [selectionEnd, selectionStart];
        const before = text.slice(0, selectionStart);
        firstLine = before.split('\n').length - 1;
        const selected = text.slice(selectionStart, selectionEnd);
        const lineCount = selected.split('\n').length;
        lastLine = firstLine + lineCount - 1;
        if (selectionStart === selectionEnd) {
            lastLine = firstLine;
        }
    }

    const lines = text.split('\n');
    const range = lines.slice(firstLine, lastLine + 1);
    const isBullet = type === 'bullet';
    const prefixRegex = isBullet ? /^•\s/ : /^\d+\.\s/;
    const allPrefixed = range.every(line => prefixRegex.test(line));

    const transformed = lines.map((line, index) => {
        if (index < firstLine || index > lastLine) return line;
        const isBlank = line.trim() === '';
        if (allPrefixed) {
            return line.replace(prefixRegex, '');
        }
        if (isBlank) {
            return isBullet ? '• ' : `${index - firstLine + 1}. `;
        }
        if (isBullet) {
            return `• ${line}`;
        }
        const number = index - firstLine + 1;
        return `${number}. ${line}`;
    });

    const newText = transformed.join('\n');
    active.set('text', newText);
    active.setCoords && active.setCoords();
    fabricCanvas.requestRenderAll();

    // Position cursor appropriately based on whether the line has content
    if (active.isEditing && firstLine === lastLine) {
        const modifiedLine = transformed[firstLine];
        const bulletMatch = modifiedLine.match(/^(•\s)/);
        const numberedMatch = modifiedLine.match(/^(\d+\.\s)/);
        const prefix = bulletMatch || numberedMatch;
        if (prefix) {
            let newPos = 0;
            for (let i = 0; i < firstLine; i++) {
                newPos += (transformed[i] || '').length + 1; // +1 for newline
            }
            // If line has only the prefix (empty content), place cursor after prefix
            // Otherwise, place cursor at the end of the line
            if (modifiedLine.trim() === prefix[1].trim()) {
                newPos += prefix[1].length;
            } else {
                newPos += modifiedLine.length;
            }
            active.selectionStart = active.selectionEnd = newPos;
        }
    }
};

const updateTextToolVisibility = (isTextMode) => {
    ['tool-select', 'tool-draw', 'tool-eraser', 'tool-highlight'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = isTextMode ? 'none' : '';
    });
    const styleControls = document.getElementById('text-style-controls');
    if (styleControls) styleControls.style.display = isTextMode ? 'flex' : 'none';
};

const handleFontFamilyChange = () => {
    const obj = fabricCanvas.getActiveObject();
    if (!obj || !isTextObject(obj)) return;
    const newFamily = document.getElementById('font-family').value;
    
    if (obj.isEditing) {
        const range = getSelectionRange(obj);
        if (range && range.start !== range.end) {
            // Apply font family only to selected text
            setSelectionStyles(obj, { fontFamily: newFamily });
        } else {
            // No selection, apply to entire object
            obj.set('fontFamily', newFamily);
        }
    } else {
        // Object not being edited, apply to entire object
        obj.set('fontFamily', newFamily);
    }
    
    obj.setCoords && obj.setCoords();
    fabricCanvas.requestRenderAll();
};

const handleFontSizeChange = () => {
    const obj = fabricCanvas.getActiveObject();
    if (!obj || !isTextObject(obj)) return;
    const newSize = parseInt(document.getElementById('font-size').value) || 20;
    
    if (obj.isEditing) {
        const range = getSelectionRange(obj);
        if (range && range.start !== range.end) {
            // Apply font size only to selected text
            setSelectionStyles(obj, { fontSize: newSize });
        } else {
            // No selection, apply to entire object
            obj.set('fontSize', newSize);
        }
    } else {
        // Object not being edited, apply to entire object
        obj.set('fontSize', newSize);
    }
    
    obj.setCoords && obj.setCoords();
    fabricCanvas.requestRenderAll();
};

const applyStyleToControls = (style) => {
    const fontSelect = document.getElementById('font-family');
    const sizeInput = document.getElementById('font-size');
    const colorPicker = document.getElementById('color-picker');
    if (style.fontName) {
        const exists = [...fontSelect.options].some(o => o.value === style.fontName);
        if (exists) fontSelect.value = style.fontName;
    }
    if (style.fontSize) sizeInput.value = style.fontSize;
    if (style.color) colorPicker.value = style.color;
};

const syncFontControls = (e) => {
    const obj = e.selected?.[0];
    if (obj && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox')) {
        document.getElementById('font-family').value = obj.fontFamily || 'Arial';
        document.getElementById('font-size').value = obj.fontSize || 20;
        document.getElementById('color-picker').value = obj.fill || '#000000';
        document.getElementById('text-controls').classList.add('visible');
        // Visually activate Text button to show font/size info
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('tool-text').classList.add('active');
    }
};
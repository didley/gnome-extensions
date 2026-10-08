// Pure text/layout helpers (no GNOME imports, so they are unit-testable).

/** First non-blank line, trimmed; '' if there is none. */
export function firstLine(text) {
    return (text ?? '').split('\n').find(l => l.trim() !== '')?.trim() ?? '';
}

/** One-line label for menus. */
export function noteTitle(text, max = 32) {
    const line = firstLine(text);
    if (line === '') return 'Empty note';
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Turn the caret coordinates of every character position in a selection into
 * one highlight rectangle per visual line.
 *
 * @param {{x: number, y: number, h: number}[]} points  coords of positions start..end
 * @returns {{x1: number, x2: number, y: number, h: number}[]}
 */
export function selectionRows(points) {
    const rows = [];
    let prevX = 0;
    for (const {x, y, h} of points) {
        let row = rows.find(r => Math.abs(r.y - y) < 1);
        if (!row) {
            row = {y, h, x1: x, x2: x, charW: 0};
            rows.push(row);
        } else {
            row.x1 = Math.min(row.x1, x);
            row.x2 = Math.max(row.x2, x);
        }
        const step = x - prevX;
        row.charW = Math.max(row.charW, step > 0 && step < 40 ? step : 6);
        prevX = x;
    }
    // A selection that continues onto the next line covers the rest of this one.
    rows.forEach((r, i) => {
        if (i < rows.length - 1) r.x2 += r.charW || 6;
    });
    return rows.filter(r => r.x2 > r.x1).map(({x1, x2, y, h}) => ({x1, x2, y, h}));
}

/**
 * Start and end (character positions) of the line containing `pos`. A negative or
 * out-of-range `pos` means the end of the text, as Clutter.Text uses -1 for it.
 */
export function lineBounds(text, pos) {
    const chars = [...(text ?? '')];
    const p = pos < 0 || pos > chars.length ? chars.length : pos;
    let start = p;
    while (start > 0 && chars[start - 1] !== '\n') start--;
    let end = p;
    while (end < chars.length && chars[end] !== '\n') end++;
    return {start, end};
}

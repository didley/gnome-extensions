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

/** [start, end) of the whole lines touched by a selection; `end` stops before the newline. */
function lineRange(chars, start, end) {
    let lineStart = start;
    while (lineStart > 0 && chars[lineStart - 1] !== '\n') lineStart--;
    // a selection that ends just after a newline doesn't touch the line after it
    let lineEnd = end > start && chars[end - 1] === '\n' ? end - 1 : end;
    while (lineEnd < chars.length && chars[lineEnd] !== '\n') lineEnd++;
    return [lineStart, lineEnd];
}

/** What Tab inserts and indenting adds to a line. */
export const INDENT = '\t';

/**
 * Indent or outdent every line touched by a selection (or the caret's line).
 * Positions are character positions with start <= end. Outdent removes one leading tab,
 * or up to four leading spaces. The returned selection keeps covering the same text.
 *
 * @returns {{text: string, start: number, end: number}}
 */
export function shiftLines(text, start, end, outdent = false) {
    const chars = [...(text ?? '')];
    const [lineStart, lineEnd] = lineRange(chars, start, end);

    let firstDelta = 0;
    let totalDelta = 0;
    const lines = chars.slice(lineStart, lineEnd).join('').split('\n').map((line, i) => {
        let delta = 1;
        let out = `${INDENT}${line}`;
        if (outdent) {
            const lead = /^(\t| {1,4})/.exec(line)?.[0] ?? '';
            delta = -lead.length;
            out = line.slice(lead.length);
        }
        if (i === 0) firstDelta = delta;
        totalDelta += delta;
        return out;
    });

    const newStart = Math.max(lineStart, start + firstDelta);
    return {
        text: [...chars.slice(0, lineStart), ...lines.join('\n'), ...chars.slice(lineEnd)].join(''),
        start: newStart,
        end: Math.max(newStart, end + totalDelta),
    };
}

/**
 * The leading whitespace of the line containing `pos`, but only as far as `pos`: pressing Enter
 * in the middle of the indent shouldn't carry the part after the caret. A negative or
 * out-of-range `pos` means the end of the text.
 */
export function indentBefore(text, pos) {
    const chars = [...(text ?? '')];
    const p = pos < 0 || pos > chars.length ? chars.length : pos;
    let lineStart = p;
    while (lineStart > 0 && chars[lineStart - 1] !== '\n') lineStart--;
    let i = lineStart;
    while (i < p && (chars[i] === ' ' || chars[i] === '\t')) i++;
    return chars.slice(lineStart, i).join('');
}

/**
 * Move the lines touched by a selection up (dir -1) or down (+1) past their neighbour. The
 * selection moves with them. Returns null at the top or bottom of the text.
 *
 * @returns {{text: string, start: number, end: number} | null}
 */
export function moveLines(text, start, end, dir) {
    const chars = [...(text ?? '')];
    const [ls, le] = lineRange(chars, start, end);
    const block = chars.slice(ls, le).join('');
    const before = chars.slice(0, ls);
    const after = chars.slice(le);

    if (dir < 0) {
        if (ls === 0) return null;
        let prevStart = ls - 1; // the newline before this block
        while (prevStart > 0 && chars[prevStart - 1] !== '\n') prevStart--;
        const prev = chars.slice(prevStart, ls - 1).join('');
        const shift = [...prev].length + 1;
        return {
            text: [...before.slice(0, prevStart), ...block, '\n', ...prev, ...after].join(''),
            start: start - shift,
            end: end - shift,
        };
    }
    if (le >= chars.length) return null;
    let nextEnd = le + 1; // the newline after this block
    while (nextEnd < chars.length && chars[nextEnd] !== '\n') nextEnd++;
    const next = chars.slice(le + 1, nextEnd).join('');
    const shift = [...next].length + 1;
    return {
        text: [...before, ...next, '\n', ...block, ...chars.slice(nextEnd)].join(''),
        start: start + shift,
        end: end + shift,
    };
}

/**
 * What pressing Enter at `pos` should do. A new line keeps the indentation of the line it was
 * pressed on; on a line that holds only an indent, Enter clears that indent instead, which is
 * how you end an indented block.
 *
 * @returns {{remove: [number, number] | null, at: number, insert: string, caret: number}}
 *   `remove` is deleted first, then `insert` goes in at `at`, then the caret moves to `caret`.
 */
export function enterEdit(text, pos) {
    const chars = [...(text ?? '')];
    const p = pos < 0 || pos > chars.length ? chars.length : pos;
    const {start} = lineBounds(text, p);
    const before = chars.slice(start, p);
    if (before.length > 0 && before.every(c => c === ' ' || c === '\t'))
        return {remove: [start, p], at: start, insert: '\n', caret: start + 1};
    const indent = indentBefore(text, p);
    return {remove: null, at: p, insert: `\n${indent}`, caret: p + 1 + [...indent].length};
}

// Pure helpers for the persisted note records.
import {DEFAULT_COLOR} from './colors.js';

const DEFAULT_W = 220;
const DEFAULT_H = 200;
const CASCADE = 28;

/** Fill in any missing/invalid fields of a stored note. */
export function normalizeNote(raw, id, monitor) {
    const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
    return {
        id: num(raw?.id, id),
        text: typeof raw?.text === 'string' ? raw.text : '',
        color: raw?.color ?? DEFAULT_COLOR,
        x: num(raw?.x, monitor.x + 100),
        y: num(raw?.y, monitor.y + 100),
        w: num(raw?.w, DEFAULT_W),
        h: num(raw?.h, DEFAULT_H),
        collapsed: !!raw?.collapsed,
        minimized: !!raw?.minimized,
    };
}

/** A new note: offset from `from` if given (same colour), else top-centre of the monitor. */
export function newNoteRecord(monitor, from = null) {
    return {
        text: '',
        color: from?.color ?? DEFAULT_COLOR,
        x: from ? from.x + CASCADE : monitor.x + Math.round(monitor.width / 2) - DEFAULT_W / 2,
        y: from ? from.y + CASCADE : monitor.y + 80,
        w: DEFAULT_W,
        h: DEFAULT_H,
    };
}

// Pure placement helpers.

export const HEADER_H = 22;
export const MIN_W = 140;
export const MIN_H = 90;

/**
 * Keep a dragged note reachable: at least `margin` px of it must stay on the
 * monitor horizontally, and its header must stay fully visible vertically.
 */
export function clampPosition(x, y, width, monitor, margin = 60) {
    return {
        x: Math.round(Math.max(monitor.x - width + margin, Math.min(monitor.x + monitor.width - margin, x))),
        y: Math.round(Math.max(monitor.y, Math.min(monitor.y + monitor.height - HEADER_H, y))),
    };
}

export function clampSize(w, h) {
    return {w: Math.round(Math.max(MIN_W, w)), h: Math.round(Math.max(MIN_H, h))};
}

import Clutter from 'gi://Clutter';

/**
 * Track the pointer from the moment a button went down until it is released.
 * Uses a stage grab so the release is always delivered, wherever the pointer is.
 *
 * @param {Clutter.Actor} source  the actor that received the press
 * @param {{x: number, y: number}} start  press coordinates
 * @param {(dx: number, dy: number) => void} onMove  offset from the press point
 * @param {() => void} onEnd
 * @returns {() => void} stop function (safe to call more than once)
 */
export function trackPointer(source, start, onMove, onEnd) {
    const grab = global.stage.grab(source);
    let id = source.connect('captured-event', (a, ev) => {
        switch (ev.type()) {
        case Clutter.EventType.MOTION: {
            const [x, y] = ev.get_coords();
            onMove(x - start.x, y - start.y);
            return Clutter.EVENT_STOP;
        }
        case Clutter.EventType.BUTTON_RELEASE:
        case Clutter.EventType.TOUCH_END:
        case Clutter.EventType.TOUCH_CANCEL:
            stop();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    function stop() {
        if (!id) return;
        try { source.disconnect(id); } catch (e) { /* source already destroyed */ }
        id = 0;
        try { grab.dismiss(); } catch (e) { /* already dismissed */ }
        onEnd();
    }
    return stop;
}

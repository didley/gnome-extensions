// Input helpers built on Clutter's gesture/controller classes. These replace the
// direct event signals (captured-event & co.), which GNOME 51 deprecates.
import Clutter from 'gi://Clutter';

/**
 * The shell has its own pan/edge-drag gestures on the stage (overview and workspace
 * swipes). By default, whichever gesture recognises first cancels the others, and
 * theirs cancel ours partway through a drag (mostly vertical ones). Let ours and
 * theirs recognise side by side.
 * @param {Clutter.Gesture} gesture
 */
function coexistWithShell(gesture) {
    for (const other of global.stage.get_actions()) {
        if (other instanceof Clutter.Gesture && other !== gesture) {
            gesture.can_not_cancel(other);
            other.can_not_cancel(gesture);
        }
    }
}

/**
 * Click gesture on `actor`.
 * @param {Clutter.Actor} actor
 * @param {{button?: number, clicks?: number, onPress?: boolean,
 *          shouldHandle?: (event: Clutter.Event) => boolean,
 *          onClick: (gesture: Clutter.ClickGesture) => void}} opts
 *   onPress: fire as soon as the button goes down instead of on release.
 */
export function addClick(actor, {button = Clutter.BUTTON_PRIMARY, clicks = 1, onPress = false, shouldHandle, onClick}) {
    const gesture = new Clutter.ClickGesture();
    gesture.set_required_button(button);
    gesture.set_n_clicks_required(clicks);
    gesture.set_recognize_on_press(onPress);
    if (shouldHandle) gesture.connect('should-handle-sequence', (g, event) => shouldHandle(event));
    gesture.connect('recognize', () => onClick(gesture));
    actor.add_action(gesture);
    coexistWithShell(gesture);
    return gesture;
}

/**
 * Primary-button drag on `actor`. Offsets are in stage pixels from where the
 * drag began.
 * @param {Clutter.Actor} actor
 * @param {{shouldHandle?: (event: Clutter.Event) => boolean,
 *          onBegin?: () => void, onMove: (dx: number, dy: number) => void,
 *          onEnd?: () => void}} opts
 */
export function addDrag(actor, {shouldHandle, onBegin, onMove, onEnd}) {
    const pan = new Clutter.PanGesture();
    pan.set_required_button(Clutter.BUTTON_PRIMARY);
    pan.set_min_n_points(1);
    pan.set_max_n_points(1);
    pan.set_begin_threshold(4); // so a double-click isn't mistaken for a drag
    if (shouldHandle) pan.connect('should-handle-sequence', (g, event) => shouldHandle(event));
    pan.connect('recognize', () => onBegin?.());
    pan.connect('pan-update', () => {
        const now = pan.get_centroid_abs();
        const start = pan.get_begin_centroid_abs();
        onMove(now.x - start.x, now.y - start.y);
    });
    pan.connect('end', () => onEnd?.());
    pan.connect('cancel', () => onEnd?.());
    actor.add_action(pan);

    coexistWithShell(pan);
    return pan;
}

/**
 * Key presses on `actor`.
 * @param {Clutter.Actor} actor
 * @param {(keyval: number, state: number) => boolean} onKey  return true to swallow the key
 */
export function addKeys(actor, onKey) {
    const keys = new Clutter.KeyController();
    keys.connect('key-press', () => {
        const [, keyval] = keys.get_key();
        const [, state] = keys.get_state();
        return onKey(keyval, state) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    });
    actor.add_action(keys);
    return keys;
}

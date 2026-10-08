// Input helpers built on Clutter's gesture/controller classes. These replace the
// direct event signals (captured-event & co.), which GNOME 51 deprecates.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

/**
 * The shell has its own pan/edge-drag gestures on the stage (overview and workspace
 * swipes). By default, whichever gesture recognises first cancels the others, and
 * theirs cancel ours partway through a drag (mostly vertical ones). Let ours and
 * theirs recognise side by side. Pass `alongside` for widgets that have gestures of
 * their own that ours must not cancel (a text field's click and selection handling).
 * @param {Clutter.Gesture} gesture
 * @param {Clutter.Actor[]} [alongside]
 */
function coexist(gesture, alongside = []) {
    for (const holder of [global.stage, ...alongside]) {
        for (const other of holder.get_actions()) {
            if (other instanceof Clutter.Gesture && other !== gesture) {
                gesture.can_not_cancel(other);
                other.can_not_cancel(gesture);
            }
        }
    }
}

/**
 * Click gesture on `actor`.
 * @param {Clutter.Actor} actor
 * @param {{button?: number, clicks?: number, onPress?: boolean, alongside?: Clutter.Actor[],
 *          shouldHandle?: (event: Clutter.Event) => boolean,
 *          onClick: (gesture: Clutter.ClickGesture) => void}} opts
 *   onPress: fire as soon as the button goes down instead of on release.
 */
export function addClick(actor, {button = Clutter.BUTTON_PRIMARY, clicks = 1, onPress = false, alongside = [], shouldHandle, onClick}) {
    const gesture = new Clutter.ClickGesture();
    gesture.set_required_button(button);
    gesture.set_n_clicks_required(clicks);
    gesture.set_recognize_on_press(onPress);
    if (shouldHandle) gesture.connect('should-handle-sequence', (g, event) => shouldHandle(event));
    gesture.connect('recognize', () => onClick(gesture));
    actor.add_action(gesture);
    coexist(gesture, alongside);
    return gesture;
}

/**
 * Primary-button drag on `actor`. Offsets are in stage pixels from where the
 * drag began.
 *
 * While a drag is in progress the pointer is grabbed on `grabActor`. Without
 * that, the shell's own stage gestures see the same pointer events and cancel
 * the drag partway through (the drag only survived once a note already held a
 * grab, e.g. with the text focused).
 * @param {Clutter.Actor} actor
 * @param {{grabActor?: Clutter.Actor,
 *          shouldHandle?: (event: Clutter.Event) => boolean,
 *          onBegin?: () => void, onMove: (dx: number, dy: number) => void,
 *          onEnd?: () => void}} opts
 */
export function addDrag(actor, {grabActor = actor, shouldHandle, onBegin, onMove, onEnd}) {
    const pan = new Clutter.PanGesture();
    pan.set_required_button(Clutter.BUTTON_PRIMARY);
    pan.set_min_n_points(1);
    pan.set_max_n_points(1);
    pan.set_begin_threshold(4); // so a double-click isn't mistaken for a drag

    let grab = null;
    let safety = 0;
    const release = () => {
        if (safety) { GLib.source_remove(safety); safety = 0; }
        if (!grab) return;
        const g = grab;
        grab = null;
        try { g.dismiss(); } catch (e) { /* already dismissed */ }
    };

    // Called as the button goes down, before any gesture has been decided.
    pan.connect('should-handle-sequence', (g, event) => {
        const handle = shouldHandle ? shouldHandle(event) : true;
        if (handle && !grab) {
            grab = global.stage.grab(grabActor);
            // A stuck grab would freeze all pointer input, so never keep one for long.
            safety = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 20, () => { safety = 0; release(); return GLib.SOURCE_REMOVE; });
        }
        return handle;
    });
    // Back to idle / completed / cancelled all mean the sequence is over.
    pan.connect('notify::state', () => {
        if (pan.state !== Clutter.GestureState.POSSIBLE && pan.state !== Clutter.GestureState.RECOGNIZING)
            release();
    });
    actor.connect('destroy', release);

    pan.connect('recognize', () => onBegin?.());
    pan.connect('pan-update', () => {
        const now = pan.get_centroid_abs();
        const start = pan.get_begin_centroid_abs();
        onMove(now.x - start.x, now.y - start.y);
    });
    pan.connect('end', () => onEnd?.());
    pan.connect('cancel', () => onEnd?.());
    actor.add_action(pan);
    coexist(pan);
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

import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DELAY_MS = 450;

/**
 * St has no tooltips, so show a small label under `widget` after a short hover.
 * @returns {() => void} hide function (call on destroy)
 */
export function addTooltip(widget, getText) {
    let timeout = 0;
    let tip = null;

    const hide = () => {
        if (timeout) { GLib.source_remove(timeout); timeout = 0; }
        tip?.destroy();
        tip = null;
    };

    widget.connect('notify::hover', () => {
        hide();
        if (!widget.hover) return;
        timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DELAY_MS, () => {
            timeout = 0;
            tip = new St.Label({text: getText(), style_class: 'sticky-tooltip'});
            Main.uiGroup.add_child(tip);
            const [x, y] = widget.get_transformed_position();
            const m = Main.layoutManager.primaryMonitor;
            const tx = Math.min(Math.max(m.x, x + widget.width / 2 - tip.width / 2), m.x + m.width - tip.width);
            tip.set_position(Math.round(tx), Math.round(y + widget.height + 4));
            return GLib.SOURCE_REMOVE;
        });
    });
    widget.connect('destroy', hide);
    return hide;
}

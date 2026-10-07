import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as GrabHelper from 'resource:///org/gnome/shell/ui/grabHelper.js';
import {selectionRows} from './textutil.js';

/**
 * Right-click menu for a NoteText.
 *
 * A custom menu rather than PopupMenu: PopupMenu moves key focus to itself, and
 * Clutter.Text then stops painting its selection. This menu grabs the pointer
 * but hands key focus back to the text, and paints the selection itself while
 * it is open.
 */
export class TextMenu {
    /** @param {import('./textbox.js').NoteText} noteText */
    constructor(noteText) {
        this._noteText = noteText;
        this._box = null;
        this._grab = null;
        this._highlight = [];
    }

    get isOpen() { return this._box !== null; }

    open(x, y) {
        this.close();
        const nt = this._noteText;
        const hasSel = !!nt.selection;
        const box = new St.BoxLayout({
            style_class: 'sticky-menu',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
        });
        const item = (label, action, enabled = true) => box.add_child(this._item(label, action, enabled));
        const sep = () => box.add_child(new St.Widget({style_class: 'sticky-menu-sep'}));

        item('Undo', () => nt.undo(), nt.canUndo);
        item('Redo', () => nt.redo(), nt.canRedo);
        sep();
        item('Cut', () => nt.cut(), hasSel);
        item('Copy', () => nt.copy(), hasSel);
        item('Paste', () => nt.paste());
        sep();
        item('Select All', () => nt.selectAll(), nt.text !== '');

        Main.uiGroup.add_child(box);
        const m = Main.layoutManager.primaryMonitor;
        const [, w] = box.get_preferred_width(-1);
        const [, h] = box.get_preferred_height(-1);
        box.set_position(
            Math.round(Math.min(x, m.x + m.width - w - 4)),
            Math.round(Math.min(y, m.y + m.height - h - 4)));

        this._box = box;
        this._grab = new GrabHelper.GrabHelper(box);
        this._grab.grab({actor: box, focus: nt.actor, onUngrab: () => this.close()});
        nt.focus();
        this._paintSelection();
    }

    close() {
        const box = this._box;
        if (!box) return;
        this._box = null;
        this._clearSelection();
        try { this._grab?.ungrab({actor: box}); } catch (e) { /* already ungrabbed */ }
        this._grab = null;
        box.destroy();
        this._noteText.focus();
    }

    _item(label, action, enabled) {
        const button = new St.Button({
            style_class: 'sticky-menu-item',
            can_focus: false,
            reactive: enabled,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            child: new St.Label({text: label, x_expand: true, x_align: Clutter.ActorAlign.START}),
        });
        if (!enabled) button.add_style_class_name('disabled');
        button.connect('clicked', () => {
            this.close();
            action();
        });
        return button;
    }

    // Paint translucent rectangles over the selected text (see class comment).
    _paintSelection() {
        this._clearSelection();
        const t = this._noteText.actor;
        if (!this._noteText.selection) return;

        const len = [...this._noteText.text].length;
        const caret = t.get_cursor_position();
        const bound = t.get_selection_bound();
        const a = caret < 0 ? len : caret;
        const b = bound < 0 ? len : bound;

        const points = [];
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            const [ok, x, y, h] = t.position_to_coords(i);
            if (ok) points.push({x, y, h});
        }
        const [ox, oy] = t.get_transformed_position();
        this._highlight = selectionRows(points).map(r => {
            const rect = new St.Widget({
                style: 'background-color: rgba(0, 90, 220, 0.35); border-radius: 2px;',
                reactive: false,
            });
            rect.set_position(Math.round(ox + r.x1), Math.round(oy + r.y));
            rect.set_size(Math.max(2, Math.round(r.x2 - r.x1)), Math.round(r.h));
            Main.uiGroup.add_child(rect);
            return rect;
        });
        Main.uiGroup.set_child_above_sibling(this._box, null); // menu stays above the highlight
    }

    _clearSelection() {
        this._highlight.forEach(r => r.destroy());
        this._highlight = [];
    }
}

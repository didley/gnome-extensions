import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Cogl from 'gi://Cogl';
import {History} from './history.js';
import {TextMenu} from './textmenu.js';
import {addKeys} from './gestures.js';

/** @type {[number, number, number, number]} */
const INK = [0.17, 0.17, 0.17, 1];

/** @param {[number, number, number, number]} rgbaValues */
function rgba([r, g, b, a]) {
    const c = new Cogl.Color();
    c.init_from_4f(r, g, b, a);
    return c;
}

/**
 * The editable text of a note.
 *
 * A bare Clutter.Text rather than St.Entry: it fills the whole note and draws
 * from the top (St.Entry centres vertically). The price is that clipboard,
 * undo/redo and the context menu have to be provided here.
 */
export class NoteText {
    /** @param {string} initial  @param {(text: string) => void} onChange */
    constructor(initial, onChange) {
        this._history = new History(initial);
        this._applying = false;

        const t = this.actor = new Clutter.Text({
            editable: true,
            reactive: true,
            selectable: true,
            single_line_mode: false,
            activatable: false,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            font_name: 'Sans 10',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        t.color = rgba(INK);
        t.cursor_color = rgba(INK);
        t.selection_color = rgba([0, 0, 0, 0.2]);
        t.set_text(initial);

        t.connect('text-changed', () => {
            const text = t.get_text();
            if (!this._applying) this._history.record(text, GLib.get_monotonic_time() / 1000);
            onChange(text);
        });
        addKeys(t, (key, state) => this._onKey(key, state));

        this.menu = new TextMenu(this);
    }

    get text() { return this.actor.get_text(); }
    get selection() { return this.actor.get_selection(); }
    get canUndo() { return this._history.canUndo; }
    get canRedo() { return this._history.canRedo; }

    focus() { this.actor.grab_key_focus(); }

    copy() {
        const sel = this.selection;
        if (sel) St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, sel);
    }

    cut() {
        if (!this.selection) return;
        this.copy();
        this.actor.delete_selection();
    }

    paste() {
        const t = this.actor;
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (c, str) => {
            if (!str) return;
            t.delete_selection();
            const pos = t.get_cursor_position();
            t.insert_text(str, pos);
            t.set_cursor_position(pos < 0 ? -1 : pos + [...str].length);
        });
    }

    selectAll() { this.actor.set_selection(0, -1); }

    undo() { this._show(this._history.undo(this.text)); }
    redo() { this._show(this._history.redo(this.text)); }

    // Replace the text without recording it as a new edit.
    _show(text) {
        if (text === null) return;
        this._applying = true;
        this.actor.set_text(text);
        this._applying = false;
        this.actor.set_cursor_position(-1);
    }

    /** @returns {boolean} true if the key was handled */
    _onKey(key, state) {
        if (this.menu.isOpen && key === Clutter.KEY_Escape) {
            this.menu.close();
            return true;
        }
        if (!(state & Clutter.ModifierType.CONTROL_MASK)) return false;
        const shift = !!(state & Clutter.ModifierType.SHIFT_MASK);

        switch (key) {
        case Clutter.KEY_c: case Clutter.KEY_C: this.copy(); break;
        case Clutter.KEY_x: case Clutter.KEY_X: this.cut(); break;
        case Clutter.KEY_v: case Clutter.KEY_V: this.paste(); break;
        case Clutter.KEY_a: case Clutter.KEY_A: this.selectAll(); break;
        case Clutter.KEY_y: case Clutter.KEY_Y: this.redo(); break;
        case Clutter.KEY_z: case Clutter.KEY_Z:
            if (shift) this.redo(); else this.undo();
            break;
        default:
            return false;
        }
        return true;
    }

    destroy() {
        this.menu.close();
    }
}

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import {History} from './history.js';
import {TextMenu} from './textmenu.js';
import {addKeys} from './gestures.js';

/** @type {[number, number, number, number]} */
/**
 * The editable text of a note: a multi-line St.Entry, the same widget the shell
 * uses for its own text fields, so the caret, selection colours and
 * Ctrl+C / X / V / A come from the theme and St. Undo/redo and the context
 * menu are ours (St.Entry has neither).
 */
export class NoteText {
    /** @param {string} initial  @param {(text: string) => void} onChange */
    constructor(initial, onChange) {
        this._history = new History(initial);
        this._applying = false;

        // `widget` is what goes in the layout; `actor` is its Clutter.Text, which
        // has the text API (selection, caret, ...) and is where key focus lives.
        this.widget = new St.Entry({
            style_class: 'sticky-entry',
            can_focus: true,
            x_expand: true,
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
        });
        const t = this.actor = this.widget.get_clutter_text();
        t.set_single_line_mode(false);
        t.set_activatable(false); // Enter inserts a new line
        t.set_line_wrap(true);
        t.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        t.set_text(initial);

        t.connect('text-changed', () => {
            const text = t.get_text();
            if (!this._applying) this._history.record(text, GLib.get_monotonic_time() / 1000);
            onChange(text);
        });
        addKeys(this.widget, (key, state) => this._onKey(key, state));

        this.menu = new TextMenu(this);
    }

    get text() { return this.actor.get_text(); }
    get selection() { return this.actor.get_selection(); }
    get canUndo() { return this._history.canUndo; }
    get canRedo() { return this._history.canRedo; }

    focus() { this.widget.grab_key_focus(); }

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
        case Clutter.KEY_y: case Clutter.KEY_Y: this.redo(); break;
        case Clutter.KEY_z: case Clutter.KEY_Z:
            if (shift) this.redo(); else this.undo();
            break;
        default:
            return false; // copy / cut / paste / select all: St.Entry handles them
        }
        return true;
    }

    destroy() {
        this.menu.close();
    }
}

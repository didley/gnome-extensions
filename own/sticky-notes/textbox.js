import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import {History} from './history.js';
import {TextMenu} from './textmenu.js';
import {shiftLines, moveLines, enterEdit} from './textutil.js';
import {addKeys} from './gestures.js';

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
        t.set_line_wrap(true);
        t.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        t.set_text(initial);

        t.connect('text-changed', () => {
            const text = t.get_text();
            if (!this._applying) this._history.record(text, GLib.get_monotonic_time() / 1000);
            onChange(text);
        });
        // Enter is "activate", not "insert a newline", so the new line (and its indent) goes
        // in as one edit of ours: when the widget inserts the newline itself it moves the
        // caret after any change we make in reaction to it.
        t.set_activatable(true);
        t.connect('activate', () => this._onEnter());
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

    /** The selection (or caret) as character positions with start <= end. */
    _range() {
        const t = this.actor;
        const len = [...this.text].length;
        const caret = t.get_cursor_position();
        const bound = t.get_selection_bound();
        const a = caret < 0 ? len : caret;
        const b = bound < 0 ? len : bound;
        return a <= b ? [a, b] : [b, a];
    }

    /** Replace the whole text as one undoable edit, then select [start, end]. */
    _replaceText(r) {
        const t = this.actor;
        t.set_text(r.text); // goes through 'text-changed', so it is one undo step
        t.set_selection(r.start, r.end);
    }

    /** Tab / Shift+Tab. A selection over several lines indents them all; otherwise Tab types a tab character. */
    _indent(outdent) {
        const t = this.actor;
        const [start, end] = this._range();
        const spansLines = [...this.text].slice(start, end).includes('\n');

        if (!outdent && !spansLines) {
            t.delete_selection();
            const pos = t.get_cursor_position();
            t.insert_text('\t', pos);
            t.set_cursor_position(pos < 0 ? -1 : pos + 1);
            return;
        }
        const r = shiftLines(this.text, start, end, outdent);
        if (r.text !== this.text) this._replaceText(r);
    }

    /** Enter: a new line that keeps the current line's indent (see enterEdit). */
    _onEnter() {
        const t = this.actor;
        t.delete_selection();
        const edit = enterEdit(this.text, t.get_cursor_position());
        if (edit.remove) t.delete_text(...edit.remove);
        t.insert_text(edit.insert, edit.at);
        t.set_cursor_position(edit.caret);
    }

    /** Alt+Up / Alt+Down: move the current line (or the selected lines). */
    _moveLines(dir) {
        const [start, end] = this._range();
        const r = moveLines(this.text, start, end, dir);
        if (r) this._replaceText(r);
    }

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
        const shift = !!(state & Clutter.ModifierType.SHIFT_MASK);
        const ctrl = !!(state & Clutter.ModifierType.CONTROL_MASK);

        // Tab indents (Shift+Tab outdents) instead of moving focus; Ctrl+Tab is left for switching.
        if ((key === Clutter.KEY_Tab || key === Clutter.KEY_ISO_Left_Tab) && !ctrl) {
            this._indent(shift || key === Clutter.KEY_ISO_Left_Tab);
            return true;
        }
        const alt = !!(state & Clutter.ModifierType.MOD1_MASK);

        if (alt && !ctrl && (key === Clutter.KEY_Up || key === Clutter.KEY_Down)) {
            this._moveLines(key === Clutter.KEY_Up ? -1 : 1);
            return true;
        }
        if (!ctrl) return false;

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

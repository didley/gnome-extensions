import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as GrabHelper from 'resource:///org/gnome/shell/ui/grabHelper.js';

import {colorPair, nextColor} from './colors.js';
import {clampPosition, clampSize} from './geometry.js';
import {noteTitle, firstLine} from './textutil.js';
import {addClick, addDrag} from './gestures.js';
import {DoubleClick} from './doubleclick.js';
import {addTooltip} from './tooltip.js';
import {NoteText} from './textbox.js';

/**
 * One sticky note: a header with controls, an editable body and a resize grip,
 * drawn as a shell actor above the app windows.
 */
export class Note {
    /**
     * @param {{path: string, newNote(from: Note): void, deleteNote(note: Note): void, changed(): void}} manager
     * @param {{text: string, color: string, x: number, y: number, w: number, h: number,
     *          collapsed: boolean, minimized: boolean}} data  persisted state (mutated in place)
     */
    constructor(manager, data) {
        this._manager = manager;
        this.data = data;
        this._cleanups = [];
        this._headerClicks = new DoubleClick();
        this._onChrome = false;

        this._build();
        this._applyColor();
        this._applyCollapsed();
        this.actor.set_position(data.x, data.y);
        this.actor.visible = !data.minimized;
        try {
            Main.layoutManager.addChrome(this.actor); // above app windows
            this._onChrome = true;
        } catch (err) {
            this.destroy();
            throw err;
        }
    }

    get isMinimized() { return !!this.data.minimized; }
    get title() { return noteTitle(this.data.text); }

    // Building --------------------------------------------------------------------

    _build() {
        this.actor = new St.BoxLayout({
            name: 'sticky-note-actor',
            style_class: 'sticky-note',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            track_hover: true,
        });
        this.actor.connect('notify::hover', () => this._updateButtons());
        this.actor.add_child(this._buildHeader());
        this.actor.add_child(this._buildBody());
        this.actor.add_child(this._buildFooter());
        this._updateButtons();
    }

    _buildHeader() {
        const header = this._header = new St.BoxLayout({style_class: 'sticky-header', reactive: true, x_expand: true});

        const button = (icon, tip, onClick) => {
            const b = new St.Button({
                style_class: 'sticky-btn',
                can_focus: false,
                child: new St.Icon({icon_name: icon, icon_size: 12}),
            });
            b.connect('clicked', onClick);
            this._cleanups.push(addTooltip(b, tip));
            return b;
        };
        this._newBtn = button('list-add-symbolic', () => 'New note', () => this._manager.newNote(this));
        this._colorBtn = button('color-select-symbolic', () => `Change color (${this.data.color})`, () => this.setColor(nextColor(this.data.color)));
        this._minBtn = button('window-minimize-symbolic', () => 'Minimize to the panel menu', () => this.minimize());
        this._collapseBtn = button('pan-down-symbolic', () => (this.data.collapsed ? 'Expand note' : 'Collapse note'), () => this.toggleCollapsed());
        this._closeBtn = button('window-close-symbolic', () => 'Delete note', () => this.requestDelete());
        this._buttons = [this._newBtn, this._colorBtn, this._minBtn, this._collapseBtn, this._closeBtn];

        // Collapsed notes show the first line of text where the title would be.
        this._preview = new St.Label({style_class: 'sticky-preview', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._preview.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        this._preview.clutter_text.set_single_line_mode(true);

        // GNOME window styling: actions on the left, window controls on the right.
        for (const child of [this._newBtn, this._colorBtn, this._preview, this._minBtn, this._collapseBtn, this._closeBtn])
            header.add_child(child);

        // Dragging the header moves the note; double-clicking it collapses. Presses on the
        // header buttons are left to the buttons.
        // The double-click is timed here rather than with a ClickGesture: the drag takes a pointer
        // grab as the button goes down, and that cancels any other gesture waiting to recognise.
        let origin = null;
        addDrag(header, {
            grabActor: this.actor,
            shouldHandle: event => {
                if (this._isOnButton(event)) return false;
                if (this._headerClicks.press(GLib.get_monotonic_time() / 1000)) {
                    this.toggleCollapsed();
                    return false; // a double-click is not the start of a drag
                }
                return true;
            },
            onBegin: () => { origin = {x: this.actor.x, y: this.actor.y}; this.raise(); },
            onMove: (dx, dy) => {
                const pos = clampPosition(origin.x + dx, origin.y + dy, this.actor.width, Main.layoutManager.primaryMonitor);
                Object.assign(this.data, pos);
                this.actor.set_position(pos.x, pos.y);
            },
            onEnd: () => this._manager.changed(),
        });
        return header;
    }

    _buildBody() {
        this._text = new NoteText(this.data.text ?? '', text => {
            this.data.text = text;
            this._updatePreview();
            this._manager.changed();
        });
        const box = new St.BoxLayout({x_expand: true, y_expand: true, style: 'padding: 6px 10px;'});
        box.add_child(this._text.widget);

        this._body = new St.ScrollView({
            x_expand: true,
            y_expand: true,
            overlay_scrollbars: true,
            clip_to_allocation: true,
            // never scroll sideways: the text wraps to the note's width and fills it
            hscrollbar_policy: St.PolicyType.NEVER,
        });
        this._body.set_child(box);

        // A note is not a window, so keyboard focus needs an explicit grab on click.
        // actionMode NORMAL keeps shell shortcuts (Alt+Tab, workspace switching) working while
        // the note has focus; the default (NONE) disables them for the duration of the grab.
        this._grabHelper = new GrabHelper.GrabHelper(this.actor, {actionMode: Shell.ActionMode.NORMAL});
        // Switching to another window (Alt+Tab) ends the note's keyboard grab, so typing goes
        // to that window. A null focus window is just the grab itself taking focus: ignore it.
        const focusId = global.display.connect('notify::focus-window', () => {
            if (this._grabbed && global.display.focus_window)
                this._grabHelper.ungrab({actor: this.actor});
        });
        this._cleanups.push(() => global.display.disconnect(focusId));
        // On the whole body, not just the text widget: an empty note's text is only one line tall.
        addClick(this._body, {onPress: true, onClick: g => { this.raise(); this._focusText(g.get_coords_abs().y); }});
        addClick(this._body, {
            button: Clutter.BUTTON_SECONDARY,
            onPress: true,
            onClick: g => {
                const {x, y} = g.get_coords_abs();
                this.raise();
                this._focusText(y);
                this._text.menu.open(x, y);
            },
        });
        return this._body;
    }

    _buildFooter() {
        // A drawn triangle that touches its bounding box on the right and bottom,
        // so the gaps to the note's edges are equal (a text glyph isn't).
        this._grip = new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${this._manager.path}/icons/grip.svg`)),
            icon_size: 8,
            style_class: 'sticky-grip',
            reactive: true,
        });
        this._grip.set_cursor_type(Clutter.CursorType.NWSE_RESIZE);
        let size = null;
        addDrag(this._grip, {
            grabActor: this.actor,
            onBegin: () => { size = {w: this.actor.width, h: this.actor.height}; },
            onMove: (dx, dy) => {
                const next = clampSize(size.w + dx, size.h + dy);
                Object.assign(this.data, next);
                this.actor.set_size(next.w, next.h);
                    },
            onEnd: () => this._manager.changed(),
        });

        this._footer = new St.BoxLayout({x_expand: true});
        this._footer.add_child(new St.Widget({x_expand: true}));
        this._footer.add_child(this._grip);
        return this._footer;
    }

    // State -----------------------------------------------------------------------

    _applyColor() {
        const [body, header] = colorPair(this.data.color);
        this.actor.style = `background-color: ${body};`;
        this._header.style = `background-color: ${header};`;
    }

    _applyCollapsed() {
        const d = this.data;
        this._body.visible = this._footer.visible = !d.collapsed;
        if (d.collapsed) this.actor.add_style_class_name('collapsed');
        else this.actor.remove_style_class_name('collapsed');
        this.actor.set_size(d.w, d.collapsed ? -1 : d.h);
        this._updatePreview();
    }

    _updatePreview() {
        this._preview.text = this.data.collapsed ? firstLine(this.data.text) : '';
    }

    _updateButtons() {
        // Hidden, not just transparent, so the collapsed preview gets the width.
        for (const b of this._buttons) b.visible = this.actor.hover;
        /** @type {St.Icon} */ (this._collapseBtn.child).icon_name = this.data.collapsed ? 'pan-end-symbolic' : 'pan-down-symbolic';
    }

    setColor(name) {
        this.data.color = name;
        this._applyColor();
        this._manager.changed();
    }

    toggleCollapsed() {
        this.data.collapsed = !this.data.collapsed;
        this._applyCollapsed();
        this._updateButtons();
        this._manager.changed();
    }

    minimize() {
        this.data.minimized = true;
        this.actor.visible = false;
        this._manager.changed();
    }

    restore() {
        this.data.minimized = false;
        this.actor.visible = true;
        this.raise();
        this._manager.changed();
    }

    raise() {
        this.actor.get_parent()?.set_child_above_sibling(this.actor, null);
    }

    /** Ask before deleting a note that has content; empty notes go straight away. */
    requestDelete() {
        if ((this.data.text ?? '').trim() === '') {
            this._manager.deleteNote(this);
            return;
        }
        const dialog = new ModalDialog.ModalDialog({destroyOnClose: true});
        dialog.contentLayout.add_child(new St.Label({
            text: 'Delete this note?\nThis can’t be undone.',
            style: 'text-align: center; font-size: 13px; padding: 8px 12px;',
        }));
        dialog.addButton({label: 'Cancel', action: () => dialog.close(), key: Clutter.KEY_Escape});
        dialog.addButton({
            label: 'Delete',
            default: true,
            action: () => {
                dialog.close();
                this._manager.deleteNote(this);
            },
        });
        dialog.open();
    }

    // Input -----------------------------------------------------------------------

    _isOnButton(event) {
        const src = global.stage.get_event_actor(event); // event.get_source() is null on GNOME 50
        return !!src && this._buttons.some(b => src === b || b.contains(src));
    }

    /**
     * A note is not a window, so keyboard focus needs an explicit grab on click. The
     * application that had focus is told it lost it, so its own caret and selection go inactive.
     * @param {number} [y]  stage y of the click; below the text puts the caret at the end
     */
    _focusText(y) {
        if (!this._grabbed) {
            this._grabbed = true;
            this._grabHelper.grab({
                actor: this.actor,
                focus: this._text.widget,
                onUngrab: () => { this._grabbed = false; },
            });
            global.display.unset_input_focus(global.get_current_time());
        }
        this._text.focus();
        if (y !== undefined) {
            const [, top] = this._text.widget.get_transformed_position();
            if (y > top + this._text.widget.height) this._text.actor.set_cursor_position(-1);
        }
    }

    // Teardown --------------------------------------------------------------------

    destroy() {
        // Each step is guarded so one failure can never leave the actor on screen.
        const safe = fn => { try { fn(); } catch (e) { console.error(`[Sticky Notes] destroy: ${e}`); } };
        safe(() => this._cleanups.forEach(c => c()));
        safe(() => this._text?.destroy());
        safe(() => this._grabHelper?.ungrab({actor: this.actor}));
        safe(() => { if (this._onChrome) Main.layoutManager.removeChrome(this.actor); });
        safe(() => this.actor.destroy());
    }
}

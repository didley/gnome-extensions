import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as GrabHelper from 'resource:///org/gnome/shell/ui/grabHelper.js';

import {colorPair, nextColor} from './colors.js';
import {clampPosition, clampSize} from './geometry.js';
import {noteTitle, firstLine} from './textutil.js';
import {trackPointer} from './drag.js';
import {addTooltip} from './tooltip.js';
import {NoteText} from './textbox.js';

const DOUBLE_CLICK_MS = 300;

/**
 * One sticky note: a header with controls, an editable body and a resize grip,
 * drawn as a shell actor above the app windows.
 */
export class Note {
    /**
     * @param {{newNote(from: Note): void, deleteNote(note: Note): void, changed(): void}} manager
     * @param {{text: string, color: string, x: number, y: number, w: number, h: number,
     *          collapsed: boolean, minimized: boolean}} data  persisted state (mutated in place)
     */
    constructor(manager, data) {
        this._manager = manager;
        this.data = data;
        this._lastPress = 0;
        this._stopDrag = null;
        this._cleanups = [];
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
        header.connect('captured-event', (a, event) => this._onHeaderEvent(event));

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
        return header;
    }

    _buildBody() {
        this._text = new NoteText(this.data.text ?? '', text => {
            this.data.text = text;
            this._updatePreview();
            this._manager.changed();
        });
        const box = new St.BoxLayout({x_expand: true, y_expand: true, style: 'padding: 6px 10px;'});
        box.add_child(this._text.actor);

        this._body = new St.ScrollView({x_expand: true, y_expand: true, overlay_scrollbars: true, clip_to_allocation: true});
        this._body.set_child(box);
        // Stretch the text to fill the whole note (not just its own height) so a
        // click or double-click anywhere in the body acts on the text, like a normal input.
        this._body.connect('notify::height', () => { box.min_height = this._body.height; });

        // A note is not a window, so keyboard focus needs an explicit grab on click.
        this._grabHelper = new GrabHelper.GrabHelper(this.actor);
        this._body.connect('captured-event', (a, event) => this._onBodyEvent(event));
        return this._body;
    }

    _buildFooter() {
        this._grip = new St.Label({text: '◢', style_class: 'sticky-grip', reactive: true});
        this._grip.set_cursor_type(Clutter.CursorType.NWSE_RESIZE);
        this._grip.connect('captured-event', (a, event) => this._onGripEvent(event));

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
        this._collapseBtn.child.icon_name = this.data.collapsed ? 'pan-end-symbolic' : 'pan-down-symbolic';
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

    _onHeaderEvent(event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
            event.get_button() !== Clutter.BUTTON_PRIMARY ||
            this._isOnButton(event))
            return Clutter.EVENT_PROPAGATE;

        // Double-click collapses; a single press starts a drag.
        const now = GLib.get_monotonic_time() / 1000;
        if (now - this._lastPress < DOUBLE_CLICK_MS) {
            this._lastPress = 0;
            this._stopDrag?.();
            this.toggleCollapsed();
            return Clutter.EVENT_STOP;
        }
        this._lastPress = now;
        this.raise();

        const [px, py] = event.get_coords();
        const [ox, oy] = [this.actor.x, this.actor.y];
        this._drag(this._header, {x: px, y: py}, (dx, dy) => {
            const pos = clampPosition(ox + dx, oy + dy, this.actor.width, Main.layoutManager.primaryMonitor);
            Object.assign(this.data, pos);
            this.actor.set_position(pos.x, pos.y);
        });
        return Clutter.EVENT_STOP;
    }

    _onGripEvent(event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS ||
            event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        const [px, py] = event.get_coords();
        const [w, h] = [this.actor.width, this.actor.height];
        this._drag(this._grip, {x: px, y: py}, (dx, dy) => {
            const size = clampSize(w + dx, h + dy);
            Object.assign(this.data, size);
            this.actor.set_size(size.w, size.h);
        });
        return Clutter.EVENT_STOP;
    }

    _onBodyEvent(event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS) return Clutter.EVENT_PROPAGATE;
        this.raise();

        if (event.get_button() === Clutter.BUTTON_SECONDARY) {
            const [x, y] = event.get_coords();
            this._text.menu.open(x, y);
            return Clutter.EVENT_STOP;
        }
        if (!this._grabbed) {
            this._grabbed = true;
            this._grabHelper.grab({
                actor: this.actor,
                focus: this._text.actor,
                onUngrab: () => { this._grabbed = false; },
            });
            this._text.focus();
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _drag(source, start, onMove) {
        this._stopDrag?.();
        this._stopDrag = trackPointer(source, start, onMove, () => {
            this._stopDrag = null;
            this._manager.changed();
        });
    }

    // Teardown --------------------------------------------------------------------

    destroy() {
        // Each step is guarded so one failure can never leave the actor on screen.
        const safe = fn => { try { fn(); } catch (e) { console.error(`[Sticky Notes] destroy: ${e}`); } };
        safe(() => this._stopDrag?.());
        safe(() => this._cleanups.forEach(c => c()));
        safe(() => this._text?.destroy());
        safe(() => this._grabHelper?.ungrab({actor: this.actor}));
        safe(() => { if (this._onChrome) Main.layoutManager.removeChrome(this.actor); });
        safe(() => this.actor.destroy());
    }
}

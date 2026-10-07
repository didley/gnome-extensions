// notes@maestroschan.fr/extension.js
// GPL v3
// Copyright 2018-2021 Romain F. T.

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import St from 'gi://St';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import Clutter from 'gi://Clutter';
import * as NoteBox from './noteBox.js';

//------------------------------------------------------------------------------

const PATH = GLib.build_pathv('/', [GLib.get_user_data_dir(), 'notes@maestroschan.fr']);
// which is usually ~/.local/share/notes@maestroschan.fr

// Global variables accessible by NoteBox
export var NOTES_MANAGER;
export var SETTINGS;
export var LAYER_SETTING;
export var AUTO_FOCUS;

//------------------------------------------------------------------------------

/*
 * A singleton that manages the button in the top bar, and thus provides the
 * actions of loading, showing, hiding, creating (and in some way saving and
 * destroying) all the notes.
 * If no note exists, it will create the first one itself, otherwise it serves
 * as a middleman between the note whose "new" button has been pressed and the
 * new one.
 */
class NotesManager {
	constructor() {
		// Initialisation of the button in the top panel
		this.panel_button = new PanelMenu.Button(0.0, _("Show notes"), false);
		let icon = new St.Icon({
			icon_name: 'document-edit-symbolic',
			style_class: 'system-status-icon'
		});
		this.panel_button.add_child(icon);
		this.panel_button.connect(
			'button-press-event',
			this._onButtonPressed.bind(this)
		);
		this._updateIconVisibility();
		// `0` is the position within the chosen box (here, the `right` one)
		Main.panel.addToStatusArea('NotesButton', this.panel_button, 0, 'right');

		// Initialisation of the notes themselves
		this._allNotes = new Array();
		this._notesAreVisible = false;
		this._updateLayerSetting(); // it inits LAYER_SETTING

		this._notesLoaded = false; // this will tell the toggleState method that
		// notes need to be loaded first, thus doing the actual initialisation

		// Initialisation of the signals connections
		this._bindKeyboardShortcut();
		this._connectAllSignals();
		
		// Connect desktop menu after a short delay to ensure layout manager is ready
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
			try {
				this._connectDesktopMenu();
			} catch (e) {
				log('Error connecting desktop menu: ' + e);
			}
			return GLib.SOURCE_REMOVE;
		});
	}

	_bindKeyboardShortcut () {
		this._useKeyboardShortcut = SETTINGS.get_boolean('use-shortcut');
		if (this._useKeyboardShortcut) {
			Main.wm.addKeybinding(
				'notes-kb-shortcut',
				SETTINGS,
				Meta.KeyBindingFlags.NONE,
				Shell.ActionMode.ALL,
				this._onButtonPressed.bind(this)
			);
		}
	}

	_loadAllNotes () {
		let i = 0;
		let ended = false;
		while(!ended) {
			let file2 = GLib.build_filenamev([PATH, i.toString() + '_state']);
			if (GLib.file_test(file2, GLib.FileTest.EXISTS)) {
				this.createNote('', 16);
			} else {
				ended = true;
			}
			i++;
		}
		this._onlyHideNotes();
		this._notesLoaded = true;
	}

	//--------------------------------------------------------------------------
	// "Public" methods, accessed by the NoteBox objects -----------------------

	createNote (colorString, fontSize) {
		let nextId = this._allNotes.length;
		try {
			this._allNotes.push(new NoteBox.NoteBox(nextId, colorString, fontSize));
		} catch (e) {
			Main.notify(_("Notes extension error: failed to load a note"));
			log('failed to create note n°' + nextId.toString());
			log(e);
		}
	}

	/*
	 * When a NoteBox object deletes itself, it calls this method to ensure the
	 * files go from 0 to (this._allNotes.length - 1) without any "gap" in the
	 * numerotation.
	 */
	postDelete (deletedNoteId) {
		let lastNote = this._allNotes.pop();
		if (deletedNoteId < this._allNotes.length) {
			this._allNotes[deletedNoteId] = lastNote;
			lastNote.id = deletedNoteId;
			this._allNotes[deletedNoteId].onlySave();
		}
		this._deleteNoteFiles(this._allNotes.length);
	}

	/*
	 * Tells if [x, y] are suitable coords for a note (= not too close of the
	 * other existing notes). Called by NoteBox objects on various occasions,
	 * for example when brought back to the primary monitor, or when deciding
	 * the initial coords at the creation of the note.
	 */
	areCoordsUsable (x, y) {
		let areaIsFree = true;
		this._allNotes.forEach(function (n) {
			if( (Math.abs(n._x - x) < 230) && (Math.abs(n._y - y) < 100) ) {
				areaIsFree = false;
			}
		});
		return areaIsFree;
	}

	notesNeedChromeTracking () {
		return this._layerId == 'above-all';
	}

	//--------------------------------------------------------------------------

	_showNotes () {
		this._notesAreVisible = true;
		this._allNotes.forEach(function (n) {
			n.show();
		});
	}

	_hideNotes () {
		this._onlyHideNotes();
		this._timeout_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
			this._timeout_id = null;
			// saving to the disk is slightly delayed to give the illusion that
			// the extension doesn't freeze the system
			this._allNotes.forEach(function (n) {
				n.onlySave(false);
			});
			return GLib.SOURCE_REMOVE;
		});
	}

	_onlyHideNotes () {
		this._allNotes.forEach(function (n) {
			n.onlyHide();
		});
		this._notesAreVisible = false;
	}

	_deleteNoteFiles (id) {
		let filePathBeginning = PATH + '/' + id.toString();
		let textfile = Gio.file_new_for_path(filePathBeginning + '_text');
		let statefile = Gio.file_new_for_path(filePathBeginning + '_state');
		textfile.delete(null); // may not do anything
		statefile.delete(null); // may not do anything
	}

	_onButtonPressed () {
		if(!this._notesLoaded) {
			this._loadAllNotes();
		}
		// log('_onButtonPressed');

		let preventReshowing = false;
		if(LAYER_SETTING === 'cycle-layers') {
			this._allNotes.forEach(function (n) {
				n.removeFromCorrectLayer();
			});

			// the notes' visibility will be inverted later
			if(!this._notesAreVisible) {
				this._layerId = 'on-background';
				this._notesAreVisible = false;
			} else if(this._layerId === 'on-background') {
				this._layerId = 'above-all';
				this._notesAreVisible = false;
				preventReshowing = true;
			} else if(this._layerId === 'above-all') {
				this._layerId = 'above-all';
				this._notesAreVisible = true;
			}

			this._allNotes.forEach(function (n) {
				n.loadIntoCorrectLayer();
			});
		}

		if(this._allNotes.length == 0) {
			this.createNote('', 16);
			this._showNotes();
		} else if (this._notesAreVisible) {
			this._hideNotes();
		} else if (preventReshowing) {
			this._notesAreVisible = true;
		} else {
			this._showNotes();
		}
	}

	//--------------------------------------------------------------------------
	// Watch the gsettings values and update the extension if they change ------

	_connectAllSignals () {
		this._settingsSignals = {};

		this._settingsSignals['layout'] = SETTINGS.connect(
			'changed::layout-position',
			this._updateLayerSetting.bind(this)
		);
		this._settingsSignals['bring-back'] = SETTINGS.connect(
			'changed::ugly-hack',
			this._bringToPrimaryMonitorOnly.bind(this)
		);
		this._settingsSignals['hide-icon'] = SETTINGS.connect(
			'changed::hide-icon',
			this._updateIconVisibility.bind(this)
		);
		this._settingsSignals['kb-shortcut-1'] = SETTINGS.connect(
			'changed::use-shortcut',
			this._updateShortcut.bind(this)
		);
		this._settingsSignals['kb-shortcut-2'] = SETTINGS.connect(
			'changed::notes-kb-shortcut',
			this._updateShortcut.bind(this)
		);
		this._settingsSignals['auto-focus'] = SETTINGS.connect(
			'changed::auto-focus',
			this._updateFocusSetting.bind(this)
		);
	}

	_updateShortcut () {
		if(this._useKeyboardShortcut) {
			Main.wm.removeKeybinding('notes-kb-shortcut');
		}
		this._bindKeyboardShortcut();
	}

	_updateFocusSetting () {
		// XXX currently not very user-friendly
		Main.notify(
			_("Notes"),
			_("Restart the extension to apply the changes")
		);
	}

	_updateIconVisibility () {
		let now_visible = !SETTINGS.get_boolean('hide-icon');
		this.panel_button.visible = now_visible;
	}

	_bringToPrimaryMonitorOnly () {
		this._allNotes.forEach(function (n) {
			n.fixState();
		});
	}

	/*
	 * Remove all the notes from where they are, and add them to the layer that
	 * is actually set by the user. Possible values for the layers can be
	 * 'above-all', 'on-background' or 'cycle-layers'.
	 */
	_updateLayerSetting () {
		this._allNotes.forEach(function (n) {
			n.removeFromCorrectLayer();
		});

		LAYER_SETTING = SETTINGS.get_string('layout-position');
		this._layerId = (LAYER_SETTING == 'on-background')
			? 'on-background'
			: 'above-all'
		;

		this._allNotes.forEach(function (n) {
			n.loadIntoCorrectLayer();
		});

		if(!this._notesAreVisible) {
			this._onlyHideNotes();
		}
	}

	//--------------------------------------------------------------------------
	// Desktop context menu integration -----------------------------------------

	_connectDesktopMenu() {
		// Based on: https://discourse.gnome.org/t/is-it-possible-to-add-an-entry-to-desktops-context-menu/21177
		// The background menu needs to be accessed from Main.layoutManager._bgManagers
		// We'll try multiple times with delays since it might not be ready immediately
		
		let attempts = 0;
		let maxAttempts = 10;
		
		let tryAddMenuItem = () => {
			attempts++;
			try {
				let bgManagers = Main.layoutManager._bgManagers;
				if (bgManagers && bgManagers.length > 0) {
					let bgManager = bgManagers[0];
					if (bgManager && bgManager.backgroundActor && bgManager.backgroundActor._backgroundMenu) {
						this._addMenuItemToDesktopMenu(bgManager.backgroundActor._backgroundMenu);
						log('Successfully added "New Note" to desktop context menu');
						return true;
					}
				}
			} catch (e) {
				log('Error accessing desktop menu (attempt ' + attempts + '): ' + e);
			}
			
			if (attempts < maxAttempts) {
				// Try again after a delay
				GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
					return tryAddMenuItem();
				});
			} else {
				log('Failed to add menu item to desktop menu after ' + maxAttempts + ' attempts');
			}
			return false;
		};
		
		// Start trying to add the menu item
		tryAddMenuItem();
	}

	_addMenuItemToDesktopMenu(menu) {
		// Add "New Note" menu item to the existing desktop menu
		if (this._desktopMenuItem) {
			log('Menu item already added, skipping');
			return; // Already added
		}
		
		if (!menu) {
			log('Menu is null, cannot add item');
			return;
		}
		
		try {
			this._desktopMenuItem = new PopupMenu.PopupMenuItem(_("New Note"));
			this._desktopMenuItem.icon = new St.Icon({
				icon_name: 'document-edit-symbolic',
				icon_size: 16
			});
			this._desktopMenuItem.connect('activate', () => {
				log('New Note menu item activated');
				this._createNoteFromDesktop();
			});
			
			// Add at the beginning of the menu (position 0)
			menu.addMenuItem(this._desktopMenuItem, 0);
			log('Added "New Note" menu item to desktop context menu');
		} catch (e) {
			log('Error adding menu item: ' + e);
		}
	}

	_showDesktopNoteMenu(event) {
		// Get event coordinates
		let [x, y] = event.get_coords();
		this._showDesktopNoteMenuAt(x, y);
	}
	
	_showDesktopNoteMenuAt(x, y) {
		// Create a popup menu for the desktop
		if (!this._desktopMenu) {
			this._desktopMenu = new PopupMenu.PopupMenu(null, 0.0, St.Side.LEFT);
			Main.uiGroup.add_actor(this._desktopMenu.actor);
			
			let menuItem = new PopupMenu.PopupMenuItem(_("New Note"));
			menuItem.icon = new St.Icon({
				icon_name: 'document-edit-symbolic',
				icon_size: 16
			});
			menuItem.connect('activate', () => {
				this._createNoteFromDesktop();
				if (this._desktopMenu) {
					this._desktopMenu.close();
				}
			});
			this._desktopMenu.addMenuItem(menuItem);
			log('Created desktop note menu');
		}
		
		// Open the menu at the specified coordinates
		try {
			this._desktopMenu.open(St.Side.LEFT, x, y);
			log('Showing desktop note menu at ' + x + ', ' + y);
		} catch (e) {
			log('Error showing desktop menu: ' + e);
		}
	}

	_createNoteFromDesktop() {
		// Ensure notes are loaded
		if(!this._notesLoaded) {
			this._loadAllNotes();
		}
		
		// Create a new note with default settings
		let defaultColor = SETTINGS.get_strv('first-note-rgb');
		let colorString = (parseFloat(defaultColor[0]) * 255).toString() + ',' +
		                  (parseFloat(defaultColor[1]) * 255).toString() + ',' +
		                  (parseFloat(defaultColor[2]) * 255).toString();
		
		this.createNote(colorString, 16);
		
		// Show the notes if they're not visible
		if (!this._notesAreVisible) {
			this._showNotes();
		}
	}

	//--------------------------------------------------------------------------

	destroy() {
		SETTINGS.disconnect(this._settingsSignals['layout']);
		SETTINGS.disconnect(this._settingsSignals['bring-back']);
		SETTINGS.disconnect(this._settingsSignals['hide-icon']);
		SETTINGS.disconnect(this._settingsSignals['kb-shortcut-1']);
		SETTINGS.disconnect(this._settingsSignals['kb-shortcut-2']);
		SETTINGS.disconnect(this._settingsSignals['auto-focus']);

		this._allNotes.forEach(function (n) {
			n.onlySave(false);
			n.destroy();
		});

		if(this._useKeyboardShortcut) {
			Main.wm.removeKeybinding('notes-kb-shortcut');
		}

		this.panel_button.destroy();

		if (this._timeout_id) {
			GLib.source_remove(this._timeout_id);
			this._timeout_id = null;
		}
		
		// Clean up desktop menu
		if (this._desktopMenu) {
			this._desktopMenu.destroy();
			this._desktopMenu = null;
		}
		
		// Remove menu item from desktop menu if it was added
		if (this._desktopMenuItem) {
			try {
				let bgManagers = Main.layoutManager._bgManagers;
				if (bgManagers && bgManagers.length > 0) {
					let backgroundActor = bgManagers[0].backgroundActor;
					if (backgroundActor && backgroundActor._backgroundMenu) {
						backgroundActor._backgroundMenu.removeMenuItem(this._desktopMenuItem);
					}
				}
			} catch (e) {
				// Ignore errors during cleanup
			}
			this._desktopMenuItem.destroy();
			this._desktopMenuItem = null;
		}
		
		// Disconnect desktop menu handler
		if (this._desktopMenuId) {
			let backgroundGroup = Main.layoutManager._backgroundGroup;
			backgroundGroup.disconnect(this._desktopMenuId);
			this._desktopMenuId = null;
		}
	}
}

//------------------------------------------------------------------------------

export default class NotesExtension extends Extension {
	constructor(metadata) {
		super(metadata);
		
		// Create data directory if it doesn't exist
		try {
			let a = Gio.file_new_for_path(PATH);
			if (!a.query_exists(null)) {
				a.make_directory(null);
			}
		} catch (e) {
			log(e.message);
		}
		
		LAYER_SETTING = '';
	}

	enable() {
		// Get settings and initialize
		SETTINGS = this.getSettings();
		AUTO_FOCUS = SETTINGS.get_boolean('auto-focus');
		
		NOTES_MANAGER = new NotesManager();
	}

	disable() {
		if (NOTES_MANAGER) {
			NOTES_MANAGER.destroy();
			NOTES_MANAGER = null;
		}

		if (SETTINGS) {
			SETTINGS = null;
		}
	}
}

//------------------------------------------------------------------------------

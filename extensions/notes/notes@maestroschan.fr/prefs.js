// notes@maestroschan.fr/prefs.js
// GPL v3
// Copyright 2018-2021 Romain F. T.

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

//------------------------------------------------------------------------------

export default class NotesPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window) {
		const settings = this.getSettings();
		
		// Get extension path - try common locations
		let possiblePaths = [
			GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/notes@maestroschan.fr',
			'/usr/share/gnome-shell/extensions/notes@maestroschan.fr',
		];
		
		let extensionPath = possiblePaths[0]; // Default to user directory
		for (let path of possiblePaths) {
			let file = Gio.File.new_for_path(path + '/prefs.ui');
			if (file.query_exists(null)) {
				extensionPath = path;
				break;
			}
		}
		
		// Load the UI file
		let builder = new Gtk.Builder();
		builder.add_from_file(extensionPath + '/prefs.ui');
		
		// Get the notebook
		let notebook = builder.get_object('prefs_stack');
		
		// Create AdwPreferencesPage for each notebook page
		let pageTitles = [_("Settings"), _("Backup"), _("Help"), _("About")];
		let pageIcons = ['preferences-other-symbolic', 'system-file-manager-symbolic', 
		                 'help-faq-symbolic', 'help-about-symbolic'];
		
		// Extract pages from notebook and create AdwPreferencesPage for each
		// First, collect all pages before removing them
		let pages = [];
		let numPages = notebook.get_n_pages();
		for (let i = 0; i < numPages; i++) {
			let child = notebook.get_nth_page(i);
			let tabLabel = notebook.get_tab_label_text(child);
			if (!tabLabel && i < pageTitles.length) {
				tabLabel = pageTitles[i];
			}
			pages.push({child: child, title: tabLabel, index: i});
		}
		
		// Store created pages to add them in correct order
		let createdPages = [];
		
		// Now create AdwPreferencesPage for each and remove from notebook
		// We iterate backwards when removing to avoid index shifting issues
		for (let i = pages.length - 1; i >= 0; i--) {
			let pageInfo = pages[i];
			let child = pageInfo.child;
			let tabLabel = pageInfo.title;
			let originalIndex = pageInfo.index;
			
			// Remove page from notebook first (before reparenting)
			notebook.remove_page(pageInfo.index);
			
			// Create a new preferences page
			let page = new Adw.PreferencesPage({
				title: tabLabel,
				icon_name: (originalIndex < pageIcons.length) ? pageIcons[originalIndex] : 'preferences-other-symbolic'
			});
			
			let group = new Adw.PreferencesGroup();
			
			// Add the child to the group (this will reparent it)
			group.add(child);
			page.add(group);
			
			// Store with original index to maintain order
			createdPages.push({page: page, index: originalIndex});
		}
		
		// Add pages to window in the correct order (Settings, Backup, Help, About)
		createdPages.sort((a, b) => a.index - b.index);
		for (let pageInfo of createdPages) {
			window.add(pageInfo.page);
		}
		
		// Now build the settings page with all the controls
		this._buildSettingsPage(builder, settings);
		this._buildHelpPage(builder, settings, extensionPath);
		this._buildAboutPage(builder, extensionPath);
	}
	
	_buildSettingsPage(builder, settings) {
		let RELOAD_TEXT = _("Modifications will be effective after reloading the extension.");

		// Position of the notes (layer)
		let radioBtn1 = builder.get_object('radio1');
		let radioBtn2 = builder.get_object('radio2');
		let radioBtn3 = builder.get_object('radio3');
		switch (settings.get_string('layout-position')) {
			case 'above-all':
				radioBtn1.set_active(true);
			break;
			case 'on-background':
				radioBtn2.set_active(true);
			break;
			case 'cycle-layers':
				radioBtn3.set_active(true);
			break;
			default: break;
		}
		this._connectRadioBtn('above-all', radioBtn1, settings);
		this._connectRadioBtn('on-background', radioBtn2, settings);
		this._connectRadioBtn('cycle-layers', radioBtn3, settings);

		//----------------------------------------------------------------------

		let focus_switch = builder.get_object('focus_switch');
		focus_switch.set_state(settings.get_boolean('auto-focus'));
		focus_switch.connect('notify::active', (widget) => {
			settings.set_boolean('auto-focus', widget.active);
		});

		//----------------------------------------------------------------------

		// The "hide icon" switch has to be build before the keybinding switch
		let hide_switch = builder.get_object('hide_switch');
		hide_switch.set_state(settings.get_boolean('hide-icon'));
		hide_switch.connect('notify::active', (widget) => {
			settings.set_boolean('hide-icon', widget.active);
		});

		//----------------------------------------------------------------------

		// Context: %s will be replaced with the default keyboard shortcut
		let default_kbs_label = _("Default value is %s");
		default_kbs_label = default_kbs_label.replace('%s', "<Super><Alt>n");

		// Text entry
		let keybinding_entry = builder.get_object('keybinding_entry');
		keybinding_entry.set_sensitive(settings.get_boolean('use-shortcut'));
		keybinding_entry.set_tooltip_text(default_kbs_label);

		builder.get_object('default-kbs-help-1').set_label(default_kbs_label);
		builder.get_object('default-kbs-help-2').set_label(RELOAD_TEXT);

		if (settings.get_strv('notes-kb-shortcut') != '') {
			keybinding_entry.text = settings.get_strv('notes-kb-shortcut')[0];
		}

		// "Apply" button
		let keybinding_button = builder.get_object('keybinding_button');
		keybinding_button.set_sensitive(settings.get_boolean('use-shortcut'));

		keybinding_button.connect('clicked', (widget) => {
			settings.set_strv('notes-kb-shortcut', [keybinding_entry.text]);
		});

		// "Enable shortcut" switch
		let keybinding_switch = builder.get_object('keybinding_switch');
		keybinding_switch.set_state(settings.get_boolean('use-shortcut'));

		keybinding_switch.connect('notify::active', (widget) => {
			settings.set_boolean('use-shortcut', widget.active);
			keybinding_entry.sensitive = widget.active;
			keybinding_button.sensitive = widget.active;
			hide_switch.sensitive = widget.active;
		});

		//----------------------------------------------------------------------

		// The default color of the very first note
		let color_btn = builder.get_object('default_rgb_btn');
		let colorArray = settings.get_strv('first-note-rgb');
		let rgba = new Gdk.RGBA();
		rgba.red = parseFloat(colorArray[0]);
		rgba.green = parseFloat(colorArray[1]);
		rgba.blue = parseFloat(colorArray[2]);
		rgba.alpha = 1.0;
		color_btn.set_rgba(rgba);

		color_btn.connect('color-set', (widget) => {
			rgba = widget.get_rgba();
			settings.set_strv('first-note-rgb', [
				rgba.red.toString(),
				rgba.green.toString(),
				rgba.blue.toString()
			]);
		});
	}

	_connectRadioBtn(strId, widget, settings) {
		widget.connect('toggled', (widget) => {
			if (widget.active) {
				settings.set_string('layout-position', strId);
			}
		});
	}

	//--------------------------------------------------------------------------

	_buildHelpPage(builder, settings, extensionPath) {
		// Hardcoded URL since we don't have access to metadata in prefs context
		let help_url = "https://github.com/maoschanz/notes-extension-gnome/blob/master/user-help/README.md";
		builder.get_object('help_btn').set_uri(help_url);

		let data_button = builder.get_object('backup_btn');
		data_button.connect('clicked', (widget) => {
			let datadir = GLib.build_pathv('/', [GLib.get_user_data_dir(), 'notes@maestroschan.fr']);
			GLib.spawn_command_line_async('xdg-open ' + datadir);
		});

		let reset_button = builder.get_object('reset_btn');
		reset_button.connect('clicked', (widget) => {
			settings.set_boolean('ugly-hack', !settings.get_boolean('ugly-hack'));
		});
	}

	//--------------------------------------------------------------------------

	_buildAboutPage(builder, extensionPath) {
		builder.get_object('about_icon').set_from_pixbuf(
			GdkPixbuf.Pixbuf.new_from_file_at_size(extensionPath +
		                             '/screenshots/about_picture.png', 163, 114)
		);

		// Version is not easily accessible in prefs context, using placeholder
		let ext_version = _("Version %s").replace('%s', '24');
		builder.get_object('label_version').set_label(ext_version)

		let translation_credits = builder.get_object('translation_credits').get_label();
		if (translation_credits == 'translator-credits') {
			builder.get_object('translation_label').set_label('');
			builder.get_object('translation_credits').set_label('');
		}

		let ext_report_url = "https://github.com/maoschanz/notes-extension-gnome";
		builder.get_object('report_link_button').set_uri(ext_report_url);
	}
}

//------------------------------------------------------------------------------

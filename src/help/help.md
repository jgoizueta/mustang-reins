Mustang Reins is an editor for Fender Mustang amplifiers. It runs in the browser and talks to the amp over a USB cable. You need no driver and no Fender FUSE.

![The main window](/help/main.png)

## Before you start

You need:

- A Chromium browser: Chrome, Edge, Opera, Vivaldi or Brave. Firefox and Safari cannot talk to USB devices (they have no WebHID), so the app does not work in them.
- A computer. Phones and tablets with iOS or iPadOS do not work.
- A Mustang amp with a USB port. The app knows the Mustang I/II and III/IV/V, v1 and v2. It was tested on a Mustang II.

## Connect the amp

1. Switch on the amp and connect it to the computer with a USB cable.
2. Click **Connect amp** in the top right corner.
3. In the browser dialog, select the amp and click **Connect**.

The button then shows **Connected**, and the editor shows the preset that the amp plays.

If the app shows "The amp does not answer", close other windows or apps that use the amp. Then switch the amp off and on again, and click **Connect amp** again.

If the cable comes out, the app connects again when you put it back. Your edits stay in the editor, and the app sends them to the amp again.

No amp? Add `?sim` to the address to use a simulated amp.

## The editor

The center of the window shows the preset that you edit, the **active preset**.

- **Signal path:** shows the order of the effects and the amp. Click a box to switch that effect on or off. Drag an effect to the other side of the amp to put it before or after the amp. Click the cabinet to switch it on or off.
- **Amplifier:** select the amp model and the cabinet, and set the knobs. **Off** means no amp model.
- **Effects:** the four effect slots: Stompbox, Modulation, Delay and Reverb. Select an effect model in each slot, and set its knobs.
- **USB gain:** the level of the guitar signal that the amp sends to the computer.

When you change a control in the app, the amp changes at once. When you turn a knob or select a preset on the amp, the app changes too.

On a Mustang I/II, the **Master** knob is disabled. These amps set the master volume only with their own knob.

On a v1 amp, the app does not show the amp and effect models that need a v2 amp. If a preset uses one of these models, the list shows it as "Not on this amp", and the amp plays it as Off.

## The sidebar

**Active Preset** shows the name of the preset in the editor, and where it came from: an amp slot or the Library. "changed, not saved to the slot" means that the editor is different from the amp slot.

- Click the name to rename the preset.
- **Send full preset to amp** sends all settings to the amp. It does not save them to a slot. You need it only when Live sync is off.
- **Export as .fuse file** downloads the preset as a Fender FUSE file.
- **Collapse Sidebar** makes the sidebar narrow, so the editor gets more space.

**Amp Slots** shows the presets that the amp keeps. A Mustang I/II has three groups of 8 slots, in three colors: ORG (amber), GRN (green) and RED. Use the buttons at the top to show one group or all.

- Click a slot to play it on the amp and load it into the editor.
- After you change the preset, a save icon shows next to each slot. Click it to save the editor's preset to that slot. The app asks before it overwrites the slot.

## The Library

Click **Library** to open the Library on the right. The Library keeps presets in this browser, in collections. The app has no presets of its own: you import them or save them from the amp.

![The Library with a bank](/help/library.png)

- **Collections:** click a collection to show its presets, or **ALL** to show all presets. Click **+** next to the collections to make a new collection. Use the menu of the selected collection to rename it, export it or delete it.
- **Search:** type a name, author, tag, amp or effect.
- **Load:** click a preset to load it into the editor. With the amp connected, the amp plays it too. It does not go into an amp slot until you save it there.
- **Preset icons:** **Overwrite with current settings** puts the editor's preset into that entry. **Export as .fuse file** downloads it. **Delete from library** removes it. Double-click a name to rename it.

The **+** menu at the top of the Library adds presets:

- **New Preset** and **Current Preset** add an empty preset or the editor's preset.
- **Import Files…** and **Import Folder…** import `.fuse` files, folders and `.zip` files. You can also drop them on the Library. Each folder in them becomes a collection. The app skips presets that are already in the collection.

The presets stay in this browser only. To move them to another browser or computer, export them and import them there.

### Banks

A bank is a collection that holds the presets for the amp slots, in slot order. A full bank has a preset for each amp slot: 24 on a Mustang I/II, 100 on a Mustang III/IV/V. A small bank has 8 presets for one color group.

- **Make a bank:** **+ → New bank (24)**, **New bank (8)** or **New bank (100)** makes an empty bank. **+ → Back up amp** reads all amp slots into a new bank. **Back up ORG**, **Back up GRN** and **Back up RED** read one color group. During a backup, the amp plays each preset in turn, so turn the volume down first.
- **Edit a bank:** click a position to load it. **Put the current preset here** fills an empty position with the editor's preset. **Clear this position** empties it. Drag a row onto another row to swap them.
- **Write to the amp:** in the bank's menu, **Write to amp** writes the bank to all slots or to one color group. The app asks first, because this overwrites the amp's presets. Empty positions do not change their amp slots. You can stop with **Cancel**.
- **Files:** **Export .zip** downloads the bank in the Fender FUSE backup layout. If you import a FUSE backup folder or `.zip`, the app makes a bank from it.

Back up the amp and export the bank before you write a bank to the amp for the first time. Then you can get your presets back.

## MIDI control

You can control the amp with a MIDI controller or a MIDI foot switch.

1. Connect the MIDI controller to the computer.
2. Switch on **MIDI** at the top of the window. The browser asks for permission to use MIDI devices.
3. Select the controller in the list next to the switch.

The app uses the MIDX-20 map for Mustang amps. For example, CC 23 switches the Stompbox on and off.

To use other knobs or buttons of your controller, use **Learn**:

![MIDI Learn](/help/midi.png)

1. Click **Learn**. A bar with instructions shows under the header.
2. Click a control in the app: a knob, an effect switch, a slot, or **Previous slot** or **Next slot** in the bar.
3. Move a knob or push a button on your controller. The control then shows the CC number.
4. Click **Done**.

Press Esc to cancel the selected control. Press Delete to remove its mapping. **Clear all** removes all learned mappings. Learned mappings have priority over the MIDX-20 map.

## Tuner

Click **Tuner** to use the amp's tuner. Play one string at a time. The display shows the note, and how far it is from the correct pitch. Close the tuner to go back to the editor.

![The tuner](/help/tuner.png)

## Tone AI

Tone AI makes amp and effect settings from a description of a sound. For example: "a not-too-clean sound with a David Gilmour echo". Then you can ask for changes, for example "more distortion and much more sustain".

![Tone AI](/help/tone-ai.png)

1. Click **Tone AI**.
2. Click **Assistant settings** (the gear icon). Select Anthropic or OpenAI, and type your API key from that company. The key stays in this browser and goes only to that company.
3. Describe the sound, and send it.
4. The answer shows the settings that it changes. Nothing changes until you click **Apply**. **Discard** ignores the answer. After Apply, **Undo** puts the old settings back.

Tone AI needs an internet connection and an API key, and the API company charges you for its use. Each request sends to that company your description, the earlier messages of the conversation, the editor's settings, and some matching presets from your Library. Anyone who can use this browser profile can read the API key.

## Install the app

You can install the app, and then use it without an internet connection.

1. Click the install icon in the address bar of the browser.
2. Confirm the installation.

When a new version is available, the app shows a notice. Click **Reload** to use the new version.

## Problems and details

Point to the amp name under the title to see the connection details:

- **Live sync:** when it is off, your edits stay in the editor, and the app ignores changes on the amp. Use **Send full preset to amp** to send your edits.
- **Auto-reconnect:** connects again after the cable comes out.
- **Traffic Log:** shows the last 500 USB packets between the app and the amp, and what each byte means.

### Linux

On Linux, the browser can only use the amp if you give it access to the USB device. Add this file as root, then disconnect the amp and connect it again:

```udev
# /etc/udev/rules.d/50-mustang.rules
SUBSYSTEM=="usb", ATTR{idVendor}=="1ed8", MODE="0666", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="1ed8", MODE="0666", TAG+="uaccess"
```

---

*Fender, Mustang and Fender FUSE are trademarks of Fender Musical Instruments Corporation. Mustang Reins is a community project. Fender did not make it, and it is not related to Fender.*

# Mustang Reins

A browser editor for Fender Mustang amplifiers. It talks to the amp over USB with WebHID. You need no driver and no Fender FUSE.

Use it online: https://jgoizueta.net/mustang-reins/ (Chrome, Edge or another Chromium browser).

It started as a clone of [Mustang Amp Control](https://mustang.artnettune.com/) by alf45tar, with the same look and features, plus the changes listed below.

## What it does

- Edits the amp model, the amp knobs, the cabinet, and the four effect slots (Stompbox, Modulation, Delay, Reverb).
- Shows the signal path. Drag an effect to move it before or after the amp.
- Follows the amp. When you turn a knob or change a preset on the amp, the screen changes too.
- Loads and saves the preset slots of the amp (24 on a Mustang I/II, 100 on a III/IV/V).
- Keeps a library of presets in the browser, in collections. It imports `.fuse` files, folders and `.zip` files, and exports `.fuse` files and `.zip` files of collections and banks. The app ships no presets.
- Has a tuner and an optional MIDI input that follows the MIDX-20 map.
- Works offline as an installed app (PWA).
- Has a built-in help dialog.

Supported amps: Mustang I/II and III/IV/V, v1 and v2 (USB product IDs 4, 5, 20, and 21). I tested only a Mustang I/II (v1).

## How it differs from the original

| Change | Detail |
| --- | --- |
| Amp model **Off** | Sets the amp model to none, as in presets with no amp model. The original has no such option. |
| MOD, DLY/REV, and TAP | The amp controls for these show on the screen: the effect level, and the delay time or rate. |
| Effect fix | The original writes zeros in some effect bytes, and Modulation effects sound weak after any change. This app keeps the bytes that the amp sends. |
| Amp knobs | A knob change in the app goes out as the full amp packet. The small packet of the original has a fixed amp model byte, and the amp ignored it. |
| Master on Mustang I/II | The Master knob is disabled. These amps set Master with their own knob and send nothing over USB. |
| Update notice | An installed app shows "A new version is available" with **Reload** and **Later**. |
| Effect colors | Effect boxes in the signal path use the same color as the effect panel. |
| Library | One panel with collections, search, and import of folders and `.zip` files, instead of the original's local library and cloud archive. |
| Banks | Library banks of 24 presets, or 8 for one colour group: back up the amp, write a bank to the amp, and import or export banks as Fender FUSE backup folders (`.zip`). |
| Library mark | The library entry in the editor is marked, and its save icon shows unsaved changes. |
| MIDI learn | A **Learn** button assigns controller CCs to knobs, switches, and slots. Learned CCs win over the MIDX-20 map. |
| Tone assistant | **Tone AI** turns a description of a sound into amp and effect settings, with Anthropic or OpenAI and your own API key. Nothing changes until you click **Apply**. Needs internet. |
| No audio player | The original has a backing-track player in the header. This app does not. |
| Header buttons | Below 1250 px, the header buttons show only their icons. The original does this below 1024 px. |

## Requirements

- A Chromium browser with WebHID: Chrome, Edge, Opera, or Brave. Firefox and Safari do not work.
- A Mustang amp that connects with a USB cable.
- Node.js 20 or newer and npm, to build the app.

WebHID works only on `https://` pages and on `http://localhost`.

## Install and run

1. Run `npm install`.
2. Run `npm run dev`. Open the address that it prints, usually `http://localhost:5173`.
3. Click **Connect amp** and choose your amp in the browser dialog.

If you do not have an amp, open `/?sim`. It runs a simulated amp.

The dev server does not register the service worker. To test the installed app and offline use:

1. Run `npm run build`.
2. Run `npm run preview`. Open `http://localhost:4173`.
3. Use the install icon of the browser to install the app.

To host the app, copy the `dist` folder to any static web server that uses HTTPS.

To host it under a sub-path, build with the base path, for example `npm run build -- --base=/mustang-reins/`. The GitHub Actions workflow in `.github/workflows/pages.yml` does this and publishes the app to GitHub Pages.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the dev server. |
| `npm run build` | Checks the types and builds `dist`. |
| `npm run preview` | Serves `dist` on port 4173. |
| `npm test` | Runs the unit tests. |
| `npm run lint` | Runs the linter. |

The files in `scripts/` are end-to-end checks for the PWA. They drive a headless Chrome. Run them against `npm run preview`, and read the comment at the top of each file first.

## Debugging

- The packet log is always on. In the browser console, run `copy(__mustangLog.join('\n'))`.
- `/?sim` runs a simulated amp. `/?sim#tuner` shows a demo tuner.
- `__mustangMidi(status, d1, d2)` sends a MIDI message to the app. Use it to test the MIDI map without a controller.

## License

The code, the help text and the screenshots are under the MIT license. See [LICENSE](LICENSE).

The app ships no presets. Presets that you import keep the rights of their authors.

## Credits

- This app started as a clone of [Mustang Amp Control](https://mustang.artnettune.com/) by alf45tar. Its code, help text and pictures are new.
- This project is not made by Fender and is not related to Fender. Fender, Mustang and Fender FUSE are trademarks of Fender Musical Instruments Corporation.

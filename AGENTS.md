# Mustang Reins

Project notes for coding agents. Keep this file up to date as work continues. Personal details (local paths, the user's equipment and setup) go in `AGENTS.local.md`, which is not in git.

## Project

- App name: "Mustang Reins" (renamed by the user from "Mustang Companion" on 2026-11-14; manifest `short_name` "Mustang"). It started as a clone of https://mustang.artnettune.com/ (a community FUSE replacement by alf45tar / Stallion Electronics): a WebHID editor for Fender Mustang amps.
- Stack: Vite + React + TS + Tailwind v4 + Radix.
- The user wants an exact visual clone, with an own placeholder logo (not the Fender logo).
- The user tests on a real Mustang I/II (v1). Details in `AGENTS.local.md`.
- Commits carry a Co-Authored-By trailer.

## Commands

- `npm run dev` — dev server. It does not register the service worker.
- `npm test` — vitest (226 tests on 2026-11-14).
- `npx tsc -b` and `npm run lint` (oxlint) — must stay clean.
- `npm run build && npm run preview` — test the PWA (port 4173).
- To update an installed local copy of the app: build, run the preview on port 4173, open the app, click Reload in the "A new version is available" notice.
- `scripts/pwa-e2e.mjs`, `scripts/pwa-update-e2e.mjs` — headless Chrome PWA checks.
- `/?sim` runs an in-memory amp. `/?sim#tuner` opens a demo tuner.
- The packet log is always on: `copy(__mustangLog.join('\n'))` in the browser console.
- `__mustangMidi(status, d1, d2)` console hook sends MIDI messages for tests.

## Permissions and content

- The help text (`src/help/help.md`) and the screenshots in `public/help/` were rewritten and retaken on 2026-11-14 for the open-source release. Nothing from alf45tar/Fender-Mustang-Control-App is left (it has no license and no permission was given).
- The app ships no presets (decided 2026-11-13). The 9,906 `.fuse` files once in `public/library/` (from mustang.artnettune.com/library, which got them from Shane's archive at guitarpedaldemos.com/fender-fuse-mustang-v2-archive: community `archive/`, Fender `factory/`, `intheblues/`) were deleted from the repo; the user keeps a local copy for import into the Library. Git history before that commit still has them.
- Open source: MIT license (`LICENSE`, Copyright (c) 2026 Javier Goizueta). Work happens in the public repo `jgoizueta/mustang-reins` (remote `origin`, branch `main`), which started on 2026-11-14 with one squashed commit. The private repo `jgoizueta/mustang` keeps the full earlier history (it has the old alf45tar help and the 9,906 presets); its histories are unrelated to the public one, so never push between them. GitHub Pages at https://jgoizueta.net/mustang-reins/ via `.github/workflows/pages.yml`, built with `--base=/mustang-reins/`. Local dev and preview stay at `/`. A small preset set may be added later (intheblues has the author's permission; factory is Fender's).
- Do not execute code taken from the downloaded original bundle. Parse it as data instead.
- `scripts/gen_effects.py` generates `src/data/effects.ts` from the original `parser.worker-*.js` bundle (usage in the file header). On 2026-11-12 its output was identical to the committed file.

## Status

Confirmed on the real amp:

- Connect, handshake, dump, slots, amp and effect controls both ways, live reports, signal path with drag-drop, reconnect.
- `.fuse` import/export, save-to-slot, tuner, MIDI mapping, MIDI switch and device list.
- Amp model Off (model 0). See "Amp model Off" below.
- Mod effect parameters after the `EffectSettings.extra` fix.
- PWA as an installed app, offline. A preset never opened fails offline, as designed. The message says it needs a connection the first time.
- TAP with a mod-only preset (Sine Chorus) sets Rate: the editor knob follows and the change is audible (2026-11-12).
- The amp's MOD and DLY/REV controls (Level) with the direct-index decoder: the editor knobs follow (2026-11-12).
- Signal-path effect boxes use the class colors (`--slot-*`, through `--fx`).
- Library mark (2026-11-12, beyond the original, confirmed by the user with the old Local Library; kept in the new Library): the entry loaded into the editor is marked (`SessionSnapshot.libraryId`), and its save icon is highlighted when the editor differs from it (`samePreset`, which ignores `extra` and `fuseInfo`). Loading a slot, or a preset change on the amp, removes the mark.
- Diagnostics card, Live sync, and USB Traffic Log (2026-11-12, copied from the original, confirmed by the user). Hover the device name under the title to open the card (`DiagnosticsCard.tsx`, probe `probeDevice()` in `webhid.ts`). Live sync off (`AmpSession.liveSync`): edits stay in the editor, amp reports are ignored, `selectSlot` does nothing, and a reconnect does not push. The log panel (`TrafficLog.tsx`) reads `src/amp/trafficLog.ts` (newest 500 entries, always collected). `src/protocol/describe.ts` decodes each packet field by field: a port of the original `Zp`, plus the packet kinds in decode.ts and the protocol notes below.
- Real MIDI controller (2026-11-12): the app receives its CC messages ("MIDI [Ch n] CC #x value=y" info lines in the Traffic Log), and CC 23 switches the Stompbox. The MIDI map is the fixed MIDX-20 map in `src/midi/map.ts`, plus MIDI learn (below).
- Layout details copied from the original (2026-11-12, confirmed by the user, incl. the red error line: Auto-reconnect off + unplug): Collapse Sidebar (40px rail), effect panels in two columns when the editor column is at least 912px wide (Tailwind container query `@min-[912px]:grid-cols-2` on the editor's `@container`, user's request 2026-11-14). This equals the original's window widths (1280px with no right panel; the original used 1750px with the archive, we first used 1650px) and also counts Tone AI, the Traffic Log and the collapsed sidebar: 2 columns from 1650px with the Library or Tone AI, 2020px with both, and 260px less with the sidebar collapsed, the reconnecting/error line under the header, and icon-only Learn/Library/Tuner/Connect buttons below 1250px (`min-[1250px]:`, the user's choice; the original uses `lg` = 1024px).
- MIDI learn (2026-11-12, beyond the original, confirmed by the user). A Learn button next to the MIDI device select (only when MIDI is on) shows a learn bar. Click a control, then move a MIDI control: the CC (with its channel) is assigned. Targets: amp knobs, USB gain, effect knobs by position, effect on/off, Bright, Tuner, slots, Previous/Next slot. Switches follow the value (64-127 on), slot targets act on values 64-127 only. Learned CCs win over the MIDX-20 map. Code: `src/midi/learn.ts` (store in `mustang.midi.learned`, `applyLearned`, `routeMidi`), `src/components/Learnable.tsx`. Esc cancels, Delete removes the selected mapping.
- Sidebar (2026-11-13, user's design): an "Active Preset" card (name, Collapse/Send/Export, a line telling where the editor preset came from: amp slot or Library) and an "Amp Slots" card. The ORG bank dot uses `bg-primary` (amber like the amp's LED; orange was too close to red).
- Tone assistant (2026-11-13, beyond the original; confirmed by the user with Anthropic, OpenAI not tried). "Tone AI" header button opens a 350px column (`AssistantPanel.tsx`). The user picks Anthropic or OpenAI and gives an own API key (localStorage `mustang.assistant`); calls go straight from the browser with plain fetch (`src/assistant/providers.ts`: Anthropic `/v1/messages` with `anthropic-dangerous-direct-browser-access`, OpenAI `/v1/responses` with a strict function tool). Defaults `claude-sonnet-5-5`, `gpt-6.1-sol`. Browser calls work with Anthropic; OpenAI is unverified. One tool, `set_tone`, in display units 0-100 and names (`src/assistant/tone.ts`: `describeCatalog`, `presetToTone`, `SET_TONE_SCHEMA`, `applyTone`). Fixed instructions in `src/assistant/prompt.ts` (written by the lead agent; change them deliberately). Matching Library presets go in as examples (`src/assistant/examples.ts`). Proposals change nothing until Apply (recomputed against the editor at click time, then `loadPreset`); Undo on the latest applied card. Safety: amp volume rises at most 10 points per answer. One automatic retry when `applyTone` reports errors. History is plain text turns (no tool_result replay). Test hook in `/?sim`: `window.__mustangAssistantFake`.

- Library (2026-11-13, confirmed by the user: several zips with and without a root folder, all 9,906 files and more, by drag and drop and by the + menu; replaces the left Local Library and the cloud archive). "Library" header button toggles a 350px right column (`LibraryPanel.tsx`). Presets live in IndexedDB (`src/library/store.ts`, db `mustang-library`, stores `collections`/`entries`; `memoryBackend` for tests) in one-level collections; The default collection (target for new presets and loose imports in the ALL view) is the oldest normal collection, whatever its name; "My Presets" is created only when no normal collection exists, and the last normal collection cannot be deleted (fixed 2026-11-14: a renamed My Presets used to be re-created on every start). The old localStorage library (`mustang-amp-control.library.v1`) is migrated once into My Presets keeping ids (flag `mustang.library.migrated`; the old key stays as a backup). Chips: ALL + collections with counts, + to create, a menu on the selected one (Rename, Delete with confirm). Search over name, author, tags, description, amp and effect names. Rows: click loads (mark), double-click renames, overwrite / export / delete, hover card with `PresetDetails`, arrow keys. Import (`src/library/import.ts`): .fuse files, folders (webkitdirectory), .zip (own reader: stored + deflate-raw), drag and drop. One common root folder is stripped; each first-level subfolder becomes a collection (same name reused, case-insensitive); top-level files of a folder/zip go to a collection named after it; single files go to the selected collection (My Presets for ALL). Same name + `samePreset` in the same collection = duplicate, skipped. On start, `main.tsx` deletes the old `library-index` and `library-presets` caches. Banks (loading a set into the amp slots) come later.

- Banks (2026-11-14, beyond the original; confirmed by the user on the real amp). A bank is a Library collection with `bank: { size: 8 | 24 | 100 }`; entries have `position` (empty positions allowed). User's choice: on Mustang I/II, full 24-banks and 8-banks that go to/from one colour group (ORG 0-7, GRN 8-15, RED 16-23). Files use Fender FUSE's backup layout (checked in real FUSE 2.6/2.7 backups, github.com/joshbuhler/SpeedShop SampleBackups): `<dir>/<M2_|MU_>BackupName.fuse` (one line: description; M2_ = v2, MU_ = v1), `<dir>/Presets/NN_<name>.fuse`, plus `FUSE/NN.fuse` (pedal colours, backing track) and `SystemSettings.fuse` (Quick Access etc.), which we ignore on import and do not write. Import: any folder with `Presets/NN_*.fuse` or `*_BackupName.fuse` becomes one bank (`src/library/import.ts`); export: stored zip (`src/library/zip.ts`). Amp: `AmpSession.backupSlots` selects each slot and reads its state (the amp switches through its presets; the user accepted this), `restoreSlots` selects, writes and saves each slot; afterwards both reselect the active slot and push the editor back if it had unsaved changes (`settleAfterBankRun`). Slot labels shared in `src/data/slots.ts`.

Removed:

- Audio player: removed on 2026-11-12 at the user's request (the header pill, and section 5 of `src/help/help.md`). The original plays a backing track that the user picks on the default macOS output. The user's amp cannot play it over USB. Its help picture `public/help/audio-player.png` was deleted.
- Not a feature: "narrow-window layouts" (an item from session 1). The original has no narrow layout: a fixed grid (300px sidebar, editor, optional 350px log and archive columns) and a few Tailwind breakpoints. Checked in the original bundle and CSS on 2026-11-12.

Open questions:

- Mustang III/IV/V Master knob behavior (untested).

## PWA

- `vite-plugin-pwa`, `registerType: 'prompt'`, `PwaStatus` banner. Icons in `public/` are rendered from the user's artwork `design/mustang-reins.png` by `scripts/make-icons.mjs` (headless Chrome + canvas): rounded corners rx = 112/512 for icon.svg/192/512, full-bleed apple-touch, maskable at scale 0.76 with the edge bands stretched to the sides.
- Precaches the app only. The cloud archive and "Save all" were removed on 2026-11-13; presets are in the IndexedDB Library.
- The update notice shows only when a newer build exists than the installed one.

## Protocol notes

- The amp pushes its own changes with sub-opcode 1 (`1c 01 05/06/07/08/09/0d`), a trailer `1c 01 00 00 <slot>`, and `1d 01 <bank> <idx> <slot>` effect-preset notices. The decoder accepts sub-opcodes 1 and 3.
- Dump layout: 2 name packets for each slot, then 7 state packets.
- The amp changes effect parameters itself with reports `05 01 <dsp-3> <model low byte> 00 <param> <param> <kind> 00 <v> <v>` (family 4 mod, 5 delay, 6 reverb, 3 stomp assumed). Param is the knob index (0 = Level). Value is the knob byte.
  - MOD and DLY/REV controls send param 0. DLY/REV sends a delay report and a reverb report for each step (per the manual, they set Level).
  - The TAP button sends param 1: Delay Time, or Rate when the preset has only a mod effect. Capture (Sine Chorus, 2026-11-12): `05 01 04 12 00 01 01 10 00 9b 9b` (byte 7 is 0x10 here, 0x06 for Delay Time). Test in `src/protocol/packets.test.ts`.
  - `AmpSession.onEffectKnob` applies them at once. It ignores them within `echoGuardMs` (250) of our own writes, or if the model differs.
  - `05 01 04` also looked like the tuner-stop packet in the original. Tuner stop has byte 3 = 0.
- Effect packets: the amp's own effect reports carry extra bytes (19-21 and 38-39) and pad unused knobs with 0x80. The original app wrote zeros there, and a Mod effect then sounded weaker or off. Fix: `EffectSettings.extra` keeps the amp's bytes, learned per model from dumps and live reports, with a table fallback (`normalizeEffect`). Unused knobs are 0x80. Test: `src/protocol/effect-fidelity.test.ts` (real amp bytes).
- The `unknown` triples in `src/data/effects.ts` are right for mod and reverb, but wrong for delay (amp shows [1,1,1], table [2,1,1]) and some stomps.
- Mustang I/II Master is hardware-only. The amp sends no packet when it turns and ignores the app's value. The Master knob is disabled for `presetCount <= 24` (`hasDigitalMaster`).
- The handshake fails with "The amp does not answer…" when the amp sends nothing to Init 0, Init 1 and the dump (2026-11-12). Seen on the real amp: "Connected" with no rx at all. Closing some Chrome windows (with no visible app tab) fixed it; the exact cause is unknown. Not reproduced: with our app and the original open at the same time, both connect and both receive the amp's reports, also after a disconnect or unplug (the original then showed only "Preset N" names).
- v2-only models (`v2Only` in `src/data/amps.ts` and `src/data/effects.ts`): a v1 amp plays the 5 v2-only amps (Studio Preamp, '57 Twin, '60s Thrift, British Colour, British Watts) as Off and ignores amp knob changes (seen 2026-11-13). On v1 devices the amp select (`AmpSelect.tsx`) and the effect selects hide them; a preset that already has one shows it with "Not on this amp" and a red warning. `AmpSession.setAmp`/`setEffectModel` ignore them on v1 (covers MIDI); `loadPreset` does not filter.
- Write acks (Mustang I/II, 2026-11-14 logs): the amp answers every `1c 03 …` write (amp, effects, USB gain, and each `1c 03 00` apply) with `00 00 1c 00 "Jun 11 2012"…` (about 8 ms after data packets, 50 ms after apply). The save packet `1c 01 03` gets no reply. A slot select is answered 0.1-0.2 s later with the state block, ending in `1c 01 00 00 <slot>`. Bank writes (`restoreSlots`) wait for the trailer and for each ack (timeouts 1.5 s / 100 ms, noted as "No reply" in the Traffic Log), then pause `saveSettleMs` (100) after the save. A 24-slot write takes about 16 s on the real amp (before the save fix; less now).
- Write acks (Mustang I/II, 2026-11-14 logs): the amp answers every `1c 03 …` write (amp, effects, USB gain, and each `1c 03 00` apply) with `00 00 1c 00 "Jun 11 2012"…` (about 8 ms after data packets, 50 ms after apply). The save packet `1c 01 03` gets no reply. A slot select is answered 0.1-0.2 s later with the state block, ending in `1c 01 00 00 <slot>`. Bank writes (`restoreSlots`) wait for the trailer and for each ack (timeouts 1.5 s / 100 ms, noted as "No reply" in the Traffic Log), then pause `saveSettleMs` (100) after the save. A 24-slot write took about 16 s on the real amp.
- Amp knob writes use the full amp packet. The small live-knob packet has a fixed model byte 246 that the amp ignored.

## Amp model Off (feature beyond the original)

- Requested 2026-10-25, built 2026-10-26, confirmed on the amp 2026-10-26 ("the OFF feature works perfectly").
- Why: the original app has no such option, but real amp presets can have no amp model (the user's "Empty" preset).
- Captured packets for "Empty": the amp reports model byte 16 = 0. The amp packet is all zeros except volume 0xef. All four effects are model 0. USB gain is 0xff.
- `AMP_OFF = 0` in `src/data/amps.ts` (first entry of `AMPS`, all magic bytes 0). The signal path shows a muted "Off" amp node, like the cabinet when off. `.fuse` import/export keeps it. Test: `src/data/amp-off.test.tsx` (real packets).
- MIDI CC 68 value 0 does not mean Off on purpose (MIDX-20 amp types start at 1).
- If the amp ever rejects the write, compare our tx packet with the amp's own "Empty" packet in `__mustangLog`. Bytes 40, 43, 53 are 128 in our writes but 0 in the amp's "Empty". Also compare the magic bytes.

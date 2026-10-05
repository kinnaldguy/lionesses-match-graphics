# Match graphics — Halifax Friendly FC Lionesses

This repo produces a DaVinci Resolve graphics pack for each Lionesses match: score-bug stills,
goal and substitution pop-ups, an intro card, a formation line-up card and a Resolve marker file built from the
FootyOS match export. The editor (Dave) edits the XbotGo Falcon footage in DaVinci Resolve
(free version, v21) and adds the match clock himself with a Text+ timer.

## The weekly job

Dave will send some or all of:
- the FootyOS CSV export for the match (`<date>_Lionesses_v_<Opponent>.csv`)
- opponent full name, the short name for the score bug, crest file, kit colours
- venue, date and kick-off, competition (league or cup)
- home or away (decides background and our kit colours)
- formation and the XI in formation order (see below), plus subs — **not needed** when the FootyOS
  export has "Formation" / "Starting XI" / "Bench" rows (added on FootyOS branch
  `claude/export-lineup-positions`); the build then takes the line-up and pitch spots from the CSV
- a still from the footage (optional, used for previews)

Steps:
1. Create `matches/<yyyy-mm-dd>-<opponent-slug>/` and copy the closest previous `match.json` in as a starting point.
2. Put the CSV in as `footyos.csv`, the still as `still.jpg`, and the opponent crest in `assets/teams/<slug>.png`.
   Convert EPS/AI logos with Ghostscript (`apt-get install -y ghostscript` if missing):
   `gs -q -dSAFER -dBATCH -dNOPAUSE -dEPSCrop -sDEVICE=pngalpha -r200 -sOutputFile=out.png in.eps` (use `-dUseCropBox` instead of `-dEPSCrop` for `.ai`), then `convert out.png -trim +repage out.png`.
3. Fill in `match.json` (fields below). Ask Dave for anything missing rather than guessing — especially
   who played where, opponent kit colour and the short name.
4. `npm install` (first time in a session), then `node src/build.js matches/<folder>`.
   Playwright is pinned to 1.56.1 to match the Chromium preinstalled in Claude Code cloud sessions.
   On any other machine, run `npx playwright install chromium` once.
5. Look at every PNG in `out/previews/` before sending. Check the build's console summary: the final
   score must match the real result, and any "Unrecognised FootyOS event labels" must not be goals.
6. Send Dave the zip from `out/` and the previews. Commit the match folder (not `out/`, which is gitignored).

## match.json

| Field | Notes |
|---|---|
| `weAreHome` | `true` puts us on the left of the score bug and intro |
| `kit` | `"home"` (red) or `"away"` (blue) — sets background and our colours from `club.json` |
| `opponent.shortName` | Score-bug name, e.g. "Guiseley Devs". Must fit the half-width team block (~14 characters) |
| `opponent.fullName` / `introName` | `introName` may contain `<br>` to control line breaks on the intro card |
| `opponent.shirt` / `text` | Their shirt colour and a readable text colour on it |
| `formation` | `4-4-1-1`, `4-2-3-1`, `4-3-3`, `4-4-2` or `3-5-2` (spots are in `FORMATIONS` in `src/templates.html`) |
| `lineup` | Ignored when the CSV has Starting XI rows. Otherwise `[number, name, optional position label]` in formation order: GK, back line **right to left**, then each line further forward right to left, striker last |
| `subs` | `[number, name]` |
| `kickOffAt` | Timeline timecode where kick-off really is in Resolve, e.g. `"01:03:42:15"`. FootyOS times are offset from the footage, so every marker and timing is shifted to match. Ask Dave for it |
| `goalsOnly` | `true` for matches logged on the older FootyOS tracker: only goals, periods and the line-up are used (no sub pop-ups, no save/shot/sub markers) |
| `halfLength`, `extraTimeLength` | Minutes; default 45 and 15. Drive the clock start values in HOW_TO_USE |

## Design rules (agreed with Dave — don't change without asking)

- Score bug: home team left. Team names on their kit colour, **no crests or shirt icons**. Our block
  carries the shirt's pixel pattern. Period label (1ST / 2ND / ET1 / ET2) sits above the score.
- Sponsor bar under the bug, in this order: Microworld, Maid Vericlean, **empty clock box (same width as
  the score block, directly under it)**, Nexus, Simply Waste. No clock is drawn — Dave adds it in Resolve.
- The bug and the bottom-right crest/#HerGameToo panel exist partly to cover XbotGo's burnt-in
  scoreboard (top-left, ~750×145 px at 1920 wide) and watermark (bottom-right). Never make them smaller.
- Our goal pop-up is big; opposition goal pop-up is small and muted.
- One substitution pop-up per FootyOS "Sub" row (Player = going off, "Assist / coming on" = coming on).
  Rolling subs mean the same player can come on more than once - that's expected.
- Fonts: Anton (headlines) and Barlow Condensed (labels) — the same pairing FootyOS uses.
- Sponsor logos are never recoloured without asking; logos that don't work on black get a white panel.
  (Simply Waste is shown white with Dave's approval — swap in an official white version if one arrives.)
- Stills only. Dave asked not to render video clips.

## Resolve notes

- Footage is 3840×2160 at 30 fps; PNGs are rendered at that size.
- The marker EDL assumes the untrimmed clip starts at 01:00:00:00 on the timeline.
  Import on the Media page (the Edit page's right-click menu doesn't have it): right-click the timeline in the
  Media Pool > Timelines > Import > Timeline Markers from EDL. Confirmed in Resolve 21.
- Marker and score timings are when the event was logged in FootyOS, usually a few seconds after the
  ball went in.

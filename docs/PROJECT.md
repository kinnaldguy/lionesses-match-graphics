# Lionesses Match Graphics: project overview

Halifax Friendly FC Lionesses · West Riding County Women's FL, Division Four
Repo: `kinnaldguy/lionesses-match-graphics` · Owner/editor: Dave Kinnald
Last updated: 1 November 2026

---

## 1. What it is

Each match the Lionesses play is filmed on an **XbotGo Falcon** camera and edited by Dave in
**DaVinci Resolve 21 (free)**. This project turns the match's **FootyOS** export into a ready-made
**graphics pack** for that edit:

| In the pack | What it's for |
|---|---|
| Score-bug PNGs, one per scoreline (`01_scorebug_1st_0-0.png` …) | Top-left bug. Covers the Falcon's burnt-in scoreboard |
| Goal pop-ups (`10_goal_…` ours, big; `11_opp_goal_…` theirs, small and muted) | Lower-third goal graphics |
| Sub pop-ups (`12_sub_…`) | One per FootyOS "Sub" row |
| Intro card (`00_intro_card.png`) | Full-frame card: crests, names, venue, kick-off, competition |
| Line-up card (`00b_lineup_card.png`) | Full-frame card: XI, positions on a pitch, bench |
| Marker EDL (`<match>_markers.edl`) | Coloured Resolve timeline markers for every event |
| `HOW_TO_USE.txt` | Exact video times for every graphic, the clock start times, import steps |
| Logos (`logo_*.png`) | Crests and the league logo for reuse |

Everything is a **still** (PNG, 3840×2160, transparent where needed). Dave asked for no video clips.
The match clock is **not** drawn: Dave adds it in Resolve with a Text+ timer in the empty box under the score.

---

## 2. How a match gets done (the weekly loop)

**Dave sends:**
1. The **FootyOS CSV export** (Match Tracker → Export for video editing → Spreadsheet .csv).
2. The **Falcon clip's file name**, e.g. `VID_20261011_135935_01_01`, or its small `.vdata` file.
3. The opponent's **crest**, if they're new and it isn't on FootyOS.
4. The **short name** for the score bug, if it's a new opponent (max ~14 characters).
5. Optionally, a still from the footage, or the `.cover` thumbnail, used only for previews.

**Claude:**
1. Creates `matches/<yyyy-mm-dd>-<opponent-slug>/` with `footyos.csv`, `match.json` and `still.jpg`.
   The crest goes in `assets/teams/<slug>.png`.
2. Runs `node src/build.js matches/<folder>`.
3. Checks the console: the **score must match the real result**, and it must say
   `Synced: clock times against video start …`.
4. Looks at every preview PNG, sends Dave the zip and previews, and commits the match folder.

**Dave in Resolve:**
1. Puts the untrimmed clip on a timeline starting at **01:00:00:00**.
2. Imports the markers: **Media page** → right-click the timeline in the Media Pool →
   **Timelines → Import → Timeline Markers from EDL…** (this menu is *not* on the Edit page's right-click).
3. Drops the PNGs on tracks above the footage using the times in `HOW_TO_USE.txt`, nudging goals to
   the moment the ball goes in. Taps are usually 1–3 s late.

---

## 3. Syncing to the footage (how the times are worked out)

**The method (agreed Oct 2026): clock time minus camera start time.**

- **FootyOS** records the real clock time of every tap, to the millisecond, using the server's clock.
  Each event is timed from the **first tap on the event button**, not when the player is picked.
  This is the CSV's **"Clock time"** column.
- **The Falcon** names each recording by when it started: `VID_YYYYMMDD_HHMMSS_01_01`.
  The camera syncs its clock to Dave's phone before kick-off.
- **Video position = Clock time − recording start.** No kick-off timecode needs finding.

**How we know it works:**
- On 4 Oct (Guiseley), FootyOS logged kick-off at 14:04:44.568 and the camera started at 14:01:00.575,
  which puts kick-off at 3:44.0 into the video. Dave found it by eye at 3:42.5, so the tap was 1.5 s late.
- The Falcon's `.track` log runs 6,549.67 s against a video length of 6,549.73 s, so there's
  **no clock drift** over a match.

**Fallbacks:**
- `videoStart` in `match.json`: the millisecond start time from line ~22 of the Falcon's `.track` log
  (`StartTime:2026-10-04 14:01:00.575`). It's more precise than the file name, but the file name
  (to the second) is plenty. The log's times say "UTC" but are actually UK local time.
- `kickOffAt`: Dave reads where kick-off is on his timeline. Used only if an export has no clock times.
- **Minute-only events** (older tracker, or edited events) are placed at their half's kick-off clock time
  plus the minute, so they're accurate to about a minute.

**Falcon files that come with each recording:**
| File | Contents |
|---|---|
| `.mp4` | The video (3840×2160, 30 fps, ~30–37 GB a match) |
| `.vdata` | Small JSON: `file_time` (start), `duration`, `fps`. **Send this one** |
| `.cover` | 320×180 JPEG thumbnail, usable as a preview still |
| `.track` | ~90 MB tracking log (gimbal, detection), with the ms-precise `StartTime`. Not needed normally |

---

## 4. FootyOS export (CSV) format

FootyOS repo: `kinnaldguy/FootyOS`, tracker at `views/public/staff-portal/match-tracker.php`.
Read columns **by header name**. New columns may be added; existing ones won't be renamed.

**Columns:** Clock time · Video time · Timecode · Clip start · Clip end · Match minute · Event · Player ·
Assist / coming on · Position · Pitch spot

**Row order:**
1. **Fixture rows** (Event = label, Player = value): Opponent, Home or away, Kick-off, Venue,
   Competition, Opponent shirt, Opponent crest. A row is left out when FootyOS doesn't know the value.
2. **Formation**, then **Starting XI** (with Position and Pitch spot `GK` / `R<row>C<col>`), then **Bench**.
3. **Events and period rows** (Kick-off, Half time, 2nd half kick-off, Full time…), sorted by time.

**Export dialog** (after the Oct 2026 changes): everything is optional. "Camera file name" fills the video
columns; frame rate defaults to 30 and is remembered per phone; timeline start / lead-in / tail sit under
"Advanced".

**Event labels the build understands:** Goal, Penalty scored/missed/saved, Own goal, Opposition goal,
Their own goal (counts for us), Their penalty scored/missed/saved, Yellow/Red card, Sub, Shot on/off target,
Save, Injury, Shootout: … / Shootout (them): … (never changes the score), plus the period rows.

---

## 5. `match.json` reference

Facts from the CSV's fixture rows **override** `match.json`, so a copied-over file can't carry the
wrong opponent. Presentation stays in `match.json`.

| Field | Notes |
|---|---|
| `opponent.shortName` | Score-bug name, ≤ ~14 characters (e.g. "Guiseley Devs", "Skipton Devs", "Queensbury") |
| `opponent.crest` | `assets/teams/<slug>.png` |
| `opponent.fullName`, `introName` | Normally from the CSV. `introName` may use `<br>` |
| `opponent.shirt`, `text` | Normally from the CSV (text colour is picked automatically) |
| `weAreHome`, `kit` | Normally from the CSV. Home = left of the bug, red kit; away = right, blue kit |
| `competition.line1/line2/logo` | Display wording on the cards (CSV text is too long) |
| `venue`, `dateLabel`, `matchType` | Normally from the CSV |
| `videoFile` | Falcon file name. **Set every match** |
| `videoStart` | Optional ms start from the `.track` log |
| `kickOffAt` | Fallback only (timeline timecode of kick-off) |
| `goalsOnly` | Older-tracker matches: goals, periods and line-up only; no subs, no EDL |
| `fixtureOverrides` | Fix a wrong fixture row, e.g. `{"Opponent": "Skipton FC Women Development"}` |
| `lineup`, `subs`, `formation` | Only if the CSV has no line-up rows |
| `halfLength`, `extraTimeLength` | Default 45 / 15 |
| `fps` | Default 30 |

**Venue on the intro card:** split at the first comma: name on line 1, address after. A long address
(over ~40 characters) goes over two more lines.

---

## 6. Design rules (agreed with Dave; don't change without asking)

- **Score bug:** home team on the left; team names on their kit colour; **no crests or shirt icons** on the
  bug. Our block carries the shirt's pixel pattern. Period label (1ST / 2ND / ET1 / ET2) above the score.
- **Sponsor bar** under the bug, in order: Microworld, Maid Vericlean, **empty clock box** (same width as the
  score block, directly under it), Nexus, Simply Waste.
- The bug and the bottom-right crest/#HerGameToo panel **cover the Falcon's burnt-in scoreboard**
  (top-left, ~750×145 px at 1920 wide) **and watermark** (bottom-right). Never make them smaller.
- **Our goal pop-up big; theirs small and muted.** Opposition goals carry no scorer name.
- **One sub pop-up per FootyOS Sub row.** Rolling subs mean the same player can come on more than once.
- **Fonts:** Anton (headlines) and Barlow Condensed (labels), the same pairing as FootyOS.
- **Sponsor logos are never recoloured without asking.** Logos that don't work on black get a white panel.
  Simply Waste is shown white with Dave's approval.
- **Stills only**, no rendered video.
- Kits: home red `#D62C32`, away blue `#08519F` (`club.json`).

---

## 7. Matches done

| Date | Opponent | H/A | Us–them | Notes |
|---|---|---|---|---|
| 20 Sep 2026 | Skipton FC Women Development | A | 1–6 | Old tracker → goals only. Sandylands, Skipton |
| 27 Sep 2026 | Guiseley GFC Lionesses Development | H | 0–4 | Old tracker → goals only. Times approximate |
| 4 Oct 2026 | Guiseley GFC Lionesses Development | A | 1–5 | First full pack. Synced with `kickOffAt` |
| 11 Oct 2026 | Queensbury Celtic FC Women | H | 1–7 | Full pack, clock-time sync. Crest is low-res (120 px) |
| 18 Oct 2026 | Skipton FC Women Development | H | 1–6 | Full pack, clock-time sync. 4-5-1 |
| 13 Sep 2026 | — | — | — | Still to do |

Opponent assets: `assets/teams/guiseley-devs.png`, `skipton-devs.png`, `queensbury-celtic.png`.

---

## 8. Running it yourself

```
npm install
node src/build.js matches/2026-10-18-skipton-devs
```
Output lands in `matches/<folder>/out/` (gitignored): `graphics/`, `previews/` and the zip.
Playwright is pinned to 1.56.1 to match the Chromium in Claude Code cloud sessions. On any other machine,
run `npx playwright install chromium` once. Crests in EPS/AI convert with Ghostscript (see `CLAUDE.md`).

**Files:**
- `src/build.js`: reads the CSV, syncs times, works out score states, renders the PNGs, writes the EDL,
  `HOW_TO_USE.txt` and the zip
- `src/templates.html`: all graphic designs (HTML/CSS rendered by headless Chromium)
- `club.json`: club names, kits, sponsor bar
- `CLAUDE.md`: the working instructions Claude follows each week

---

## 9. Resolve how-tos (from this project)

- **Import markers:** Media page → right-click timeline → Timelines → Import → Timeline Markers from EDL.
  Timeline must start at 01:00:00:00 with the clip untrimmed. Don't use "EDL to New Track" or
  "Pre-conformed EDL".
- **Match clock:** Text+ on a track above the bug, in the empty box. Its centre is x 820, y 252 on a
  3840×2160 frame (Fusion Center X 0.2135, Y 0.8833), in Anton, white. Use the Time Code modifier in Timer
  mode, showing mins and secs. 1st half counts from 00:00; 2nd from 45:00.
- **Temporary zoom:** blade the section, then keyframe Inspector → Transform → Zoom/Position, with ease in
  and out. Zoom 2 on 4K is still full HD. Graphics on higher tracks don't move.
- **Magnifying glass (Fusion):** MediaIn → Transform (Size ~2, Center and Pivot on the spot), merged over
  the original with an Ellipse as the Merge's effect mask. Add a ring from a Background node and a second
  Ellipse (Solid off, Border Width set). Keep it away from the bug and the corner panel.

---

## 10. Known limits and gotchas

- **Taps lag the action** by a few seconds, so snap goals and score changes to the real moment.
- **Half-time taps:** events tapped during the break sit at the end of the 1st half in the video.
- **Events logged before 6 Oct 2026**, or from the wrist device, carry the save time (the last tap).
- **A recording split into several files** (`_01_02` …) needs one export per file. This hasn't happened yet.
- **The FootyOS site is blocked from Claude's cloud sessions,** so crest links in the CSV can't be downloaded.
  Dave attaches crests as images instead.
- **Duplicate opponent records in FootyOS** (e.g. "Skipton Development" vs "Skipton FC Women Development")
  give the wrong name. Fix the fixture in FootyOS, or use `fixtureOverrides`.
- **Neutral venues** export as "Neutral". Set `weAreHome` and `kit` by hand.
- **Clocks change (BST ↔ GMT)** are handled: both FootyOS and the camera use UK local time.

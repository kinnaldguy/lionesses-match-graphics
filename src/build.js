// Builds a Resolve graphics pack for one match folder:
//   node src/build.js matches/2026-10-04-guiseley-devs
// Output goes to <match folder>/out/: transparent 3840x2160 PNGs, a Resolve marker EDL,
// HOW_TO_USE.txt, previews/, and a zip of the lot.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const matchDir = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(matchDir, 'match.json'))) {
  console.error('Usage: node src/build.js matches/<match-folder>   (folder must contain match.json)');
  process.exit(1);
}

const club = JSON.parse(fs.readFileSync(path.join(ROOT, 'club.json'), 'utf8'));
const match = JSON.parse(fs.readFileSync(path.join(matchDir, 'match.json'), 'utf8'));
const fileUrl = (p) => 'file://' + p;
const asset = (p) => (p ? fileUrl(path.resolve(ROOT, p)) : null);

// ---------- FootyOS CSV ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, '').trim(), (r[i] || '').trim()])));
}

let events = parseCsv(fs.readFileSync(path.join(matchDir, match.footyosCsv || 'footyos.csv'), 'utf8'));
// "goalsOnly": older tracker exports - keep goals, periods and the line-up; drop subs, saves and shots.
if (match.goalsOnly) events = events.filter((e) => !/^sub|save|shot/i.test(e['Event']));
const FPS = match.fps || 30;
const tcToFrames = (tc) => { const [h, m, s, f] = tc.split(':').map(Number); return ((h * 60 + m) * 60 + s) * FPS + f; };
const framesToTc = (n) => { const f = n % FPS, s = Math.floor(n / FPS); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, f].map((v) => String(v).padStart(2, '0')).join(':'); };

// ---------- Fixture details from the export ----------
// FootyOS (from Oct 2026) starts the CSV with fixture rows: Event = label, Player = value. They come before
// the line-up and have no times. They are facts about this match, so they replace whatever match.json
// carried over from the match it was copied from. Presentation stays in match.json: score-bug short name,
// intro name, competition wording and logo, text colours.
const FIXTURE_LABELS = ['Opponent', 'Home or away', 'Kick-off', 'Venue', 'Competition', 'Opponent shirt', 'Opponent crest'];
const fixture = {};
{
  const timed = (e) => e['Clock time'] || e['Video time'] || e['Timecode'] || e['Match minute'];
  let i = 0;
  while (i < events.length && FIXTURE_LABELS.includes(events[i]['Event']) && !timed(events[i])) {
    fixture[events[i]['Event']] = events[i]['Player'];
    i++;
  }
  events = events.slice(i);
}
const fromExport = [];
if (fixture['Opponent']) {
  if (match.opponent.fullName && match.opponent.fullName !== fixture['Opponent'])
    console.warn(`Opponent in the export is "${fixture['Opponent']}" but match.json says "${match.opponent.fullName}" - using the export. Check shortName, crest and colours are for them too.`);
  match.opponent.fullName = fixture['Opponent'];
  fromExport.push('opponent');
}
if (/^(home|away)$/i.test(fixture['Home or away'] || '')) {
  match.weAreHome = /^home$/i.test(fixture['Home or away']);
  match.kit = match.weAreHome ? 'home' : 'away';
  fromExport.push(fixture['Home or away'].toLowerCase());
} else if (fixture['Home or away']) console.warn(`Export says "${fixture['Home or away']}" - set weAreHome and kit in match.json by hand.`);
const ko = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(fixture['Kick-off'] || '');
if (ko) {
  const d = new Date(Date.UTC(+ko[1], ko[2] - 1, +ko[3]));
  const day = +ko[3], th = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  const h = +ko[4], m = ko[5];
  match.dateLabel = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${day}${th} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} · ${(h % 12) || 12}:${m}${h < 12 ? 'am' : 'pm'}`;
  fromExport.push('kick-off');
}
if (fixture['Venue']) {
  const v = fixture['Venue'], c = v.indexOf(', ');
  match.venue = c > 0 ? [v.slice(0, c), v.slice(c + 2)] : [v];
  fromExport.push('venue');
}
if (fixture['Competition']) {
  match.matchType = /friendly/i.test(fixture['Competition']) ? 'Friendly' : /cup|trophy|shield/i.test(fixture['Competition']) ? 'Cup game' : 'League game';
  fromExport.push(`competition (${fixture['Competition']})`);
}
if (/^#[0-9a-f]{6}$/i.test(fixture['Opponent shirt'] || '')) {
  match.opponent.shirt = fixture['Opponent shirt'];
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fixture['Opponent shirt'].slice(i, i + 2), 16));
  match.opponent.text = 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#FFFFFF';
  fromExport.push('opponent shirt');
}
if (fixture['Opponent crest']) console.log(`Opponent crest is at ${fixture['Opponent crest']} - save it as ${match.opponent.crest || 'assets/teams/<slug>.png'} if it isn't there yet.`);
if (!match.venue) { match.venue = ['Venue TBC']; console.warn('No venue in the export or match.json - the intro card says "Venue TBC".'); }

// ---------- Sync to the footage ----------
// Best: FootyOS "Clock time" (real time of the tap) minus the Falcon clip's start time, read from its
// file name (match.json "videoFile", e.g. VID_20261004_140100_01_01 = recording began 14:01:00).
// The camera syncs its clock to Dave's phone before kick-off, so the two clocks agree.
// Rows with no clock time but a match minute (older tracker) are placed from their period's kick-off.
// Fallback: "kickOffAt", the timeline timecode where kick-off really is in Resolve (timeline starting at
// 01:00:00:00, clip untrimmed); every FootyOS time is moved by the same amount.
const secsToVt = (t) => { t = Math.max(0, Math.round(t)); return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const setVideoSecs = (e, t) => { e['Video time'] = secsToVt(t); e['Timecode'] = framesToTc(tcToFrames('01:00:00:00') + Math.max(0, Math.round(t * FPS))); };
// "videoStart" (optional, ms precision) is the StartTime line from the Falcon's .track log; else the file name's start.
const fileStart = match.videoStart
  ? (/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(match.videoStart) || []).slice(1).map(Number)
  : (/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(match.videoFile || '') || []).slice(1).map(Number);
const clockMs = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(v || ''); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6], Math.round(Number('0.' + (m[7] || '0')) * 1000)) : null; };
let syncedBy = '';
if ((match.videoFile || match.videoStart) && !fileStart.length) console.warn(`Can't read a start time from videoStart "${match.videoStart || ''}" / videoFile "${match.videoFile || ''}", so clock times weren't used.`);
if (fileStart.length && events.some((e) => clockMs(e['Clock time']) != null)) {
  const start = Date.UTC(fileStart[0], fileStart[1] - 1, fileStart[2], fileStart[3], fileStart[4], 0) + Math.round(fileStart[5] * 1000);
  const halfL = match.halfLength || 45, etL = match.extraTimeLength || 15;
  const bases = [[/^kick-?off$/i, 0], [/2nd half kick-?off/i, halfL], [/extra time kick-?off|^et1/i, 2 * halfL], [/extra time 2nd half|^et2/i, 2 * halfL + etL]];
  const kickoffs = [];   // [minute the period starts at, seconds into the video]
  for (const e of events) {
    const ms = clockMs(e['Clock time']);
    if (ms == null) continue;
    setVideoSecs(e, (ms - start) / 1000);
    const b = bases.find(([re]) => re.test(e['Event']));
    if (b) kickoffs.push([b[1], (ms - start) / 1000]);
  }
  for (const e of events) {
    const min = parseInt(e['Match minute'], 10);
    if (clockMs(e['Clock time']) != null || isNaN(min)) continue;
    const k = kickoffs.filter(([b]) => min > b || b === 0).pop();
    if (k) setVideoSecs(e, k[1] + (min - k[0] - 0.5) * 60);
  }
  syncedBy = `clock times against video start ${match.videoStart || match.videoFile}`;
} else if (match.kickOffAt) {
  const koRow = events.find((e) => /^kick-?off$/i.test(e['Event']) && e['Timecode']);
  if (!koRow) console.warn('kickOffAt is set but the export has no Kick-off row with a timecode, so nothing was shifted.');
  const offset = koRow ? tcToFrames(match.kickOffAt) - tcToFrames(koRow['Timecode']) : 0;
  for (const e of events) {
    if (e['Timecode']) e['Timecode'] = framesToTc(tcToFrames(e['Timecode']) + offset);
    if (e['Video time']) { const [h, m, sec] = e['Video time'].split(':').map(Number); e['Video time'] = secsToVt(h * 3600 + m * 60 + sec + offset / FPS); }
  }
  if (offset) syncedBy = `kick-off moved to ${match.kickOffAt} (${offset > 0 ? '+' : '-'}${framesToTc(Math.abs(offset))} on every time)`;
}

// ---------- Line-up from the export (FootyOS adds these rows when the line-up is set) ----------
// Rows with Event "Formation", "Starting XI" and "Bench" override match.json. Starting XI rows carry
// a Position label and a Pitch spot (lineup grid anchor: GK or R<row>C<col>).
const csvXi = events.filter((e) => e['Event'] === 'Starting XI');
if (csvXi.length) {
  const split = (ref) => { const m = (ref || '').match(/^#(\d+)\s+(.*)$/); return m ? [m[1], m[2]] : ['', ref || '']; };
  const formationRow = events.find((e) => e['Event'] === 'Formation');
  if (formationRow && formationRow['Player']) match.formation = formationRow['Player'];
  match.lineup = csvXi.map((e) => [...split(e['Player']), e['Position'] || '', e['Pitch spot'] || '']);
  match.subs = events.filter((e) => e['Event'] === 'Bench').map((e) => split(e['Player']));
}

// ---------- Teams ----------
const kit = club.kits[match.kit || (match.weAreHome ? 'home' : 'away')];
const ours = {
  shortName: club.shortName, fullName: club.fullName, introName: `${club.clubName}<br>${club.teamName}`,
  crest: asset(club.crest), shirt: kit.shirt, text: kit.text, pixels: kit.pixels,
};
const opp = match.opponent;
const theirs = {
  shortName: opp.shortName, fullName: opp.fullName, introName: opp.introName || opp.fullName,
  crest: asset(opp.crest), shirt: opp.shirt, text: opp.text || '#FFFFFF',
};
const home = match.weAreHome ? ours : theirs;
const away = match.weAreHome ? theirs : ours;

// ---------- Periods and goals ----------
// FootyOS event labels (FootyOS match tracker spec, 6 Oct 2026): Goal, Penalty scored/missed/saved, Own goal,
// Opposition goal, Their own goal, Their penalty scored/missed/saved, cards, Sub, Shot on/off target, Save,
// Injury, Shootout: ... / Shootout (them): ..., and the period rows. Anything else that looks like a goal is
// classified below; check the console summary after each build.
const halfLen = match.halfLength || 45;
const etLen = match.extraTimeLength || 15;
function periodFor(label) {
  if (/^kick-?off$/i.test(label)) return { tag: '1ST', clockFrom: 0 };
  if (/2nd half kick-?off/i.test(label)) return { tag: '2ND', clockFrom: halfLen };
  if (/extra time.*(1st|first)|^et1|extra time kick-?off/i.test(label)) return { tag: 'ET1', clockFrom: 2 * halfLen };
  if (/extra time.*(2nd|second)|^et2/i.test(label)) return { tag: 'ET2', clockFrom: 2 * halfLen + etLen };
  return null;
}
function goalSide(label) {
  if (/^shootout/i.test(label)) return null;   // shootout kicks don't change the score bug
  if (/(opposition|their) own goal/i.test(label)) return 'ours';
  if (/^(opposition|their)\b/i.test(label) && /goal|scored/i.test(label)) return 'theirs';
  if (/own goal/i.test(label)) return 'theirs';
  if (/goal|penalty scored/i.test(label) && !/goal ?kick/i.test(label)) return 'ours';
  return null;
}
const roster = [...(match.lineup || []), ...(match.subs || [])];
function fullName(ref) {
  if (!ref) return '';
  const num = (ref.match(/#(\d+)/) || [])[1];
  const hit = roster.find((p) => p[0] === num);
  return hit ? hit[1] : ref.replace(/^#\d+\s*/, '');
}
const numberOf = (ref) => ((ref || '').match(/#(\d+)/) || [])[1] || '';

const states = [];   // score bug states, in order
const goals = [];    // goal pop-ups
const periods = [];  // clock starts
const subs = [];     // substitution pop-ups
let score = { ours: 0, theirs: 0 };
let period = null;
const homeAway = () => (match.weAreHome ? [score.ours, score.theirs] : [score.theirs, score.ours]);
const scoreLine = () => { const [h, a] = homeAway(); return `${home.shortName} ${h}–${a} ${away.shortName}`; };
function pushState(at) {
  const [h, a] = homeAway();
  states.push({ at, period: period.tag, home: h, away: a });
}

for (const e of events) {
  const p = periodFor(e['Event']);
  if (p) {
    period = p;
    periods.push({ ...p, at: e['Video time'] });
    pushState(states.length ? e['Video time'] : '0:00:00');
    continue;
  }
  if (/^sub/i.test(e['Event']) && e['Player']) {
    const who = (ref) => `#${numberOf(ref)} ${fullName(ref)}`;
    subs.push({ at: e['Video time'], minute: e['Match minute'], off: who(e['Player']), on: who(e['Assist / coming on']) });
    continue;
  }
  const side = goalSide(e['Event']);
  if (!side) continue;
  if (!period) { period = { tag: '1ST', clockFrom: 0 }; pushState('0:00:00'); }
  score[side]++;
  pushState(e['Video time']);
  goals.push(side === 'ours'
    ? { side, at: e['Video time'], minute: e['Match minute'], number: numberOf(e['Player']), name: fullName(e['Player']) || 'Goal', assist: e['Assist / coming on'] ? `#${numberOf(e['Assist / coming on'])} ${fullName(e['Assist / coming on'])}` : '', scoreLine: scoreLine() }
    : { side, at: e['Video time'], minute: e['Match minute'], scoreLine: scoreLine() });
}

// ---------- Marker EDL ----------
const COLOURS = { goal_ours: 'ResolveColorGreen', goal_theirs: 'ResolveColorRed', save: 'ResolveColorBlue', shot: 'ResolveColorYellow', sub: 'ResolveColorPurple', other: 'ResolveColorCream' };
function markerColour(label) {
  const side = goalSide(label);
  if (side) return COLOURS['goal_' + side];
  if (/save/i.test(label)) return COLOURS.save;
  if (/shot/i.test(label)) return COLOURS.shot;
  if (/^sub/i.test(label)) return COLOURS.sub;
  return COLOURS.other;
}
const edl = ['TITLE: ' + path.basename(matchDir) + ' markers', 'FCM: NON-DROP FRAME', ''];
events.forEach((e, i) => {
  if (!e['Timecode']) return;
  const st = tcToFrames(e['Timecode']);
  const isSub = /^sub/i.test(e['Event']);
  let name = e['Event'];
  if (e['Player']) name += ' ' + e['Player'];
  if (e['Assist / coming on']) name += isSub ? ` off, ${e['Assist / coming on']} on` : ` (assist ${e['Assist / coming on']})`;
  if (e['Match minute']) name += ' ' + e['Match minute'];
  name = name.replace(/'/g, ' min').replace(/#/g, 'No.').replace(/[^\x20-\x7E]/g, '');
  edl.push(`${String(i + 1).padStart(3, '0')}  001      V     C        ${framesToTc(st)} ${framesToTc(st + 1)} ${framesToTc(st)} ${framesToTc(st + 1)}  `);
  edl.push(` |C:${markerColour(e['Event'])} |M:${name} |D:1`, '');
});

// ---------- Render ----------
(async () => {
  const out = path.join(matchDir, 'out');
  const gfx = path.join(out, 'graphics');
  const prev = path.join(out, 'previews');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(gfx, { recursive: true });
  fs.mkdirSync(prev, { recursive: true });

  const base = { club: { ...club, crest: asset(club.crest), campaignLogo: asset(club.campaignLogo), sponsorBar: { left: club.sponsorBar.left.map((s) => ({ ...s, logo: asset(s.logo) })), right: club.sponsorBar.right.map((s) => ({ ...s, logo: asset(s.logo) })) } }, match: { ...match, competition: { ...match.competition, logo: asset(match.competition && match.competition.logo) } }, kit, ours, theirs, home, away };
  const stillUrl = match.still && fs.existsSync(path.join(matchDir, match.still)) ? fileUrl(path.join(matchDir, match.still)) : null;

  const browser = await chromium.launch();
  const hi = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const lo = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const p of [hi, lo]) await p.goto(fileUrl(path.join(__dirname, 'templates.html')));
  const shot = async (page, kind, extra, file, transparent) => {
    await page.evaluate(([k, d]) => window.renderGraphic(k, d), [kind, { ...base, ...extra }]);
    await page.locator('#stage').screenshot({ path: file, omitBackground: transparent });
  };

  await shot(hi, 'intro', {}, path.join(gfx, '00_intro_card.png'), false);
  if (match.lineup && match.lineup.length) await shot(hi, 'lineup', {}, path.join(gfx, '00b_lineup_card.png'), false);

  const howBug = [];
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    const name = `${String(i + 1).padStart(2, '0')}_scorebug_${s.period.toLowerCase()}_${s.home}-${s.away}`;
    await shot(hi, 'scorebug', { period: s.period, homeScore: s.home, awayScore: s.away }, path.join(gfx, name + '.png'), true);
    howBug.push(`   ${name.padEnd(26)} ${s.at.padStart(7)} -> ${(states[i + 1] ? states[i + 1].at : 'end').padStart(7)}`);
  }

  const howGoals = [];
  for (const g of goals) {
    const mins = (g.minute || '').replace(/\D/g, '');
    if (g.side === 'ours') {
      const name = `10_goal_${g.name.replace(/\W+/g, '_')}_${mins}`;
      await shot(hi, 'goalOurs', { goal: g, scoreLine: g.scoreLine }, path.join(gfx, name + '.png'), true);
      howGoals.push(`   ${name.padEnd(34)} ~${g.at}`);
    } else {
      const name = `11_opp_goal_${mins}`;
      await shot(hi, 'goalTheirs', { goal: g, scoreLine: g.scoreLine }, path.join(gfx, name + '.png'), true);
      howGoals.push(`   ${name.padEnd(34)} ~${g.at}`);
    }
  }

  const howSubs = [];
  for (let i = 0; i < subs.length; i++) {
    const sb = subs[i];
    const name = `12_sub_${String(i + 1).padStart(2, '0')}_${(sb.minute || '').replace(/\D/g, '')}_${sb.on.replace(/^#\d+ /, '').split(' ')[0]}_on`;
    await shot(hi, 'subOurs', { sub: sb }, path.join(gfx, name + '.png'), true);
    howSubs.push(`   ${name.padEnd(34)} ~${sb.at}  (${sb.on} on, ${sb.off} off)`);
  }

  // Previews at 1x on the match still, for checking coverage of the XbotGo graphics.
  const s0 = states[0] || { period: '1ST', home: 0, away: 0 };
  await shot(lo, 'scorebug', { still: stillUrl, period: s0.period, homeScore: s0.home, awayScore: s0.away, clock: '00:00' }, path.join(prev, 'scorebug_on_still.png'), false);
  const firstOurs = goals.find((g) => g.side === 'ours');
  if (firstOurs) await shot(lo, 'goalOurs', { still: stillUrl, goal: firstOurs, scoreLine: firstOurs.scoreLine }, path.join(prev, 'goal_on_still.png'), false);
  if (subs.length) await shot(lo, 'subOurs', { still: stillUrl, sub: subs[0] }, path.join(prev, 'sub_on_still.png'), false);
  await shot(lo, 'intro', {}, path.join(prev, 'intro.png'), false);
  if (match.lineup && match.lineup.length) await shot(lo, 'lineup', {}, path.join(prev, 'lineup.png'), false);
  await browser.close();

  for (const f of [club.crest, club.campaignLogo, opp.crest, match.competition && match.competition.logo]) {
    if (f && fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(gfx, 'logo_' + path.basename(f)));
  }
  const edlName = `${path.basename(matchDir)}_markers.edl`;
  if (!match.goalsOnly) fs.writeFileSync(path.join(gfx, edlName), edl.join('\r\n'));

  const clockLines = periods.map((p) => `   ${p.tag}: starts at video ${p.at}, counting up from ${String(p.clockFrom).padStart(2, '0')}:00.`);
  fs.writeFileSync(path.join(gfx, 'HOW_TO_USE.txt'), [
    `${home.fullName} v ${away.fullName} - Resolve pack`,
    'PNGs are 3840x2160. Score bugs and goal pop-ups are transparent; intro and line-up cards are full-frame.',
    '',
    ...(match.goalsOnly ? ['1) MARKERS - none for this match (older tracker; times below are approximate, from the match minute).', ''] : [
      '1) MARKERS',
      '   Put the full Falcon clip on a new timeline starting at 01:00:00:00 (Resolve default), untrimmed.',
      `   On the MEDIA page (not Edit), right-click the timeline in the Media Pool:`,
      `   Timelines > Import > Timeline Markers from EDL > ${edlName}`,
      '   Green = our goal, Red = their goal, Blue = save, Yellow = shot, Purple = sub, Cream = KO/HT/FT.',
      '   Use the markers BEFORE cutting anything. Markers are when the event was logged - the ball usually goes in a few seconds earlier.',
      '',
    ]),
    '2) SCORE BUG (top video track; covers the XbotGo scoreboard and watermark)',
    '   Video time in the original file:',
    ...howBug,
    '   Snap each change to the moment the ball crosses the line, not the marker.',
    '',
    '3) MATCH CLOCK (Text+ on a track ABOVE the score bug)',
    '   The empty dark box under the score is for the clock.',
    '   Box centre: x 820, y 252 on a 3840x2160 frame (Fusion Text+ Center: X 0.2135, Y 0.8833). Font: Anton, white.',
    ...clockLines,
    '   Text+ > right-click the text field > Time Code modifier, mode Timer, show Mins + Secs only.',
    '',
    '4) GOAL POP-UPS (hold ~6 seconds)',
    ...howGoals,
    '',
    '5) SUBSTITUTIONS (hold ~5 seconds, same spot as goal pop-ups)',
    ...howSubs,
    '',
    '6) INTRO + LINE-UP CARDS - before the kick-off footage.',
    '',
  ].join('\n'));

  const zip = path.join(out, `${path.basename(matchDir)}_Resolve_pack.zip`);
  execFileSync('python3', ['-c', `import zipfile,os,sys
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
for f in sorted(os.listdir(sys.argv[2])): z.write(os.path.join(sys.argv[2],f),f)
z.close()`, zip, gfx]);

  console.log(`Score: ${scoreLine()}`);
  console.log(`Synced: ${syncedBy || 'not synced (no clock times + videoFile, or kickOffAt, in match.json); times are as FootyOS logged them'}`);
  console.log(`From the export: ${fromExport.length ? fromExport.join(', ') : 'no fixture rows'}`);
  console.log(`Line-up: ${match.formation || '?'} from ${csvXi.length ? 'the FootyOS export' : 'match.json'}`);
  console.log(`Score bug states: ${states.length}, goal pop-ups: ${goals.length} (ours ${goals.filter((g) => g.side === 'ours').length}), subs: ${subs.length}, markers: ${events.filter((e) => e['Timecode']).length}`);
  const unknown = [...new Set(events.map((e) => e['Event']))].filter((l) => !periodFor(l) && !goalSide(l) && !/save|shot|^sub|half time|full time|^end of|card|injury|penalty missed|^shootout|^formation$|^starting xi$|^bench$/i.test(l));
  if (unknown.length) console.log('Unrecognised FootyOS event labels (check they are not goals):', unknown.join(', '));
  console.log('Pack:', zip);
})();

# Lionesses match graphics

Weekly DaVinci Resolve graphics packs for Halifax Friendly FC Lionesses match videos.

**Each week:** open a Claude Code session on this repo and send the FootyOS export, the opponent's
crest, short name and kit colours, home/away, venue and kick-off, and the XI in formation. Claude
builds the pack and sends back a zip.

**What's in a pack**
- Score-bug stills for every scoreline, with an empty box for your Resolve timer
- Goal pop-ups (ours big, theirs muted) and substitution pop-ups
- Intro card and formation line-up card
- A Resolve marker file with every goal, save, shot and sub
- `HOW_TO_USE.txt` with exact timings

**Run it yourself**
```
npm install
node src/build.js matches/2026-10-04-guiseley-devs
```
Output lands in `matches/<folder>/out/`. Full instructions are in `CLAUDE.md`.

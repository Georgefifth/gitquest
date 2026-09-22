# GitQuest — AGENTS.md

A browser game that teaches Git by playing it. You type **real git commands** into a
mock terminal; an animated commit graph reacts live. Beat each level by making your
repo structurally match the target graph.

Built for the **"Beginner's Paradise — FirstCommit"** hackathon (Devpost, deadline
2026-09-30 17:00 EDT). The game's theme mirrors the hackathon's: *your first commit*.

## Rules of the repo (hackathon requirements — do not break)

- **Multiple meaningful commits.** Commit incrementally per feature. A single-commit
  history = disqualification.
- **Disclose AI assistance** in README.md (keep the AI Usage section accurate).
- Keep the repo public-ready: no secrets, no private data.
- All assets must be self-made or permissively licensed — credit in README.

## Tech

- **Zero dependencies, zero build step.** Vanilla HTML/CSS/JS, ES modules.
- Commit graph drawn as inline **SVG** (no canvas, no libs).
- Deploy = serve the folder statically (GitHub Pages works as-is).

## Run

```bash
python3 -m http.server 8000    # then open http://localhost:8000
```

ES modules require a server — opening index.html via file:// will not work.

## Test

```bash
node test/engine.test.mjs      # engine logic + every level solved by its own solution script
```

## Layout

```
index.html            shell: screens (boot / level-select / play)
css/style.css         all styling; phosphor-terminal theme
js/engine/git.js      Repo class: state + every git/file command. PURE — no DOM.
js/engine/check.js    graph structural equality (DAG isomorphism + branch/HEAD match)
js/engine/levels.js   level defs: setup cmds, solution cmds, briefings, hints
js/ui/terminal.js     terminal I/O: history, tab-complete, colored output
js/ui/graph.js        SVG renderer for commit DAG (lanes, edges, branch tags, HEAD)
js/audio.js           tiny WebAudio beeps/fanfare
js/main.js            glue: screens, level lifecycle, persistence (localStorage)
test/engine.test.mjs  node-only tests
```

## Conventions

- Engine code stays DOM-free so `node` can import it for tests.
- Level completion = `graphsEqual(playerRepo, goalRepo, !!level.strict)` where
  goalRepo = `setup + solution` replayed on a fresh Repo. Never compare by
  command history. Default equality is topology-only (commits/branches/HEAD/
  tags/remote); `strict: true` on a level also checks file names+contents —
  use it only when the file payload is the point (e.g. conflict resolution).
- New level = add entry to `LEVELS` in `js/engine/levels.js`. The test file
  automatically verifies every level is solvable by its `solution`.
- Commit ids are display strings (`a1b2c3`); equality is purely structural.

## Submission checklist (Devpost)

- [ ] Public GitHub repo, meaningful commit history
- [ ] README: overview, tech, setup, credits, AI disclosure
- [ ] 3–5 min demo video (record with ffmpeg or OBS)
- [ ] Deployed live version (GitHub Pages) — recommended
- [ ] Screenshots for the gallery

// GitQuest — main glue: screens, level lifecycle, persistence.

import { Repo } from "./engine/git.js";
import { graphsEqual, goalReachable } from "./engine/check.js";
import { LEVELS, SANDBOX } from "./engine/levels.js";
import { renderGraph } from "./ui/graph.js";
import { Term } from "./ui/terminal.js";
import { sfx, toggleSound } from "./audio.js";

const $ = s => document.querySelector(s);
const L = (text, cls = "") => ({ text, cls });

// ---------- persistence ----------

const SAVE_KEY = "gitquest-progress-v1";
const progress = (() => {
  try { return { unlocked: 0, stars: {}, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") }; }
  catch { return { unlocked: 0, stars: {} }; }
})();
const save = () => localStorage.setItem(SAVE_KEY, JSON.stringify(progress));

// ---------- screens ----------

const screens = { boot: $("#boot-screen"), select: $("#select-screen"), play: $("#play-screen") };
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle("active", k === name);
}

// ---------- boot ----------

const BOOT_LINES = [
  "GITQUEST BIOS v1.0.4 — checking memory......... 640K OK",
  "mounting /dev/imagination..................... OK",
  "loading commit graph renderer.................. OK",
  "spawning shell................................. OK",
  "",
  "warning: uncommitted curiosity detected",
];

async function boot() {
  const log = $("#boot-log");
  for (const line of BOOT_LINES) {
    log.textContent += line + "\n";
    sfx.boot();
    await new Promise(r => setTimeout(r, line ? 260 : 120));
  }
  $("#boot-title").classList.remove("hidden");
  const advance = () => { document.removeEventListener("keydown", onKey); toSelect(); };
  const onKey = e => { if (e.key === "Enter") advance(); };
  document.addEventListener("keydown", onKey);
  screens.boot.addEventListener("click", advance, { once: true });
}

// ---------- level select ----------

function toSelect() {
  buildTimeline();
  show("select");
}

function buildTimeline() {
  const tl = $("#level-timeline");
  tl.innerHTML = "";
  LEVELS.forEach((lv, i) => {
    if (i > 0) {
      const edge = document.createElement("div");
      edge.className = "tl-edge" + ((progress.stars[LEVELS[i - 1].id]) ? " lit" : "");
      tl.appendChild(edge);
    }
    const wrap = document.createElement("div");
    wrap.className = "tl-node";
    const btn = document.createElement("button");
    const unlocked = i <= progress.unlocked;
    btn.className = "tl-commit" + (progress.stars[lv.id] ? " done" : "");
    btn.disabled = !unlocked;
    const stars = progress.stars[lv.id];
    btn.innerHTML =
      `<span class="num">${unlocked ? String(i + 1).padStart(2, "0") : "◦"}</span>` +
      `<span class="stars">${stars ? "★".repeat(stars) : ""}</span>` +
      `<span class="tl-label">${lv.title}</span>`;
    btn.title = unlocked ? lv.task || lv.title : "finish the previous level to unlock";
    btn.addEventListener("click", () => startLevel(i));
    wrap.appendChild(btn);
    tl.appendChild(wrap);
  });
}

$("#btn-sandbox").addEventListener("click", () => startLevel(-1));
$("#btn-reset-progress").addEventListener("click", () => {
  if (confirm("Wipe all progress?")) {
    progress.unlocked = 0; progress.stars = {};
    save(); buildTimeline();
  }
});

// ---------- play ----------

let game = null; // {level, idx, repo, goal, cmdCount, hintIdx, done}

function replayInto(repo, cmds, { silent = false } = {}) {
  for (const c of cmds) {
    if (!silent) term.echo(c);
    const r = repo.exec(c);
    if (!silent && r.lines?.length) term.print(r.lines);
  }
}

function startLevel(idx) {
  const level = idx === -1 ? SANDBOX : LEVELS[idx];
  const repo = new Repo();
  const goal = new Repo();
  replayInto(goal, [...level.setup, ...level.solution], { silent: true });

  game = { level, idx, repo, goal, cmdCount: 0, hintIdx: 0, done: false, divergedWarned: false };

  // header
  $("#lvl-num").textContent = idx === -1 ? "∞" : `level ${String(idx + 1).padStart(2, "0")}/${LEVELS.length}`;
  $("#lvl-title").textContent = level.title;
  $("#hint-count").textContent = level.hints.length ? `(${level.hints.length})` : "";
  $("#btn-goal").textContent = idx === -1 ? "no objective" : "objective";

  // objective panel
  $("#objective-text").innerHTML = "";
  const brief = document.createElement("p");
  brief.className = "dim";
  brief.textContent = level.briefing;
  const task = document.createElement("p");
  task.className = "task";
  task.textContent = "▸ " + (level.task || "do whatever you like");
  $("#objective-text").append(brief, task);

  delete $("#target-graph")._prevIds;
  delete $("#live-graph")._prevIds;
  renderGraph($("#target-graph"), goal.graphView(), { emptyText: "target: an initialized… nothing yet" });

  // terminal
  term.clear();
  term.print(L(`── ${level.title} ──`, "info"));
  for (const bl of level.briefing.split("\n")) term.print(L(bl, "story"));
  term.print(L(""));
  if (level.setup.length) {
    term.print(L("(setting the scene…)", "dim"));
    replayInto(repo, level.setup);
    term.print(L(""));
  }
  if (idx === -1) {
    term.print(L("sandbox — try anything. `help` lists commands.", "info"));
  } else {
    term.print(L("▸ " + level.task, "ok"));
  }
  term.print(L(""));

  renderLive();
  show("play");
  term.input.focus();
}

function renderLive() {
  renderGraph($("#live-graph"), game.repo.graphView());
  const head = game.repo.head.type === "branch" ? game.repo.head.ref : game.repo.head.ref?.slice(0, 12);
  const safe = String(head ?? "?").replace(/[<>&"']/g, "");
  term.setPrompt(`~/repo${game.repo.initialized ? ` (${safe})` : ""}`);
  const match = game.idx !== -1 && graphsEqual(game.repo, game.goal, !!game.level.strict);
  $("#live-status").textContent = match ? "● matches target" : "";
  $("#live-status").className = "live-status" + (match ? " match" : "");
}

function confetti() {
  const colors = ["#3aff6e", "#45e0d8", "#ffce4a", "#c792ea"];
  for (let i = 0; i < 42; i++) {
    const d = document.createElement("div");
    d.className = "confetti";
    d.style.background = colors[i % colors.length];
    d.style.left = "50%"; d.style.top = "45%";
    document.body.appendChild(d);
    const a = Math.random() * Math.PI * 2, v = 180 + Math.random() * 320;
    d.animate([
      { transform: "translate(0,0) rotate(0)", opacity: 1 },
      { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v + 200}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 700, easing: "cubic-bezier(.2,.8,.4,1)" })
      .finished.finally(() => d.remove());
  }
}

function win() {
  game.done = true;
  const stars = game.cmdCount <= game.level.par ? 3 : game.cmdCount <= game.level.par + 3 ? 2 : 1;
  const prev = progress.stars[game.level.id] ?? 0;
  progress.stars[game.level.id] = Math.max(prev, stars);
  progress.unlocked = Math.max(progress.unlocked, game.idx + 1);
  save();
  sfx.fanfare();
  confetti();

  $("#complete-msg").textContent =
    `"${game.level.title}" — ${stars === 3 ? "flawless run." : stars === 2 ? "solid work." : "messy, but it works — that's real git too."}`;
  $("#complete-stats").textContent =
    `${game.cmdCount} commands · par ${game.level.par} · ${"★".repeat(stars)}${"☆".repeat(3 - stars)}`;
  $("#btn-next").textContent = game.idx + 1 < LEVELS.length ? "next level ▸" : "roll credits ▸";
  $("#complete-modal").classList.remove("hidden");
}

// ---------- meta commands ----------

const META = {
  hint() {
    const h = game.level.hints;
    if (!h.length) return term.print(L("no hints in sandbox — you're on your own, cowboy", "dim"));
    term.print(L(`hint ${game.hintIdx + 1}/${h.length}: ${h[Math.min(game.hintIdx, h.length - 1)]}`, "warn"));
    if (game.hintIdx < h.length - 1) game.hintIdx++;
  },
  objective() {
    term.print(L("▸ " + (game.level.task || "free play"), "ok"));
  },
  goal() { META.objective(); },
  undo() {
    const r = game.repo.exec("git reset --hard HEAD~1");
    term.print(r.lines.length ? r.lines : L("nothing to undo", "dim"));
  },
  reset() { startLevel(game.idx); term.print(L("level reset — fresh repo", "warn")); },
  map() { toSelect(); },
  levels() { toSelect(); },
};

// ---------- terminal ----------

const SUBCOMMANDS = ["init", "status", "add", "commit", "log", "branch", "checkout", "switch",
  "merge", "rebase", "reset", "tag", "remote", "push", "pull", "diff", "help"];
const FILES_CMDS = new Set(["add", "cat", "rm", "checkout", "reset"]);
const BRANCH_CMDS = new Set(["switch", "checkout", "merge", "rebase", "branch", "push"]);

const term = new Term($("#terminal"), {
  onKey: () => sfx.key(),
  onCommand(cmd) {
    cmd = cmd.trim();
    if (!cmd) return;
    term.echo(cmd);
    const meta = META[cmd.split(/\s+/)[0]];
    if (meta) { meta(); renderLive(); return; }
    const res = game.repo.exec(cmd);
    if (res.clear) term.clear();
    if (res.lines?.length) term.print(res.lines);
    if (!game.done) {
      game.cmdCount++;
      if (!res.ok) sfx.err(); else sfx.ok();
      if (res.ok && game.idx !== -1 && game.repo.initialized &&
          graphsEqual(game.repo, game.goal, !!game.level.strict)) {
        renderLive();
        setTimeout(win, 450);
        return;
      }
      if (res.ok && game.idx !== -1 && !goalReachable(game.repo, game.goal, !!game.level.strict)) {
        if (!game.divergedWarned) {
          term.print(L("⚠ this history can't grow into the target — `undo` steps back one commit, `reset` restarts the level", "warn"));
          game.divergedWarned = true;
        }
      } else game.divergedWarned = false;
    }
    renderLive();
  },
  complete(v) {
    const tokens = v.split(/\s+/);
    const last = tokens[tokens.length - 1] ?? "";
    const prefix = v.slice(0, v.length - last.length);
    const done = c => prefix + c;

    if (tokens.length === 1) {
      const all = [...SUBCOMMANDS.map(s => "git " + s), "git ", "touch ", "echo ", "cat ", "ls", "rm ", "clear", "help",
                   ...Object.keys(META)];
      return all.filter(c => c.startsWith(last)).map(done);
    }
    if (tokens[0] === "git") {
      if (tokens.length === 2) return SUBCOMMANDS.filter(s => s.startsWith(last)).map(done);
      const sub = tokens[1];
      if (BRANCH_CMDS.has(sub) && game?.repo)
        return [...game.repo.branches.keys()].filter(b => b.startsWith(last)).map(done);
      if (FILES_CMDS.has(sub) && game?.repo)
        return [...game.repo.workdir.keys()].filter(f => f.startsWith(last)).map(done);
    }
    if ((tokens[0] === "cat" || tokens[0] === "rm") && game?.repo)
      return [...game.repo.workdir.keys()].filter(f => f.startsWith(last)).map(done);
    return [];
  },
});

// ---------- play-screen buttons ----------

$("#btn-back").addEventListener("click", toSelect);
$("#btn-hint").addEventListener("click", () => { META.hint(); term.input.focus(); });
$("#btn-goal").addEventListener("click", () => { META.objective(); term.input.focus(); });
$("#btn-reset-level").addEventListener("click", () => { META.reset(); term.input.focus(); });
$("#btn-sound").addEventListener("click", e => {
  const on = toggleSound();
  e.target.textContent = on ? "♪" : "∅";
  e.target.title = on ? "sound on" : "sound off";
});

// ---------- modal ----------

$("#btn-replay").addEventListener("click", () => { $("#complete-modal").classList.add("hidden"); startLevel(game.idx); });
$("#btn-tomap").addEventListener("click", () => { $("#complete-modal").classList.add("hidden"); toSelect(); });
$("#btn-next").addEventListener("click", () => {
  $("#complete-modal").classList.add("hidden");
  if (game.idx + 1 < LEVELS.length) startLevel(game.idx + 1);
  else toSelect();
});

// ---------- go ----------

boot();

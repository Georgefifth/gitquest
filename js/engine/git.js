// GitQuest engine — a miniature git simulator.
// Pure JS, no DOM: also imported by node tests.

const L = (text, cls = "") => ({ text, cls });
const ok = (lines, extra = {}) => ({ ok: true, lines: Array.isArray(lines) ? lines : [L(lines)], ...extra });
const err = (lines, extra = {}) => ({ ok: false, lines: Array.isArray(lines) ? lines : [L(lines, "err")], ...extra });

const CONFLICT_MARK = "<<<<<<<";

function tokenize(input) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(input)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export class Repo {
  constructor() { this.reset(); }

  reset() {
    this.initialized = false;
    this.commits = new Map();   // id -> {id, hash, message, parents:[], files:Map, seq}
    this.order = [];            // ids in creation order
    this.branches = new Map();  // name -> commitId | null (unborn)
    this.head = { type: "branch", ref: "main" };
    this.workdir = new Map();   // file -> content
    this.staging = new Map();   // file -> content
    this.mergeState = null;     // {branch, tip, conflicts:Set}
    this.tags = new Map();      // name -> commitId
    this.remoteUrl = null;
    this.remote = null;         // {branches: Map}
    this.hashSeq = 0;
  }

  // ---------- internals ----------

  _hash() {
    const n = (++this.hashSeq * 2654435761) % 0xfffffff;
    return n.toString(16).padStart(7, "0");
  }

  _id() { return `c${this.order.length}_${this.hashSeq}`; }

  headCommit() {
    if (this.head.type === "detached") return this.commits.get(this.head.ref) || null;
    return this.commits.get(this.branches.get(this.head.ref)) || null;
  }

  headName() { return this.head.type === "branch" ? this.head.ref : null; }

  _requireInit() {
    return this.initialized ? null
      : err("fatal: not a git repository (or any directory up to mount point /) — try `git init`");
  }

  _resolveRef(ref) {
    // returns commitId | null
    if (!ref) return null;
    let m = ref.match(/^(.*)~(\d+)$/) || ref.match(/^(.*)\^$/);
    let base = ref, steps = 0;
    if (m) { base = m[1]; steps = m[2] === undefined ? 1 : parseInt(m[2], 10); }
    let id = null;
    if (base === "HEAD" || base === "head" || base === "@") {
      id = this.headCommit()?.id ?? null;
    } else if (this.branches.has(base)) {
      id = this.branches.get(base);
    } else if (this.tags.has(base)) {
      id = this.tags.get(base);
    } else {
      for (const [cid, c] of this.commits) if (cid === base || c.hash.startsWith(base)) { id = cid; break; }
    }
    while (id && steps-- > 0) id = this.commits.get(id)?.parents[0] ?? null;
    return id;
  }

  _ancestors(id) {
    const seen = new Set(); const stack = [id];
    while (stack.length) {
      const c = stack.pop();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      for (const p of this.commits.get(c)?.parents ?? []) stack.push(p);
    }
    return seen;
  }

  _mergeBase(a, b) {
    const ancA = this._ancestors(a);
    // BFS from b, first hit in ancA (by distance) is a merge base
    const seen = new Set(); const queue = [b];
    while (queue.length) {
      const c = queue.shift();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      if (ancA.has(c)) return c;
      for (const p of this.commits.get(c)?.parents ?? []) queue.push(p);
    }
    return null;
  }

  _commit(message, parents, files, extraParents = []) {
    const id = this._id();
    const c = { id, hash: this._hash(), message, parents, files: new Map(files), seq: this.order.length };
    this.commits.set(id, c);
    this.order.push(id);
    return c;
  }

  _snapshot() {
    const head = this.headCommit();
    const files = head ? new Map(head.files) : new Map();
    for (const [f, c] of this.staging) files.set(f, c);
    return files;
  }

  _loadWorkdir(commit) {
    this.workdir = new Map(commit ? commit.files : []);
    this.staging.clear();
  }

  _changedFiles() {
    // workdir vs staging-vs-head combined status info
    const head = this.headCommit();
    const headFiles = head ? head.files : new Map();
    const staged = [], unstaged = [], untracked = [];
    for (const [f, c] of this.staging) {
      staged.push(headFiles.get(f) === undefined ? `new file:   ${f}` : `modified:   ${f}`);
    }
    for (const [f, c] of this.workdir) {
      if (!this.staging.has(f) && headFiles.get(f) !== c) {
        (headFiles.get(f) === undefined ? untracked : unstaged).push(f);
      } else if (this.staging.has(f) && this.staging.get(f) !== c) {
        unstaged.push(f);
      }
    }
    return { staged, unstaged, untracked };
  }

  // ---------- entry point ----------

  exec(input) {
    const argv = tokenize(input.trim());
    if (!argv.length) return ok([]);
    const [cmd, ...args] = argv;

    if (cmd === "git") return this._git(args);
    switch (cmd) {
      case "touch": return this._touch(args);
      case "echo": return this._echo(input);
      case "cat": return this._cat(args);
      case "ls": return ok(this.workdir.size ? [...this.workdir.keys()].join("  ") : L("(empty)", "dim"));
      case "rm": return this._rm(args);
      case "clear": return ok([], { clear: true });
      case "help": return ok(HELP);
      default:
        return err(`${cmd}: command not found — GitQuest speaks git, touch, echo, cat, ls, rm, clear, help`);
    }
  }

  // ---------- file commands ----------

  _touch(args) {
    if (!args.length) return err("touch: missing file operand");
    for (const f of args) if (!this.workdir.has(f)) this.workdir.set(f, "");
    return ok([], { fs: true });
  }

  _echo(input) {
    const m = input.match(/^echo\s+(.*?)\s*(>>?)\s*(\S+)\s*$/);
    if (m) {
      const text = m[1].replace(/^["']|["']$/g, "");
      const file = m[3];
      const prev = m[2] === ">>" ? (this.workdir.get(file) ?? "") : "";
      this.workdir.set(file, prev + (prev && m[2] === ">>" ? "\n" : "") + text);
      return ok([], { fs: true });
    }
    const text = input.slice(5).replace(/^["']|["']$/g, "");
    return ok(text);
  }

  _cat(args) {
    if (!args.length) return err("cat: missing file operand");
    if (!this.workdir.has(args[0])) return err(`cat: ${args[0]}: No such file or directory`);
    return ok(this.workdir.get(args[0]) || L("(empty file)", "dim"));
  }

  _rm(args) {
    if (!args.length) return err("rm: missing operand");
    for (const f of args) {
      if (!this.workdir.delete(f)) return err(`rm: cannot remove '${f}': No such file or directory`);
      this.staging.delete(f);
    }
    return ok([], { fs: true });
  }

  // ---------- git commands ----------

  _git(args) {
    const sub = args[0];
    const rest = args.slice(1);
    const plumbingFree = new Set(["init", "help"]);
    if (!plumbingFree.has(sub)) {
      const bad = this._requireInit();
      if (bad) return bad;
    }
    switch (sub) {
      case "init": return this._init();
      case "status": return this._status();
      case "add": return this._add(rest);
      case "commit": return this._commitCmd(rest);
      case "log": return this._log(rest);
      case "branch": return this._branch(rest);
      case "checkout": return this._checkout(rest);
      case "switch": return this._switch(rest);
      case "merge": return this._merge(rest);
      case "rebase": return this._rebase(rest);
      case "reset": return this._reset(rest);
      case "tag": return this._tag(rest);
      case "remote": return this._remote(rest);
      case "push": return this._push(rest);
      case "pull": return this._pull(rest);
      case "diff": return this._diff();
      case "help": case undefined: return ok(HELP);
      default: return err(`git: '${sub}' is not a git command GitQuest knows. See 'help'.`);
    }
  }

  _init() {
    if (this.initialized) return ok(L("Reinitialized existing Git repository in ~/repo/.git/", "warn"));
    this.initialized = true;
    this.branches.set("main", null);
    this.head = { type: "branch", ref: "main" };
    return ok([L("Initialized empty Git repository in ~/repo/.git/", "ok"),
               L("hint: create a file with `touch name`, then `git add` + `git commit -m \"msg\"`", "dim")]);
  }

  _status() {
    const lines = [];
    const head = this.headCommit();
    if (this.mergeState) lines.push(L(`On branch ${this.headName()} — merge in progress`, "warn"));
    else if (this.head.type === "detached") lines.push(L(`HEAD detached at ${head.hash}`, "warn"));
    else lines.push(L(`On branch ${this.headName()}`, "info"));
    if (!head) lines.push(L("\nNo commits yet", "dim"));
    const { staged, unstaged, untracked } = this._changedFiles();
    if (this.mergeState && this.mergeState.conflicts.size) {
      lines.push(L("Unmerged paths:", "err"), ...[...this.mergeState.conflicts].map(f => L(`\tboth modified:   ${f}`, "err")));
    }
    if (staged.length) lines.push(L("Changes to be committed:", "ok"), ...staged.map(s => L(`\t${s}`, "ok")));
    if (unstaged.length) lines.push(L("Changes not staged for commit:", "warn"), ...unstaged.map(f => L(`\tmodified:   ${f}`, "warn")));
    if (untracked.length) lines.push(L("Untracked files:", "dim"), ...untracked.map(f => L(`\t${f}`, "dim")));
    if (!staged.length && !unstaged.length && !untracked.length && !this.mergeState)
      lines.push(L("nothing to commit, working tree clean", "dim"));
    return ok(lines);
  }

  _add(args) {
    if (!args.length) return err("Nothing specified, nothing added.\nhint: use 'git add <file>' or 'git add .'");
    const all = args.includes(".") || args.includes("-A") || args.includes("--all");
    let added = 0;
    if (all) {
      for (const [f, c] of this.workdir) { this.staging.set(f, c); added++; }
    } else {
      for (const f of args) {
        if (this.workdir.has(f)) { this.staging.set(f, this.workdir.get(f)); added++; }
        else return err(`fatal: pathspec '${f}' did not match any files`);
      }
    }
    if (this.mergeState) {
      for (const f of args.length ? args : []) this.mergeState.conflicts.delete(f);
      if (all) this.mergeState.conflicts.clear();
    }
    return ok([], { fs: true }); // staging never changes the graph
  }

  _commitCmd(args) {
    const mIdx = args.findIndex(a => a === "-m" || a === "--message");
    let message = null;
    if (mIdx >= 0) message = args[mIdx + 1] ?? "";
    else if (args[0] && !args[0].startsWith("-")) message = args[0]; // lenient: `git commit msg`
    if (message === null || message === "")
      return err("Aborting commit — you need a message.\nhint: git commit -m \"your message\"");

    const head = this.headCommit();

    if (this.mergeState) {
      const conflicts = this.mergeState.conflicts;
      // check markers are gone & conflicts staged
      for (const f of conflicts) {
        const content = this.staging.get(f) ?? this.workdir.get(f) ?? "";
        if (content.includes(CONFLICT_MARK))
          return err(`error: conflict markers still in '${f}' — edit it with echo, then git add ${f}`);
      }
      const files = new Map(head.files);
      for (const [f, c] of this.staging) files.set(f, c);
      const parents = [head.id, this.mergeState.tip];
      const branch = this.headName();
      const c = this._commit(message, parents, files);
      this.branches.set(branch, c.id);
      this.staging.clear();
      this.mergeState = null;
      return ok([L(`[${branch} ${c.hash}] ${message}`, "ok"), L(" merge commit created — conflicts resolved!", "info")], { changed: true });
    }

    if (!this.staging.size)
      return err(head ? "nothing to commit — stage changes with `git add` first"
                      : "nothing to commit — create a file, `git add` it, then commit");
    const files = this._snapshot();
    const parents = head ? [head.id] : [];
    const c = this._commit(message, parents, files);
    if (this.head.type === "branch") this.branches.set(this.head.ref, c.id);
    else this.head = { type: "detached", ref: c.id };
    this.staging.clear();
    const label = this.head.type === "branch" ? this.head.ref : "detached HEAD";
    return ok([L(`[${label}${head ? "" : " (root-commit)"} ${c.hash}] ${message}`, "ok")], { changed: true });
  }

  _log(args) {
    if (!this.order.length) return err("fatal: your current branch does not have any commits yet");
    const seen = new Set();
    const lines = [];
    const roots = args.includes("--all")
      ? [...this.branches.values()].filter(Boolean)
      : [this.headCommit()?.id].filter(Boolean);
    // newest-first topo walk
    const stack = roots.sort((a, b) => this.commits.get(b).seq - this.commits.get(a).seq);
    const list = [];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id); list.push(id);
      const ps = this.commits.get(id).parents;
      for (let i = ps.length - 1; i >= 0; i--) stack.push(ps[i]);
    }
    list.sort((a, b) => this.commits.get(b).seq - this.commits.get(a).seq);
    const deco = id => {
      const d = [];
      const headC = this.headCommit();
      if (headC && headC.id === id)
        d.push(this.head.type === "branch" ? `HEAD -> ${this.head.ref}` : "HEAD");
      for (const [n, tip] of this.branches)
        if (tip === id && n !== this.head.ref) d.push(n);
        else if (tip === id && this.head.type === "detached") d.push(n);
      for (const [t, tip] of this.tags) if (tip === id) d.push(`tag: ${t}`);
      return d.length ? ` (${d.join(", ")})` : "";
    };
    for (const id of list) {
      const c = this.commits.get(id);
      lines.push([L("* ", "warn"), L(c.hash, "hash"), L(deco(id), "branch"), L(` ${c.message}`)]);
    }
    return ok(lines);
  }

  _branch(args) {
    if (!args.length) {
      const lines = [...this.branches.keys()].map(n =>
        L(`${n === this.head.ref && this.head.type === "branch" ? "* " : "  "}${n}`,
          n === this.head.ref && this.head.type === "branch" ? "ok" : ""));
      return ok(lines);
    }
    if (args[0] === "-d" || args[0] === "-D") {
      const name = args[1];
      if (!name || !this.branches.has(name)) return err(`error: branch '${name ?? ""}' not found`);
      if (this.head.type === "branch" && this.head.ref === name)
        return err(`error: cannot delete branch '${name}' — you're on it`);
      this.branches.delete(name);
      return ok([L(`Deleted branch ${name}.`, "dim")], { changed: true });
    }
    const name = args[0];
    if (this.branches.has(name)) return err(`fatal: a branch named '${name}' already exists`);
    const head = this.headCommit();
    if (!head) return err("fatal: not a valid object name: 'main' — commit something first");
    this.branches.set(name, head.id);
    return ok([L(`created branch '${name}' at ${head.hash}`, "dim")], { changed: true });
  }

  _doSwitch(name) {
    const tip = this.branches.get(name);
    this.head = { type: "branch", ref: name };
    this._loadWorkdir(this.commits.get(tip));
    return ok([L(`Switched to branch '${name}'`, "info")], { changed: true });
  }

  _checkout(args) {
    if (this.mergeState) return err("error: you're in the middle of a merge — finish it (git commit) or reset");
    if (args[0] === "-b") {
      const name = args[1];
      if (!name) return err("git checkout -b: missing branch name");
      if (this.branches.has(name)) return err(`fatal: a branch named '${name}' already exists`);
      const head = this.headCommit();
      if (!head) return err("fatal: not a valid object name — commit something first");
      this.branches.set(name, head.id);
      return this._doSwitch(name);
    }
    return this._switchTo(args[0]);
  }

  _switch(args) {
    if (this.mergeState) return err("error: you're in the middle of a merge — finish it (git commit) or reset");
    if (args[0] === "-c") {
      const name = args[1];
      if (!name) return err("git switch -c: missing branch name");
      if (this.branches.has(name)) return err(`fatal: a branch named '${name}' already exists`);
      const head = this.headCommit();
      if (!head) return err("fatal: not a valid object name — commit something first");
      this.branches.set(name, head.id);
      return this._doSwitch(name);
    }
    if (args[0] === "--detach") {
      const id = this._resolveRef(args[1]);
      if (!id) return err(`fatal: invalid reference: ${args[1]}`);
      this.head = { type: "detached", ref: id };
      this._loadWorkdir(this.commits.get(id));
      return ok([L(`HEAD is now at ${this.commits.get(id).hash} ${this.commits.get(id).message}`, "warn")], { changed: true });
    }
    const name = args[0];
    if (name === undefined) return err("git switch: missing branch name");
    if (!this.branches.has(name)) return err(`fatal: invalid reference: ${name}`);
    if (this.head.type === "branch" && this.head.ref === name)
      return ok(`Already on '${name}'`);
    return this._doSwitch(name);
  }

  _switchTo(name) {
    if (name === undefined) return err("git checkout: missing branch or commit");
    if (this.branches.has(name)) {
      if (this.head.type === "branch" && this.head.ref === name)
        return ok([L(`Already on '${name}'`, "dim"), L("hint: your commits land on the checked-out branch", "dim")]);
      return this._doSwitch(name);
    }
    const id = this._resolveRef(name);
    if (id) {
      this.head = { type: "detached", ref: id };
      this._loadWorkdir(this.commits.get(id));
      return ok([L(`Note: switching to '${name}' — detached HEAD`, "warn"),
                 L(`HEAD is now at ${this.commits.get(id).hash} ${this.commits.get(id).message}`, "info")], { changed: true });
    }
    return err(`error: pathspec '${name}' did not match any file(s) known to git`);
  }

  _merge(args) {
    if (this.mergeState) return err("error: merge already in progress — resolve conflicts, git add, git commit");
    const name = args[0];
    if (!name) return err("git merge: missing branch name");
    if (!this.branches.has(name)) return err(`merge: ${name} - not something we can merge`);
    if (this.head.type !== "branch") return err("fatal: you are in detached HEAD — switch to a branch first");
    if (this.head.ref === name) return err("fatal: cannot merge a branch into itself");

    const head = this.headCommit();
    const other = this.commits.get(this.branches.get(name));
    if (!head) return err("fatal: current branch has no commits");
    if (!other) return err(`fatal: branch '${name}' has no commits`);

    if (this._ancestors(head.id).has(other.id))
      return ok(L("Already up to date.", "dim"));

    if (this._ancestors(other.id).has(head.id)) {
      this.branches.set(this.head.ref, other.id);
      this._loadWorkdir(other);
      return ok([L(`Updating ${head.hash}..${other.hash}`, "info"),
                 L("Fast-forward", "ok")], { changed: true });
    }

    // true merge — compute conflicts vs merge base
    const base = this.commits.get(this._mergeBase(head.id, other.id));
    const baseF = base ? base.files : new Map();
    const allFiles = new Set([...baseF.keys(), ...head.files.keys(), ...other.files.keys()]);
    const merged = new Map(head.files);
    const conflicts = new Set();
    for (const f of allFiles) {
      const b = baseF.get(f), o = head.files.get(f), t = other.files.get(f);
      if (o === t) { merged.set(f, o); continue; }
      if (o === b) merged.set(f, t);          // only they changed it
      else if (t === b) merged.set(f, o);     // only we changed it
      else {
        conflicts.add(f);
        merged.set(f, `${CONFLICT_MARK} HEAD\n${o ?? ""}\n=======\n${t ?? ""}\n>>>>>>> ${name}`);
      }
    }
    this.workdir = merged;
    if (!conflicts.size) {
      const c = this._commit(`Merge branch '${name}'`, [head.id, other.id], merged);
      this.branches.set(this.head.ref, c.id);
      return ok([L(`Merge made by the 'ort' strategy. (${c.hash})`, "ok")], { changed: true });
    }
    this.mergeState = { branch: name, tip: other.id, conflicts };
    return ok([L(`Auto-merging ${[...conflicts].join(", ")}`, "warn"),
               L(`CONFLICT (content): Merge conflict in ${[...conflicts].join(", ")}`, "err"),
               L("Automatic merge failed; fix conflicts and then commit the result.", "warn"),
               L("hint: echo \"resolved text\" > file · git add file · git commit -m \"merge\"", "dim")],
              { changed: true });
  }

  _rebase(args) {
    if (this.mergeState) return err("error: finish the merge first");
    const name = args[0];
    if (!name) return err("git rebase: missing target branch");
    if (this.head.type !== "branch") return err("fatal: rebase needs a branch checked out");
    const ontoId = this._resolveRef(name);
    if (!ontoId) return err(`fatal: invalid reference: ${name}`);
    const head = this.headCommit();
    if (!head) return err("fatal: no commits yet");

    // commits on this branch not reachable from onto
    const ontoAnc = this._ancestors(ontoId);
    if (ontoAnc.has(head.id)) return ok(L(`Current branch ${this.head.ref} is up to date.`, "dim"));
    const replay = [];
    const seen = new Set();
    const walk = id => {
      if (!id || seen.has(id) || ontoAnc.has(id)) return;
      seen.add(id);
      const c = this.commits.get(id);
      if (c.parents.length > 1) throw "merge";
      walk(c.parents[0]);
      replay.push(c);
    };
    try { walk(head.id); } catch {
      return err("GitQuest can't rebase merge commits — keep it linear!");
    }
    let parent = ontoId;
    const lines = [];
    for (const c of replay) {
      const nc = this._commit(c.message, [parent], c.files);
      lines.push(L(`applying: ${c.message} → ${nc.hash}`, "dim"));
      parent = nc.id;
    }
    this.branches.set(this.head.ref, parent);
    this._loadWorkdir(this.commits.get(parent));
    lines.push(L(`Successfully rebased ${this.head.ref} onto ${name}.`, "ok"));
    return ok(lines, { changed: true });
  }

  _reset(args) {
    let mode = "mixed", ref = "HEAD";
    for (const a of args) {
      if (a === "--hard" || a === "--soft") mode = a.slice(2);
      else if (!a.startsWith("-")) ref = a;
    }
    const id = this._resolveRef(ref);
    if (!id) return err(`fatal: ambiguous argument '${ref}': unknown revision`);
    if (this.head.type === "branch") this.branches.set(this.head.ref, id);
    else this.head.ref = id;
    this.mergeState = null;
    if (mode === "hard") this._loadWorkdir(this.commits.get(id));
    else this.staging.clear();
    const c = this.commits.get(id);
    return ok([L(`HEAD is now at ${c.hash} ${c.message}`, mode === "hard" ? "warn" : "info")], { changed: true });
  }

  _tag(args) {
    if (!args.length) {
      return ok([...this.tags.keys()].map(t => L(t, "branch")));
    }
    const name = args[0];
    const id = this._resolveRef(args[1] ?? "HEAD");
    if (!id) return err("fatal: no commit to tag");
    this.tags.set(name, id);
    return ok([L(`tagged ${this.commits.get(id).hash} as '${name}'`, "dim")], { changed: true });
  }

  _remote(args) {
    if (args[0] === "add") {
      const [, name, url] = args;
      if (!name || !url) return err("usage: git remote add <name> <url>");
      this.remoteUrl = url;
      this.remote = this.remote || { branches: new Map() };
      return ok([L(`remote '${name}' → ${url}`, "dim")]);
    }
    if (args[0] === "-v" || !args.length)
      return ok(this.remoteUrl ? [L(`origin\t${this.remoteUrl} (fetch)`, "dim"), L(`origin\t${this.remoteUrl} (push)`, "dim")] : []);
    return err(`git remote: unknown subcommand '${args[0]}'`);
  }

  _push(args) {
    if (!this.remote) return err("fatal: no configured push destination.\nhint: git remote add origin https://gitquest.dev/repo.git");
    let branch = null;
    for (const a of args) if (a !== "origin" && !a.startsWith("-")) branch = a;
    branch = branch ?? this.headName();
    if (!branch || !this.branches.has(branch)) return err(`error: src refspec ${branch} does not match any`);
    const tip = this.branches.get(branch);
    if (!tip) return err(`error: branch '${branch}' has no commits`);
    const remoteTip = this.remote.branches.get(branch);
    if (remoteTip && !this._ancestors(tip).has(remoteTip))
      return err("! [rejected] non-fast-forward — fetch and merge first (git pull)");
    this.remote.branches.set(branch, tip);
    return ok([L(`To ${this.remoteUrl}`, "dim"),
               L(`   ${remoteTip ? this.commits.get(remoteTip).hash : "(new)"}..${this.commits.get(tip).hash}  ${branch} -> ${branch}`, "ok"),
               L("pushed! your work is out there 🚀", "info")], { changed: true });
  }

  _pull() {
    if (!this.remote) return err("fatal: no configured remote");
    const branch = this.headName();
    const remoteTip = this.remote.branches.get(branch);
    if (!remoteTip) return err(`fatal: couldn't find remote ref ${branch}`);
    const tip = this.branches.get(branch);
    if (tip === remoteTip) return ok(L("Already up to date.", "dim"));
    if (!tip || this._ancestors(remoteTip).has(tip)) {
      this.branches.set(branch, remoteTip);
      this._loadWorkdir(this.commits.get(remoteTip));
      return ok(L("Fast-forward", "ok"), { changed: true });
    }
    return err("fatal: diverged — GitQuest keeps pulls simple; try reset --hard");
  }

  _diff() {
    const head = this.headCommit();
    const headFiles = head ? head.files : new Map();
    const lines = [];
    for (const [f, c] of this.workdir) {
      const staged = this.staging.get(f);
      const base = staged ?? headFiles.get(f);
      if (base !== c) {
        lines.push(L(`diff --git a/${f} b/${f}`, "info"));
        if (base !== undefined) lines.push(L(`- ${base}`, "err"));
        lines.push(L(`+ ${c}`, "ok"));
      }
    }
    return ok(lines.length ? lines : [L("(no unstaged changes)", "dim")]);
  }

  // ---------- graph view (for renderer + equality) ----------

  graphView() {
    const headC = this.headCommit();
    return {
      commits: this.order.map(id => {
        const c = this.commits.get(id);
        return { id, hash: c.hash, message: c.message, parents: [...c.parents], seq: c.seq, files: c.files };
      }),
      branches: new Map(this.branches),
      head: { ...this.head },
      headId: headC?.id ?? null,
      tags: new Map(this.tags),
      remote: this.remote ? new Map(this.remote.branches) : null,
    };
  }
}

export const HELP = [
  { text: "─── gitquest commands ───", cls: "info" },
  { text: "  git init                  start a repo", cls: "" },
  { text: "  touch <f> / echo x > <f>  create / write a file", cls: "" },
  { text: "  git add <f|.>             stage changes", cls: "" },
  { text: "  git commit -m \"msg\"       commit staged changes", cls: "" },
  { text: "  git status / git log      inspect state & history", cls: "" },
  { text: "  git branch <b>            create a branch", cls: "" },
  { text: "  git switch/checkout <b>   move to a branch (-c/-b creates)", cls: "" },
  { text: "  git merge <b>             merge a branch into yours", cls: "" },
  { text: "  git rebase <b>            replay your commits onto <b>", cls: "" },
  { text: "  git reset --hard <ref>    move back (HEAD~1 works)", cls: "" },
  { text: "  git tag <n> · git remote add · git push", cls: "" },
  { text: "  cat <f> · ls · rm <f> · git diff · clear", cls: "dim" },
].map(l => L(l.text, l.cls));

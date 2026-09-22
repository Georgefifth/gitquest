// node test/engine.test.mjs — engine + level solvability tests.
import { Repo } from "../js/engine/git.js";
import { graphsEqual } from "../js/engine/check.js";
import { LEVELS } from "../js/engine/levels.js";

let pass = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}`); }
};
const run = (repo, cmds) => {
  for (const c of cmds) {
    const r = repo.exec(c);
    if (!r.ok) throw new Error(`cmd failed: ${c}\n  → ${JSON.stringify(r.lines)}`);
  }
};
const build = cmds => { const r = new Repo(); run(r, cmds); return r; };

console.log("== engine basics ==");
{
  const r = new Repo();
  t("init", r.exec("git init").ok && r.initialized);
  t("commit needs staging", !r.exec('git commit -m "x"').ok);
  run(r, ["touch a.txt", "git add a.txt", 'git commit -m "one"']);
  t("1 commit", r.order.length === 1);
  run(r, ["git switch -c f"]);
  t("branch+switch", r.branches.has("f") && r.head.ref === "f");
  run(r, ['echo "x" > b.txt', "git add b.txt", 'git commit -m "two"']);
  t("commit on f", r.branches.get("f") !== r.branches.get("main"));
  t("status ok", r.exec("git status").ok);
  t("log ok", r.exec("git log").ok);
  t("bad cmd", !r.exec("git frobnicate").ok);
  t("not-a-repo error", !new Repo().exec("git status").ok);
}

console.log("== merge ==");
{
  const r = build([
    "git init", "touch a", "git add a", 'git commit -m "init"',
    "git switch -c f", 'echo "F" > f.txt', "git add f.txt", 'git commit -m "f"',
    "git switch main", 'echo "M" > m.txt', "git add m.txt", 'git commit -m "m"',
  ]);
  const res = r.exec("git merge f");
  t("clean merge commit", res.ok && r.headCommit().parents.length === 2);

  const ff = build([
    "git init", "touch a", "git add a", 'git commit -m "init"',
    "git switch -c f", 'echo "x" > b', "git add b", 'git commit -m "b"',
    "git switch main",
  ]);
  const res2 = ff.exec("git merge f");
  t("fast-forward", res2.ok && ff.headCommit().parents.length === 1 &&
    ff.branches.get("main") === ff.branches.get("f"));

  const cf = build([
    "git init", 'echo "v1" > c.txt', "git add c.txt", 'git commit -m "v1"',
    "git switch -c t", 'echo "a" > c.txt', "git add c.txt", 'git commit -m "a"',
    "git switch main", 'echo "b" > c.txt', "git add c.txt", 'git commit -m "b"',
  ]);
  const res3 = cf.exec("git merge t");
  t("conflict detected", res3.ok && cf.mergeState?.conflicts.has("c.txt"));
  t("commit blocked by markers", !cf.exec('git commit -m "m"').ok);
  run(cf, ['echo "v2" > c.txt', "git add c.txt"]);
  const done = cf.exec('git commit -m "merge t"');
  t("resolve merge", done.ok && cf.headCommit().parents.length === 2 && !cf.mergeState);
}

console.log("== rebase/reset/tag/push ==");
{
  const r = build([
    "git init", "touch b", "git add b", 'git commit -m "base"',
    "git switch -c f", 'echo "w" > f.txt', "git add f.txt", 'git commit -m "feat"',
    "git switch main", 'echo "m" > m.txt', "git add m.txt", 'git commit -m "adv"',
    "git switch f",
  ]);
  t("rebase", r.exec("git rebase main").ok &&
    r.headCommit().parents[0] === r.branches.get("main"));

  const rs = build([
    "git init", "touch a", "git add a", 'git commit -m "1"',
    'echo "x" > a', "git add a", 'git commit -m "2"',
  ]);
  const tip = rs.branches.get("main");
  t("reset --hard", rs.exec("git reset --hard HEAD~1").ok &&
    rs.branches.get("main") !== tip);

  const tg = build(["git init", "touch a", "git add a", 'git commit -m "1"',
                    'echo "x" > a', "git add a", 'git commit -m "2"']);
  t("tag", tg.exec("git tag v1 HEAD~1").ok &&
    tg.tags.get("v1") === tg.commits.get(tg.branches.get("main")).parents[0]);

  const p = build(["git init", "touch a", "git add a", 'git commit -m "1"']);
  t("push needs remote", !p.exec("git push").ok);
  run(p, ["git remote add origin https://x.dev/r.git"]);
  t("push", p.exec("git push origin main").ok &&
    p.remote.branches.get("main") === p.branches.get("main"));
}

console.log("== levels solvable ==");
for (const lv of LEVELS) {
  const start = build(lv.setup);
  const goal = build([...lv.setup, ...lv.solution]);
  t(`${lv.id}: start ≠ goal`, lv.solution.length === 0 || !graphsEqual(start, goal));
  const player = build(lv.setup);
  run(player, lv.solution);
  t(`${lv.id}: solution wins`, graphsEqual(player, goal));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Level definitions. Pure data — replayed on a fresh Repo.
//   setup:    commands that build the player's starting state
//   solution: commands appended to setup that produce the TARGET graph
// The player wins when their repo is structurally equal to the target.

export const LEVELS = [
  {
    id: "boot",
    title: "wake up, repo",
    briefing:
      "Day one at Commit Corp. Your workstation is empty — not even a repository.\n" +
      "Every journey starts with `git init`.",
    task: "initialize a git repository",
    setup: [],
    solution: ["git init"],
    hints: ["it's literally one command", "git init"],
    par: 1,
  },
  {
    id: "first-commit",
    title: "the first commit",
    briefing:
      "An initialized repo with no commits is a ghost town.\n" +
      "Create a file called README.md, stage it, and commit it.",
    task: "create README.md, stage it, commit it",
    setup: ["git init"],
    solution: [
      "touch README.md",
      "git add README.md",
      "git commit -m \"first commit\"",
    ],
    hints: [
      "create the file first: touch README.md",
      "stage with git add README.md — then commit with -m",
      "touch README.md → git add README.md → git commit -m \"first commit\"",
    ],
    par: 3,
  },
  {
    id: "chain",
    title: "chain of custody",
    briefing:
      "One commit is a statement. Three is a story.\n" +
      "Build a chain of exactly 3 commits on main — a file must change between each.",
    task: "make a chain of 3 commits on main",
    setup: ["git init"],
    solution: [
      "touch notes.txt",
      "git add notes.txt",
      "git commit -m \"add notes\"",
      "echo \"line one\" > notes.txt",
      "git add notes.txt",
      "git commit -m \"update notes\"",
      "echo \"line two\" >> notes.txt",
      "git add .",
      "git commit -m \"more notes\"",
    ],
    hints: [
      "commit → change the file → add → commit, repeat",
      "echo \"text\" > notes.txt overwrites; >> appends",
      "you need a real file change between commits or git will refuse",
    ],
    par: 9,
  },
  {
    id: "branching-out",
    title: "branching out",
    briefing:
      "Main is sacred — you don't experiment on it.\n" +
      "Create a branch called `feature`, switch to it, and land a commit there.\n" +
      "Main must stay exactly where it is.",
    task: "commit on a new branch `feature` while main stays put",
    setup: [
      "git init",
      "touch app.js",
      "git add app.js",
      "git commit -m \"initial\"",
    ],
    solution: [
      "git switch -c feature",
      "touch feature.js",
      "git add .",
      "git commit -m \"feature work\"",
    ],
    hints: [
      "git switch -c feature creates AND switches (git checkout -b works too)",
      "check which branch you're on with git status or git branch",
      "the new commit's parent is main's tip — that's what makes it a branch",
    ],
    par: 4,
  },
  {
    id: "parallel-worlds",
    title: "parallel worlds",
    briefing:
      "Two timelines, one repo. Create branch `experiment` with its own commit,\n" +
      "then jump back to main and give main a commit of its own.\n" +
      "End up standing on main, looking at a forked history.",
    task: "diverge: one commit on `experiment`, one on `main`, end on main",
    setup: [
      "git init",
      "touch app.js",
      "git add app.js",
      "git commit -m \"initial\"",
    ],
    solution: [
      "git switch -c experiment",
      "echo \"wild idea\" > exp.txt",
      "git add exp.txt",
      "git commit -m \"try experiment\"",
      "git switch main",
      "echo \"urgent fix\" > fix.txt",
      "git add fix.txt",
      "git commit -m \"hotfix on main\"",
    ],
    hints: [
      "order matters: branch → commit → switch back → commit",
      "git switch main takes you home; your experiment commit stays on experiment",
      "watch the graph — a fork should appear",
    ],
    par: 8,
  },
  {
    id: "the-merge",
    title: "the merge",
    briefing:
      "Both timelines have something worth keeping.\n" +
      "Merge `experiment` into `main` and weave them into one history.\n" +
      "You're already on main.",
    task: "merge `experiment` into `main` (a real merge commit)",
    setup: [
      "git init",
      "touch app.js",
      "git add app.js",
      "git commit -m \"initial\"",
      "git switch -c experiment",
      "echo \"wild idea\" > exp.txt",
      "git add exp.txt",
      "git commit -m \"try experiment\"",
      "git switch main",
      "echo \"urgent fix\" > fix.txt",
      "git add fix.txt",
      "git commit -m \"hotfix on main\"",
    ],
    solution: ["git merge experiment"],
    hints: [
      "one command — the merge happens from the branch you're ON",
      "git merge experiment",
      "a merge commit has two parents — watch the graph draw it",
    ],
    par: 1,
  },
  {
    id: "conflict",
    title: "conflict resolution",
    briefing:
      "Both branches edited config.txt differently. Git can't decide — you must.\n" +
      "Merge `tuning` into `main`, survive the conflict, and resolve it\n" +
      "so that config.txt contains exactly: v2",
    task: "merge `tuning`, resolve the conflict → config.txt = \"v2\"",
    setup: [
      "git init",
      "echo \"v1\" > config.txt",
      "git add config.txt",
      "git commit -m \"v1 config\"",
      "git switch -c tuning",
      "echo \"v2-beta\" > config.txt",
      "git add config.txt",
      "git commit -m \"experimental tuning\"",
      "git switch main",
      "echo \"v2-stable\" > config.txt",
      "git add config.txt",
      "git commit -m \"stable config\"",
    ],
    solution: [
      "git merge tuning",
      "echo \"v2\" > config.txt",
      "git add config.txt",
      "git commit -m \"merge tuning\"",
    ],
    hints: [
      "merge first — the conflict is expected, not a bug",
      "cat config.txt shows the markers; overwrite it: echo \"v2\" > config.txt",
      "after editing: git add config.txt, then git commit -m \"...\" finishes the merge",
    ],
    par: 4,
  },
  {
    id: "tag-youre-it",
    title: "tag, you're it",
    briefing:
      "Releases are just commits with a name.\n" +
      "Mark the very FIRST commit in this repo as version `v0.1`.",
    task: "tag the first commit as v0.1",
    setup: [
      "git init",
      "touch app.js",
      "git add app.js",
      "git commit -m \"v1\"",
      "echo \"improved\" >> app.js",
      "git add app.js",
      "git commit -m \"v2\"",
      "echo \"polished\" >> app.js",
      "git add app.js",
      "git commit -m \"v3\"",
    ],
    solution: ["git tag v0.1 HEAD~2"],
    hints: [
      "HEAD~2 means \"2 commits before HEAD\" — that's the first one",
      "git tag v0.1 HEAD~2",
      "git log shows which commit you're tagging",
    ],
    par: 1,
  },
  {
    id: "linear-dream",
    title: "linear dream",
    briefing:
      "Some teams hate merge bubbles — they want history in a straight line.\n" +
      "`feature` branched off before main moved. Rebase `feature` onto `main`\n" +
      "so its commit sits on top, then end on `feature`.",
    task: "rebase `feature` onto `main` — linear history, end on feature",
    setup: [
      "git init",
      "touch base.txt",
      "git add base.txt",
      "git commit -m \"base\"",
      "git switch -c feature",
      "echo \"my work\" > feat.txt",
      "git add feat.txt",
      "git commit -m \"feature work\"",
      "git switch main",
      "echo \"main moved\" > main.txt",
      "git add main.txt",
      "git commit -m \"main advances\"",
    ],
    solution: [
      "git switch feature",
      "git rebase main",
    ],
    hints: [
      "you rebase the branch you're ON — switch first",
      "git switch feature → git rebase main",
      "rebase replays your commit on top of main's tip",
    ],
    par: 2,
  },
  {
    id: "time-travel",
    title: "time travel",
    briefing:
      "That last commit — \"oops broke everything\" — broke everything.\n" +
      "Rewind main one commit so it never happened (well… mostly).",
    task: "reset main back one commit",
    setup: [
      "git init",
      "echo \"wip\" > work.txt",
      "git add work.txt",
      "git commit -m \"wip\"",
      "echo \"more\" >> work.txt",
      "git add work.txt",
      "git commit -m \"wip 2\"",
      "echo \"🔥\" >> work.txt",
      "git add work.txt",
      "git commit -m \"oops broke everything\"",
    ],
    solution: ["git reset --hard HEAD~1"],
    hints: [
      "git reset --hard rewinds the branch AND the working files",
      "HEAD~1 = one commit back",
      "git reset --hard HEAD~1",
    ],
    par: 1,
  },
  {
    id: "ship-it",
    title: "ship it",
    briefing:
      "Final exam. Your work means nothing if it never leaves your machine.\n" +
      "Connect a remote called `origin` and push main to it.\n" +
      "(any url works — it's a simulated remote)",
    task: "git remote add origin <url>, then push main",
    setup: [
      "git init",
      "touch README.md",
      "git add README.md",
      "git commit -m \"project\"",
      "echo \"shiny\" >> README.md",
      "git add README.md",
      "git commit -m \"ready to ship\"",
    ],
    solution: [
      "git remote add origin https://gitquest.dev/repo.git",
      "git push origin main",
    ],
    hints: [
      "two commands: remote add, then push",
      "git remote add origin https://gitquest.dev/repo.git",
      "git push origin main  (or just: git push)",
    ],
    par: 2,
  },
];

export const SANDBOX = {
  id: "sandbox",
  title: "sandbox",
  briefing: "Free play. Every command works. Break things — that's how you learn.",
  task: "",
  setup: ["git init"],
  solution: [],
  hints: [],
  par: Infinity,
};

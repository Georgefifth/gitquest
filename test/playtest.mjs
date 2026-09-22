// Full-flow playtest: boots the game in headless Firefox, plays all 11 levels
// using each level's own solution script, and exercises UI features.
// Usage: python3 -m http.server 8000 (in repo root) && node test/playtest.mjs
import { firefox } from "playwright";
import { LEVELS } from "../js/engine/levels.js";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:8000";
const SHOTS = "shots";
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}`); }
};

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("pageerror", e => consoleErrors.push(String(e)));
page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("dialog", d => d.accept());

const cmd = async c => { await page.fill("#term-in", c); await page.press("#term-in", "Enter"); };
const termText = () => page.locator("#term-out").innerText();
const modalOpen = () => page.waitForSelector("#complete-modal:not(.hidden)", { timeout: 8000 });

console.log("== boot & select ==");
await page.goto(BASE);
await page.waitForSelector("#boot-title:not(.hidden)", { timeout: 15000 });
await page.screenshot({ path: `${SHOTS}/01-boot.png` });
await page.keyboard.press("Enter");
await page.waitForSelector("#select-screen.active");
check("timeline nodes", (await page.locator(".tl-commit").count()) === LEVELS.length);
check("levels locked beyond first",
  (await page.locator(".tl-commit:disabled").count()) === LEVELS.length - 1);
await page.screenshot({ path: `${SHOTS}/02-select.png` });

console.log("== sandbox ==");
await page.click("#btn-sandbox");
await page.waitForSelector("#play-screen.active");
await page.click("#terminal");
await cmd("git status");
check("sandbox repo ready", (await termText()).includes("On branch main"));
await cmd("git log");
await page.click("#btn-back");
await page.waitForSelector("#select-screen.active");
check("map button returns", true);

console.log("== level 1: error path ==");
await page.locator(".tl-commit").nth(0).click();
await page.waitForSelector("#play-screen.active");
await page.click("#terminal");
await cmd("git status");
check("not-a-repo error", (await termText()).includes("not a git repository"));
await cmd("solution");
check("solution cmd prints script", (await termText()).includes("git init"));
await cmd("git init");
await modalOpen();
check("level 1 complete", true);
check("solution peek caps at 1 star",
  (await page.locator("#complete-stats").innerText()).includes("peeked at solution"));

// feature tests on level 2
console.log("== level 2: hints/objective/reset ==");
await page.click("#btn-next");
await page.waitForSelector("#play-screen.active");
await page.click("#btn-hint");
check("hint printed", (await termText()).includes("hint 1/"));
await page.click("#btn-hint");
check("second hint", (await termText()).includes("hint 2/"));
await page.click("#btn-goal");
check("objective reprinted", (await termText()).includes("▸ create README.md"));
// tab completion: 'git che' -> 'git checkout'
await page.click("#terminal");
await page.fill("#term-in", "git che");
await page.press("#term-in", "Tab");
check("tab completes subcommand", (await page.locator("#term-in").inputValue()) === "git checkout");
await page.fill("#term-in", "");
// history recall
await cmd("git status");
await page.press("#term-in", "ArrowUp");
check("arrow-up recalls last cmd", (await page.locator("#term-in").inputValue()) === "git status");
await page.fill("#term-in", "");
// reset button clears repo
await cmd("git status");
await page.click("#btn-reset-level");
check("reset clears", (await termText()).includes("level reset") && !(await termText()).includes("root-commit"));
// solve
for (const c of LEVELS[1].solution) await cmd(c);
await modalOpen();
await page.screenshot({ path: `${SHOTS}/04-win.png` });
check("level 2 complete", true);

console.log("== level 3 ==");
await page.click("#btn-next");
await page.waitForSelector("#play-screen.active");
for (const c of LEVELS[2].solution) await cmd(c);
await modalOpen();
check("level 3 complete", true);

console.log("== level 4: diverge warning + undo recovery ==");
await page.click("#btn-next");
await page.waitForSelector("#play-screen.active");
await cmd("touch x.txt");
await cmd("git add x.txt");
await cmd('git commit -m "mistake on main"');
check("first stray commit tolerated", !(await termText()).includes("can't grow into the target"));
await cmd('echo "more" >> x.txt');
await cmd("git add x.txt");
await cmd('git commit -m "deeper mistake"');
check("diverge warning shown", (await termText()).includes("can't grow into the target"));
await page.screenshot({ path: `${SHOTS}/05-diverge.png` });
await cmd("undo");
await cmd("undo");
for (const c of LEVELS[3].solution) await cmd(c);
await modalOpen();
check("level 4 complete after undo", true);

console.log("== levels 5-11: full playthrough ==");
for (let i = 4; i < LEVELS.length; i++) {
  await page.click("#btn-next");
  await page.waitForSelector("#play-screen.active");
  const lv = LEVELS[i];
  if (i === 6) {
    // run merge first, screenshot the conflict state, then resolve
    await cmd("git merge tuning");
    check("conflict announced", (await termText()).includes("CONFLICT"));
    await page.screenshot({ path: `${SHOTS}/06-conflict.png` });
    for (const c of lv.solution.slice(1)) await cmd(c);
  } else {
    for (const c of lv.solution) await cmd(c);
  }
  try {
    await modalOpen();
    check(`level ${i + 1} (${lv.id}) complete`, true);
  } catch {
    check(`level ${i + 1} (${lv.id}) complete`, false);
    await page.screenshot({ path: `${SHOTS}/FAIL-level-${i + 1}.png` });
    break;
  }
}
await page.screenshot({ path: `${SHOTS}/07-final-win.png` });
await page.click("#btn-tomap");
await page.waitForSelector("#select-screen.active");
await page.screenshot({ path: `${SHOTS}/08-select-done.png` });
check("all unlocked after finish",
  (await page.locator(".tl-commit:disabled").count()) === 0);

console.log("== persistence ==");
await page.reload();
await page.waitForSelector("#boot-title:not(.hidden)", { timeout: 15000 });
await page.keyboard.press("Enter");
await page.waitForSelector("#select-screen.active");
check("stars persisted after reload",
  (await page.locator(".tl-commit .stars").allInnerTexts()).some(s => s.includes("★")));

console.log("== reset progress ==");
await page.click("#btn-reset-progress");
check("progress wiped", (await page.locator(".tl-commit:disabled").count()) === LEVELS.length - 1);

check("no console errors", consoleErrors.length === 0);
if (consoleErrors.length) console.log("console errors:", consoleErrors.slice(0, 5));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

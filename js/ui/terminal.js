// Terminal UI: output rendering, input history, tab completion.

export class Term {
  constructor(root, { onCommand, onKey, complete }) {
    this.out = root.querySelector("#term-out");
    this.input = root.querySelector("#term-in");
    this.promptEl = root.querySelector("#prompt");
    this.history = [];
    this.hi = 0;
    this.onCommand = onCommand;
    this.onKey = onKey ?? (() => {});
    this.complete = complete ?? (() => []);
    this._compState = null;

    root.addEventListener("click", () => this.input.focus());
    this.input.addEventListener("keydown", e => this._key(e));
  }

  print(lines) {
    for (const line of [].concat(lines)) {
      const div = document.createElement("div");
      div.className = "line";
      const segs = Array.isArray(line) ? line : [line];
      for (const s of segs) {
        const span = document.createElement("span");
        span.textContent = typeof s === "string" ? s : s.text;
        if (s.cls) span.className = s.cls;
        div.appendChild(span);
      }
      this.out.appendChild(div);
    }
    this.scroll();
  }

  echo(cmd) {
    const div = document.createElement("div");
    div.className = "line";
    div.innerHTML = `<span class="prompt">~/repo <b>$</b></span> `;
    const span = document.createElement("span");
    span.textContent = cmd;
    div.appendChild(span);
    this.out.appendChild(div);
    this.scroll();
  }

  clear() { this.out.innerHTML = ""; }
  scroll() { this.out.parentElement.scrollTop = this.out.parentElement.scrollHeight; }
  setPrompt(text) { this.promptEl.innerHTML = text + " <b>$</b>"; }

  _key(e) {
    this.onKey(e);
    if (e.key === "Enter") {
      const cmd = this.input.value;
      this.input.value = "";
      if (cmd.trim()) { this.history.push(cmd); this.hi = this.history.length; }
      this._compState = null;
      this.onCommand(cmd);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this.hi > 0) this.input.value = this.history[--this.hi] ?? "";
      this._compState = null;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this.hi < this.history.length) this.input.value = this.history[++this.hi] ?? "";
      this._compState = null;
    } else if (e.key === "Tab") {
      e.preventDefault();
      this._tab();
    } else {
      this._compState = null;
    }
  }

  _tab() {
    const v = this.input.value;
    if (!this._compState || !this._compState.cands.includes(v)) {
      this._compState = { cands: this.complete(v) ?? [], i: 0 };
    }
    const { cands } = this._compState;
    if (!cands.length) return;
    this.input.value = cands[this._compState.i++ % cands.length];
  }
}

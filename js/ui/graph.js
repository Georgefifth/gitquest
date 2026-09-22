// SVG renderer for the commit DAG — git log --graph style lanes.
// view = repo.graphView(): {commits, branches, head, headId, tags, remote}

const ROW_H = 38, LANE_W = 30, NODE_R = 8, PAD_X = 26, PAD_Y = 56;
const PALETTE = ["#3aff6e", "#45e0d8", "#ffce4a", "#c792ea", "#ff5f56", "#7ab8ff"];

const SVGNS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// lane assignment: newest→oldest; each lane "expects" the commit that will occupy it
function layout(view) {
  const rows = [...view.commits].sort((a, b) => b.seq - a.seq);
  const expects = [];            // lane -> commitId | null
  const pos = new Map();         // id -> {x, y, row, lane}
  rows.forEach((c, row) => {
    // take the leftmost lane expecting this commit; clear duplicate expectations
    let lane = -1;
    for (let i = 0; i < expects.length; i++) {
      if (expects[i] === c.id) { if (lane === -1) lane = i; else expects[i] = null; }
    }
    if (lane === -1) {
      lane = expects.indexOf(null);
      if (lane === -1) { expects.push(null); lane = expects.length - 1; }
    }
    expects[lane] = c.parents[0] ?? null;
    for (const p of c.parents.slice(1)) {
      if (expects.includes(p)) continue;      // already expected elsewhere
      let l = expects.indexOf(null);
      if (l === -1) { expects.push(null); l = expects.length - 1; }
      expects[l] = p;
    }
    pos.set(c.id, { x: PAD_X + lane * LANE_W, y: PAD_Y + row * ROW_H, row, lane });
  });
  return { rows, pos, laneCount: expects.length };
}

export function renderGraph(container, view, opts = {}) {
  container.innerHTML = "";
  const { rows, pos, laneCount } = layout(view);

  if (!rows.length) {
    const d = document.createElement("div");
    d.className = "dim";
    d.style.cssText = "padding:1rem;font-size:12px;text-align:center";
    d.textContent = opts.emptyText ?? "∅ empty repo — git init to begin";
    container.appendChild(d);
    return;
  }

  const w = PAD_X * 2 + laneCount * LANE_W + 70;
  const h = PAD_Y + rows.length * ROW_H;
  const svg = el("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}` });

  const prevIds = container._prevIds ?? new Set();

  // edges under nodes
  for (const c of rows) {
    const from = pos.get(c.id);
    const color = PALETTE[from.lane % PALETTE.length];
    c.parents.forEach((pid, i) => {
      const to = pos.get(pid);
      if (!to) return;
      const my = (from.y + to.y) / 2;
      svg.appendChild(el("path", {
        d: `M ${from.x} ${from.y} C ${from.x} ${my}, ${to.x} ${my}, ${to.x} ${to.y}`,
        class: "g-edge",
        stroke: i === 0 ? color : PALETTE[to.lane % PALETTE.length],
        "stroke-opacity": .85,
      }));
    });
  }

  // branch/tag labels collected per tip commit
  const labels = new Map(); // id -> [{text, kind}]
  const addLabel = (id, text, kind) => {
    (labels.get(id) ?? labels.set(id, []).get(id)).push({ text, kind });
  };
  for (const [name, tip] of view.branches) {
    if (tip) addLabel(tip, name, "branch");
  }
  for (const [name, tip] of view.tags ?? []) addLabel(tip, `⌂ ${name}`, "tag");
  for (const [name, tip] of view.remote ?? []) addLabel(tip, `☁ ${name}`, "remote");
  if (view.head.type === "detached" && view.headId) addLabel(view.headId, "HEAD", "head");
  else if (view.head.type === "branch") {
    const tip = view.branches.get(view.head.ref);
    if (tip) addLabel(tip, "HEAD", "head");
  }

  // nodes
  for (const c of rows) {
    const p = pos.get(c.id);
    const color = PALETTE[p.lane % PALETTE.length];
    const g = el("g", { class: "g-node" + (prevIds.has(c.id) ? "" : " g-pop") });
    const isHead = c.id === view.headId;
    g.appendChild(el("circle", {
      cx: p.x, cy: p.y, r: NODE_R,
      stroke: color, fill: "#0d130d",
    }));
    g.appendChild(el("circle", { cx: p.x, cy: p.y, r: 3, fill: color }));
    if (isHead) g.appendChild(el("circle", {
      cx: p.x, cy: p.y, r: NODE_R + 4,
      stroke: "#45e0d8", fill: "none", "stroke-dasharray": "3 3",
    }));
    const hash = el("text", { x: p.x + 14, y: p.y + 3.5 });
    hash.textContent = c.hash;
    g.appendChild(hash);
    svg.appendChild(g);

    const lbls = labels.get(c.id) ?? [];
    lbls.forEach((l, i) => {
      const ty = p.y - 14 - i * 15;
      const wTxt = l.text.length * 6.4 + 10;
      const grp = el("g", { class: `g-tag g-tag-${l.kind}` });
      grp.appendChild(el("rect", {
        x: p.x - wTxt / 2, y: ty - 9.5, width: wTxt, height: 13,
        fill: l.kind === "head" ? "rgba(69,224,216,.12)"
            : l.kind === "branch" ? "rgba(255,206,74,.12)" : "rgba(199,146,234,.10)",
        stroke: l.kind === "head" ? "#45e0d8" : l.kind === "branch" ? "#ffce4a" : "#5e8a58",
        "stroke-width": .8,
      }));
      const tx = el("text", {
        x: p.x, y: ty + 1.5, "text-anchor": "middle",
        fill: l.kind === "head" ? "#45e0d8" : l.kind === "branch" ? "#ffce4a" : "#8fb389",
      });
      tx.textContent = l.text;
      grp.appendChild(tx);
      svg.appendChild(grp);
    });
  }

  container.appendChild(svg);
  container._prevIds = new Set(view.commits.map(c => c.id));
}

// Structural equality between two repo states.
// A commit's identity = hash of (sorted parent hashes + sorted file name:contents).
// Two repos are "equal" when commit-hash multisets, branch tips, HEAD position,
// tags, and remote branches all match.

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function commitSignatures(repo) {
  // id -> structural signature
  const memo = new Map();
  const sig = (id) => {
    if (memo.has(id)) return memo.get(id);
    const c = repo.commits.get(id);
    if (!c) return "∅";
    const ps = c.parents.map(sig).sort().join(",");
    const fs = [...c.files.entries()].map(([k, v]) => `${k}=${v}`).sort().join("|");
    const s = fnv(`(${ps})[${fs}]`);
    memo.set(id, s);
    return s;
  };
  for (const id of repo.commits.keys()) sig(id);
  return memo;
}

function multiset(map) {
  const m = new Map();
  for (const v of map.values()) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function multisetEq(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, n] of a) if (b.get(k) !== n) return false;
  return true;
}

function mapEq(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export function graphsEqual(a, b) {
  const sigA = commitSignatures(a), sigB = commitSignatures(b);
  const s = id => sigA.get(id) ?? sigB.get(id) ?? "∅";

  // 1. same commit multiset
  if (!multisetEq(multiset(sigA), multiset(sigB))) return false;

  // 2. same branches -> equivalent tips (null == unborn branch)
  if (!mapEq(
    new Map([...a.branches].map(([n, t]) => [n, t ? sigA.get(t) : null])),
    new Map([...b.branches].map(([n, t]) => [n, t ? sigB.get(t) : null])),
  )) return false;

  // 3. HEAD position
  if (a.head.type !== b.head.type) return false;
  if (a.head.type === "branch" ? a.head.ref !== b.head.ref
                               : sigA.get(a.head.ref) !== sigB.get(b.head.ref)) return false;

  // 4. tags
  if (!mapEq(
    new Map([...a.tags].map(([n, t]) => [n, sigA.get(t)])),
    new Map([...b.tags].map(([n, t]) => [n, sigB.get(t)])),
  )) return false;

  // 5. remote branches (null remote == empty remote)
  const ra = a.remote?.branches ?? new Map();
  const rb = b.remote?.branches ?? new Map();
  if (!mapEq(
    new Map([...ra].map(([n, t]) => [n, sigA.get(t)])),
    new Map([...rb].map(([n, t]) => [n, sigB.get(t)])),
  )) return false;

  return true;
}


// Layered ("generational") layout of a family graph for print (TASK-11). Pure and synchronous: it
// runs inside the export worker thread, never on the API's event loop.
//
//   1. Generations: longest path over parent_of edges, parentless people pulled down next to their
//      children, then spouses aligned onto one row (re-propagating to descendants).
//   2. Edges spanning more than one generation get a dummy point per skipped row, so lines never
//      run through someone's box.
//   3. Order within each row: depth-first seed, then barycentre sweeps that keep spouses together;
//      the ordering with the fewest edge crossings is kept.
//   4. X positions: per row, a weighted isotonic regression (pool-adjacent-violators) places each box
//      as close as possible to the centre of its relatives without overlapping. Spouses move as
//      one block. Passes alternate downward and upward, then balance between both directions.
//   5. Lines: children of the same parents share one horizontal bus; buses and non-adjacent spouse
//      arcs get their own tracks, and the vertical gap between rows grows to fit them.
//   6. Disconnected families (and people without relationships) are packed onto shelves.

export interface TreeMember {
  id: string;
  name: string;
}

export interface TreeRelationship {
  id: string;
  type: 'parent_of' | 'spouse_of';
  /** parent_of: the parent. spouse_of: either partner. */
  from: string;
  to: string;
}

/** Measures shaped text (text-engine.ts in production; any consistent measure in tests). */
export interface TextMeasure {
  /** Width in points of `text` at `size`. */
  width(text: string, size: number): number;
  /** Characters no available font can show. */
  missing(text: string): number;
}

export interface LayoutOptions {
  /** Name text size in points at 100% scale. */
  labelSize: number;
  showNumbers: boolean;
  measure: TextMeasure;
}

/** Indic scripts have marks above and below the line, so their lines need more height. */
export const hasIndic = (text: string) => /[ऀ-૿꣠-ꣿ᳐-᳿]/.test(text);

export type Point = readonly [number, number];

export interface LayoutNode {
  id: string;
  /** 1-based reference number, in reading order. */
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Label lines (Unicode; shaped when drawn). */
  lines: string[];
  truncated: boolean;
  generation: number;
  component: number;
}

export interface LayoutEdge {
  kind: 'parent' | 'spouse' | 'spouse_unaligned';
  /** Relationships this drawing represents (a family bus represents several). */
  relationshipIds: string[];
  /** Polylines; for `spouse` an adjacent pair is drawn as a double line by the renderer. */
  paths: Point[][];
  double: boolean;
}

export interface LayoutMetrics {
  labelSize: number;
  lineHeight: number;
  numberSize: number;
  padding: number;
  boxWidth: number;
  boxHeight: number;
  lineWidth: number;
}

export interface LayoutStats {
  members: number;
  relationships: number;
  components: number;
  /** Largest number of generations in one family group. */
  generations: number;
  widestRow: number;
  dummyPoints: number;
  crossings: number;
  unalignedSpouses: number;
  nonAdjacentSpouses: number;
  truncatedLabels: number;
  unsupportedCharacters: number;
  membersWithoutRelationships: number;
}

export interface TreeLayout {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  metrics: LayoutMetrics;
  stats: LayoutStats;
}

const MAX_LABEL_LINES = 4;
const SWEEP_ITERATIONS = 6;
const POSITION_ITERATIONS = 8;
const BALANCE_ITERATIONS = 4;

export function layoutMetrics({ labelSize, showNumbers }: Pick<LayoutOptions, 'labelSize' | 'showNumbers'>, maxLines: number, tall = false): LayoutMetrics {
  const lineHeight = labelSize * (tall ? 1.5 : 1.25);
  const numberSize = labelSize * 0.62;
  const padding = labelSize * 0.55;
  const boxWidth = labelSize * 12;
  const numberRow = showNumbers ? numberSize * 1.25 : 0;
  return {
    labelSize,
    lineHeight,
    numberSize,
    padding,
    boxWidth,
    boxHeight: padding * 2 + numberRow + Math.max(1, maxLines) * lineHeight,
    lineWidth: Math.max(0.4, labelSize * 0.075),
  };
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Greedy word wrap to `maxWidth`. A word wider than a line is split between grapheme clusters
 * (never inside an Indic conjunct or a letter with its marks). More than `maxLines` is cut with
 * an ellipsis.
 */
export function wrapLabel(text: string, size: number, maxWidth: number, measure: Pick<TextMeasure, 'width'>, maxLines = MAX_LABEL_LINES): { lines: string[]; truncated: boolean } {
  const width = (t: string) => measure.width(t, size);
  const words = text.split(/\s+/).filter((w) => w !== '');
  const lines: string[] = [];
  let current = '';
  const pushWord = (whole: string) => {
    // A hyphenated word breaks after its last hyphen that still fits ("Álvarez-" / "Ānand…").
    let word = whole;
    for (let at = word.lastIndexOf('-'); width(word) > maxWidth && at > 0; at = word.lastIndexOf('-', at - 1)) {
      if (at < word.length - 1 && width(word.slice(0, at + 1)) <= maxWidth) {
        lines.push(word.slice(0, at + 1));
        word = word.slice(at + 1);
        at = word.length;
      }
    }
    let rest = [...graphemes.segment(word)].map((g) => g.segment);
    while (rest.length > 1 && width(rest.join('')) > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && width(rest.slice(0, cut).join('')) > maxWidth) {
        cut -= 1;
      }
      lines.push(rest.slice(0, cut).join(''));
      rest = rest.slice(cut);
    }
    current = rest.join('');
  };
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (width(candidate) <= maxWidth) {
      current = candidate;
    } else {
      if (current !== '') {
        lines.push(current);
      }
      current = '';
      pushWord(word);
    }
  }
  if (current !== '' || lines.length === 0) {
    lines.push(current);
  }
  if (lines.length <= maxLines) {
    return { lines, truncated: false };
  }
  const kept = lines.slice(0, maxLines);
  let last = [...graphemes.segment(kept[maxLines - 1]!)].map((g) => g.segment);
  while (last.length > 0 && width(`${last.join('')}…`) > maxWidth) {
    last = last.slice(0, -1);
  }
  kept[maxLines - 1] = `${last.join('').trimEnd()}…`;
  return { lines: kept, truncated: true };
}

/** Weighted isotonic regression (non-decreasing) by pool-adjacent-violators. */
function isotonic(targets: number[], weights: number[]): number[] {
  const value: number[] = [];
  const weight: number[] = [];
  const size: number[] = [];
  for (let i = 0; i < targets.length; i += 1) {
    value.push(targets[i]!);
    weight.push(weights[i]!);
    size.push(1);
    while (value.length > 1 && value[value.length - 2]! > value[value.length - 1]!) {
      const w = weight[weight.length - 2]! + weight[weight.length - 1]!;
      const v = (value[value.length - 2]! * weight[weight.length - 2]! + value[value.length - 1]! * weight[weight.length - 1]!) / w;
      const s = size[size.length - 2]! + size[size.length - 1]!;
      value.length -= 1;
      weight.length -= 1;
      size.length -= 1;
      value[value.length - 1] = v;
      weight[weight.length - 1] = w;
      size[size.length - 1] = s;
    }
  }
  const out: number[] = [];
  value.forEach((v, i) => {
    for (let k = 0; k < size[i]!; k += 1) {
      out.push(v);
    }
  });
  return out;
}

/**
 * Crossings between two adjacent rows, counted with a Fenwick tree in O(E log V). Children of the
 * same parents share one bus, so each child counts as one connection from its parents' centre;
 * that is what is actually drawn.
 */
function countCrossings(lower: number[], upOf: (el: number) => number[], pos: Int32Array): number {
  const pairs: Array<[number, number]> = [];
  for (const d of lower) {
    const ups = upOf(d);
    if (ups.length > 0) {
      pairs.push([ups.reduce((s, u) => s + pos[u]!, 0) / ups.length, pos[d]!]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const size = lower.length + 1;
  const tree = new Int32Array(size + 1);
  let crossings = 0;
  let seen = 0;
  for (const [, l] of pairs) {
    // Count already-seen edges whose lower end is to the right of this one.
    let i = l + 1;
    let notGreater = 0;
    while (i > 0) {
      notGreater += tree[i]!;
      i -= i & -i;
    }
    crossings += seen - notGreater;
    for (let j = l + 1; j <= size; j += j & -j) {
      tree[j]! += 1;
    }
    seen += 1;
  }
  return crossings;
}

interface Element {
  /** Member index, or -1 for a dummy point. */
  member: number;
  layer: number;
  width: number;
  up: number[];
  down: number[];
  /** For dummies: the relationship the chain draws. */
  relationship?: string;
}

/** Assigns each member an interval [start, end) of intervals' tracks so overlapping intervals differ. */
function assignTracks(intervals: Array<{ start: number; end: number }>, spacing: number): { tracks: number[]; count: number } {
  const order = intervals.map((_, i) => i).sort((a, b) => intervals[a]!.start - intervals[b]!.start || intervals[a]!.end - intervals[b]!.end);
  const trackEnds: number[] = [];
  const tracks = new Array<number>(intervals.length).fill(0);
  for (const i of order) {
    const { start, end } = intervals[i]!;
    let t = trackEnds.findIndex((e) => e + spacing <= start);
    if (t === -1) {
      t = trackEnds.length;
      trackEnds.push(end);
    } else {
      trackEnds[t] = end;
    }
    tracks[i] = t;
  }
  return { tracks, count: trackEnds.length };
}

export function layoutTree(members: readonly TreeMember[], relationships: readonly TreeRelationship[], options: LayoutOptions): TreeLayout {
  const index = new Map<string, number>();
  members.forEach((m, i) => index.set(m.id, i));
  const count = members.length;

  // ---- Labels and box size ----------------------------------------------------------------
  const probe = layoutMetrics(options, 1);
  const innerWidth = probe.boxWidth - probe.padding * 2;
  let unsupportedCharacters = 0;
  let truncatedLabels = 0;
  const tall = members.some((m) => hasIndic(m.name));
  const labels = members.map((m) => {
    unsupportedCharacters += options.measure.missing(m.name);
    const wrapped = wrapLabel(m.name, options.labelSize, innerWidth, options.measure);
    if (wrapped.truncated) {
      truncatedLabels += 1;
    }
    return wrapped;
  });
  const metrics = layoutMetrics(options, Math.max(1, ...labels.map((l) => l.lines.length)), tall);
  const W = metrics.boxWidth;
  const H = metrics.boxHeight;

  // ---- Graph --------------------------------------------------------------------------------
  const parents: number[][] = Array.from({ length: count }, () => []);
  const children: number[][] = Array.from({ length: count }, () => []);
  const parentRel = new Map<string, string>();
  const spouseEdges: Array<{ a: number; b: number; id: string }> = [];
  const parentEdges: Array<{ p: number; c: number; id: string }> = [];
  const uf = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => {
    while (uf[i] !== i) {
      uf[i] = uf[uf[i]!]!;
      i = uf[i]!;
    }
    return i;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      uf[Math.max(ra, rb)] = Math.min(ra, rb);
    }
  };
  for (const r of relationships) {
    const a = index.get(r.from);
    const b = index.get(r.to);
    if (a === undefined || b === undefined || a === b) {
      throw new Error('relationship refers to a member outside the export');
    }
    unite(a, b);
    if (r.type === 'parent_of') {
      parents[b]!.push(a);
      children[a]!.push(b);
      parentRel.set(`${a}:${b}`, r.id);
      parentEdges.push({ p: a, c: b, id: r.id });
    } else {
      spouseEdges.push({ a, b, id: r.id });
    }
  }
  const byName = (x: number, y: number) => members[x]!.name.localeCompare(members[y]!.name) || members[x]!.id.localeCompare(members[y]!.id);

  // ---- 1. Generations ------------------------------------------------------------------------
  const topo: number[] = [];
  {
    const indegree = parents.map((p) => p.length);
    const queue: number[] = [];
    indegree.forEach((d, i) => d === 0 && queue.push(i));
    for (let q = 0; q < queue.length; q += 1) {
      const v = queue[q]!;
      topo.push(v);
      for (const c of children[v]!) {
        indegree[c]! -= 1;
        if (indegree[c] === 0) {
          queue.push(c);
        }
      }
    }
    if (topo.length !== count) {
      throw new Error('parent relationships contain a cycle');
    }
  }
  const gen = new Array<number>(count).fill(0);
  const propagate = () => {
    for (const v of topo) {
      for (const c of children[v]!) {
        if (gen[c]! < gen[v]! + 1) {
          gen[c] = gen[v]! + 1;
        }
      }
    }
  };
  propagate();
  // Parentless ancestors sit directly above their nearest child, not at the top row.
  for (let i = topo.length - 1; i >= 0; i -= 1) {
    const v = topo[i]!;
    if (parents[v]!.length === 0 && children[v]!.length > 0) {
      gen[v] = Math.min(...children[v]!.map((c) => gen[c]!)) - 1;
    }
  }
  // Spouses share a row. An alignment that keeps conflicting (e.g. a spouse who is also an
  // ancestor) is given up after a few attempts and drawn as a dashed connector instead.
  const aligned = new Array<boolean>(spouseEdges.length).fill(true);
  const raises = new Array<number>(spouseEdges.length).fill(0);
  for (let round = 0; round < count + 5; round += 1) {
    let changed = false;
    spouseEdges.forEach((e, i) => {
      if (!aligned[i] || gen[e.a] === gen[e.b]) {
        return;
      }
      raises[i]! += 1;
      if (raises[i]! > 3) {
        aligned[i] = false;
        return;
      }
      const target = Math.max(gen[e.a]!, gen[e.b]!);
      gen[e.a] = target;
      gen[e.b] = target;
      changed = true;
    });
    if (!changed) {
      break;
    }
    propagate();
  }
  spouseEdges.forEach((e, i) => {
    if (gen[e.a] !== gen[e.b]) {
      aligned[i] = false;
    }
  });

  // ---- Components ----------------------------------------------------------------------------
  const compOf = new Map<number, number[]>();
  for (let i = 0; i < count; i += 1) {
    const root = find(i);
    const list = compOf.get(root);
    if (list) {
      list.push(i);
    } else {
      compOf.set(root, [i]);
    }
  }
  for (const list of compOf.values()) {
    const min = Math.min(...list.map((i) => gen[i]!));
    list.forEach((i) => (gen[i]! -= min));
  }
  const memberComponents = [...compOf.values()];

  // ---- 2. Elements (members + dummy points) ----------------------------------------------------
  const elements: Element[] = members.map((_, i) => ({ member: i, layer: gen[i]!, width: W, up: [], down: [] }));
  const chains = new Map<string, number[]>();
  for (const { p, c, id } of parentEdges) {
    const span = gen[c]! - gen[p]!;
    if (span === 1) {
      elements[c]!.up.push(p);
      elements[p]!.down.push(c);
      continue;
    }
    let prev = p;
    const chain: number[] = [];
    for (let layer = gen[p]! + 1; layer < gen[c]!; layer += 1) {
      const el = elements.length;
      elements.push({ member: -1, layer, width: 0, up: [prev], down: [], relationship: id });
      elements[prev]!.down.push(el);
      chain.push(el);
      prev = el;
    }
    elements[prev]!.down.push(c);
    elements[c]!.up.push(prev);
    chains.set(id, chain);
  }
  const dummyPoints = elements.length - count;
  const chainsByComponent = new Map<number, Array<[string, number[]]>>();
  for (const [id, chain] of chains) {
    const root = find(elements[elements[chain[0]!]!.up[0]!]!.member);
    const list = chainsByComponent.get(root);
    if (list) {
      list.push([id, chain]);
    } else {
      chainsByComponent.set(root, [[id, chain]]);
    }
  }
  const spouseByComponent = new Map<number, number[]>();
  spouseEdges.forEach((e, i) => {
    const root = find(e.a);
    const list = spouseByComponent.get(root);
    if (list) {
      list.push(i);
    } else {
      spouseByComponent.set(root, [i]);
    }
  });

  // Same-row spouse units (spouses kept next to each other).
  const unitRoot = Array.from({ length: count }, (_, i) => i);
  const findUnit = (i: number): number => {
    while (unitRoot[i] !== i) {
      unitRoot[i] = unitRoot[unitRoot[i]!]!;
      i = unitRoot[i]!;
    }
    return i;
  };
  const spouseAdj: number[][] = Array.from({ length: count }, () => []);
  spouseEdges.forEach((e, i) => {
    if (aligned[i]) {
      spouseAdj[e.a]!.push(e.b);
      spouseAdj[e.b]!.push(e.a);
      const ra = findUnit(e.a);
      const rb = findUnit(e.b);
      if (ra !== rb) {
        unitRoot[Math.max(ra, rb)] = Math.min(ra, rb);
      }
    }
  });

  const pos = new Int32Array(elements.length);
  const xs = new Float64Array(elements.length);
  let totalCrossings = 0;
  let widestRow = 0;
  let maxGenerations = 0;
  let nonAdjacentSpouses = 0;
  const nodeY = new Float64Array(count);

  interface PlacedComponent {
    members: number[];
    width: number;
    height: number;
    edges: LayoutEdge[];
    layers: number[][];
  }
  const placed: PlacedComponent[] = [];

  const spouseGap = W * 0.22;
  const memberGap = W * 0.3;
  const dummyGap = W * 0.15;
  const trackSpacing = Math.max(3, metrics.labelSize * 0.55);
  const bandPad = Math.max(4, metrics.labelSize * 0.8);

  for (const compMembers of memberComponents) {
    // Elements of this component.
    const compElements: number[] = [...compMembers];
    for (const m of compMembers) {
      for (const d of elements[m]!.down) {
        let el = d;
        while (elements[el]!.member === -1) {
          compElements.push(el);
          el = elements[el]!.down[0]!;
        }
      }
    }
    const layerCount = Math.max(...compElements.map((el) => elements[el]!.layer)) + 1;
    maxGenerations = Math.max(maxGenerations, layerCount);

    // ---- 3. Ordering ----
    // Seed: depth-first from the roots, visiting spouses, then children, alphabetically.
    const layers: number[][] = Array.from({ length: layerCount }, () => []);
    const visited = new Set<number>();
    const roots = compMembers.filter((m) => parents[m]!.length === 0).sort(byName);
    const stack: number[] = [];
    const visit = (start: number) => {
      stack.push(start);
      while (stack.length > 0) {
        const el = stack.pop()!;
        if (visited.has(el)) {
          continue;
        }
        visited.add(el);
        layers[elements[el]!.layer]!.push(el);
        const next: number[] = [];
        const m = elements[el]!.member;
        if (m >= 0) {
          next.push(...[...spouseAdj[m]!].sort(byName));
          for (const s of spouseAdj[m]!) {
            // Spouses' parents come next, so in-laws stay near their child.
            next.push(...parents[s]!.filter((p) => !visited.has(p)));
          }
        }
        const downs = [...elements[el]!.down].sort((a, b) => {
          const ma = elements[a]!.member;
          const mb = elements[b]!.member;
          return ma >= 0 && mb >= 0 ? byName(ma, mb) : ma - mb;
        });
        next.push(...downs);
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (!visited.has(next[i]!)) {
            stack.push(next[i]!);
          }
        }
      }
    };
    roots.forEach(visit);
    compElements.forEach((el) => !visited.has(el) && visit(el));

    // Units: a spouse group in one row is ordered as a path where possible.
    const unitsOf = (layer: number[]): number[][] => {
      const groups = new Map<number, number[]>();
      const order: number[] = [];
      for (const el of layer) {
        const m = elements[el]!.member;
        const key = m >= 0 ? findUnit(m) : -1 - el;
        const g = groups.get(key);
        if (g) {
          g.push(el);
        } else {
          groups.set(key, [el]);
          order.push(key);
        }
      }
      return order.map((key) => {
        const group = groups.get(key)!;
        if (group.length < 3) {
          return group;
        }
        const set = new Set(group);
        const degree = (el: number) => spouseAdj[el]!.filter((s) => set.has(s)).length;
        const isPath = group.every((el) => degree(el) <= 2);
        if (isPath) {
          const start = group.find((el) => degree(el) === 1) ?? group[0]!;
          const path = [start];
          const seen = new Set(path);
          for (;;) {
            const next = spouseAdj[path[path.length - 1]!]!.find((s) => set.has(s) && !seen.has(s));
            if (next === undefined) {
              break;
            }
            path.push(next);
            seen.add(next);
          }
          return path.length === group.length ? path : group;
        }
        // A person with several spouses goes in the middle, spouses alternating either side.
        const hub = [...group].sort((a, b) => degree(b) - degree(a))[0]!;
        const others = group.filter((el) => el !== hub);
        const left = others.filter((_, i) => i % 2 === 1).reverse();
        const right = others.filter((_, i) => i % 2 === 0);
        return [...left, hub, ...right];
      });
    };
    const units = layers.map(unitsOf);
    const flatten = (u: number[][][]) => u.map((layer) => layer.flat());
    const setPositions = (ls: number[][]) => ls.forEach((layer) => layer.forEach((el, i) => (pos[el] = i)));
    const crossingsOf = (ls: number[][]) => {
      let total = 0;
      for (let k = 0; k + 1 < ls.length; k += 1) {
        total += countCrossings(ls[k + 1]!, (el) => elements[el]!.up, pos);
      }
      return total;
    };
    let current = flatten(units);
    setPositions(current);
    let best = current.map((l) => [...l]);
    let bestCrossings = crossingsOf(current);
    const sweep = (layer: number, direction: 'up' | 'down') => {
      const neighbours = (el: number) => (direction === 'down' ? elements[el]!.up : elements[el]!.down);
      const scored = units[layer]!.map((unit, i) => {
        let sum = 0;
        let n = 0;
        for (const el of unit) {
          for (const nb of neighbours(el)) {
            sum += pos[nb]!;
            n += 1;
          }
        }
        const own = unit.reduce((s, el) => s + pos[el]!, 0) / unit.length;
        // Orient a spouse pair so each partner sits on the side of their own relatives.
        if (unit.length >= 2) {
          const first = neighbours(unit[0]!);
          const last = neighbours(unit[unit.length - 1]!);
          if (first.length > 0 && last.length > 0) {
            const bf = first.reduce((s, nb) => s + pos[nb]!, 0) / first.length;
            const bl = last.reduce((s, nb) => s + pos[nb]!, 0) / last.length;
            if (bf > bl) {
              unit.reverse();
            }
          }
        }
        return { unit, key: n > 0 ? sum / n : own, tie: i };
      });
      scored.sort((a, b) => a.key - b.key || a.tie - b.tie);
      units[layer] = scored.map((s) => s.unit);
      units[layer]!.flat().forEach((el, i) => (pos[el] = i));
    };
    if (layerCount > 1 && compElements.length > 2) {
      for (let it = 0; it < SWEEP_ITERATIONS && bestCrossings > 0; it += 1) {
        for (let k = 1; k < layerCount; k += 1) {
          sweep(k, 'down');
        }
        for (let k = layerCount - 2; k >= 0; k -= 1) {
          sweep(k, 'up');
        }
        current = flatten(units);
        const c = crossingsOf(current);
        if (c < bestCrossings) {
          bestCrossings = c;
          best = current.map((l) => [...l]);
        }
      }
    }
    const finalLayers = best;
    setPositions(finalLayers);
    totalCrossings += bestCrossings;

    // ---- 4. X positions ----
    const sameUnit = (a: number, b: number) => {
      const ma = elements[a]!.member;
      const mb = elements[b]!.member;
      return ma >= 0 && mb >= 0 && findUnit(ma) === findUnit(mb) && (spouseAdj[ma]!.includes(mb) || spouseAdj[mb]!.includes(ma));
    };
    const separation = (a: number, b: number) => {
      if (elements[a]!.member === -1 || elements[b]!.member === -1) {
        return dummyGap;
      }
      return sameUnit(a, b) ? spouseGap : memberGap;
    };
    for (const layer of finalLayers) {
      let x = 0;
      layer.forEach((el, i) => {
        if (i > 0) {
          x += separation(layer[i - 1]!, el);
        }
        xs[el] = x;
        x += elements[el]!.width;
      });
    }
    const centre = (el: number) => xs[el]! + elements[el]!.width / 2;
    const place = (layer: number[], direction: 'up' | 'down' | 'both') => {
      const offsets: number[] = [];
      let o = 0;
      layer.forEach((el, i) => {
        if (i > 0) {
          o += elements[layer[i - 1]!]!.width + separation(layer[i - 1]!, el);
        }
        offsets.push(o);
      });
      const targets: number[] = [];
      const weights: number[] = [];
      layer.forEach((el, i) => {
        const nbs = direction === 'down' ? elements[el]!.up : direction === 'up' ? elements[el]!.down : [...elements[el]!.up, ...elements[el]!.down];
        const dummy = elements[el]!.member === -1;
        if (nbs.length === 0) {
          targets.push(xs[el]! - offsets[i]!);
          weights.push(0.01);
          return;
        }
        const desired = nbs.reduce((s, nb) => s + centre(nb), 0) / nbs.length - elements[el]!.width / 2;
        targets.push(desired - offsets[i]!);
        weights.push(nbs.length * (dummy ? 3 : 1));
      });
      // A spouse group moves as one rigid block, so partners stay side by side even when their
      // own relatives pull in different directions.
      const blockTargets: number[] = [];
      const blockWeights: number[] = [];
      const blockOf: number[] = [];
      layer.forEach((el, i) => {
        const prev = layer[i - 1];
        const m = elements[el]!.member;
        const joins = prev !== undefined && m >= 0 && elements[prev]!.member >= 0 && findUnit(m) === findUnit(elements[prev]!.member);
        if (!joins) {
          blockTargets.push(0);
          blockWeights.push(0);
        }
        const b = blockTargets.length - 1;
        blockTargets[b]! += targets[i]! * weights[i]!;
        blockWeights[b]! += weights[i]!;
        blockOf.push(b);
      });
      const fitted = isotonic(
        blockTargets.map((t, b) => t / blockWeights[b]!),
        blockWeights,
      );
      layer.forEach((el, i) => (xs[el] = fitted[blockOf[i]!]! + offsets[i]!));
    };
    if (layerCount > 1) {
      for (let it = 0; it < POSITION_ITERATIONS; it += 1) {
        for (let k = 1; k < layerCount; k += 1) {
          place(finalLayers[k]!, 'down');
        }
        for (let k = layerCount - 2; k >= 0; k -= 1) {
          place(finalLayers[k]!, 'up');
        }
      }
      // Finally balance each box between its parents and its children, sweeping down and up.
      for (let it = 0; it < BALANCE_ITERATIONS; it += 1) {
        for (let k = 0; k < layerCount; k += 1) {
          place(finalLayers[k]!, 'both');
        }
        for (let k = layerCount - 1; k >= 0; k -= 1) {
          place(finalLayers[k]!, 'both');
        }
      }
    }
    let minX = Infinity;
    let maxX = -Infinity;
    for (const el of compElements) {
      minX = Math.min(minX, xs[el]!);
      maxX = Math.max(maxX, xs[el]! + elements[el]!.width);
    }
    compElements.forEach((el) => (xs[el]! -= minX));
    const width = maxX - minX;
    widestRow = Math.max(widestRow, ...finalLayers.map((l) => l.filter((el) => elements[el]!.member >= 0).length));

    // ---- 5. Lines and vertical spacing ----
    interface Group {
      layer: number;
      anchors: number[];
      children: number[];
      spouseMid?: number;
      start: number;
      end: number;
      track: number;
      relationshipIds: string[];
    }
    const groups: Group[] = [];
    for (let k = 1; k < layerCount; k += 1) {
      const byKey = new Map<string, Group>();
      for (const el of finalLayers[k]!) {
        if (elements[el]!.member === -1 || elements[el]!.up.length === 0) {
          continue;
        }
        const anchors = [...elements[el]!.up].sort((a, b) => pos[a]! - pos[b]!);
        const key = anchors.join(',');
        let g = byKey.get(key);
        if (!g) {
          g = { layer: k, anchors, children: [], start: 0, end: 0, track: 0, relationshipIds: [] };
          byKey.set(key, g);
          groups.push(g);
        }
        g.children.push(el);
        for (const a of anchors) {
          const id = elements[a]!.member >= 0 ? parentRel.get(`${elements[a]!.member}:${elements[el]!.member}`) : elements[a]!.relationship;
          if (id) {
            g.relationshipIds.push(id);
          }
        }
      }
    }
    for (const g of groups) {
      const [a, b] = g.anchors;
      if (g.anchors.length === 2 && Math.abs(pos[a!]! - pos[b!]!) === 1 && sameUnit(a!, b!)) {
        g.spouseMid = (xs[a!]! + W + xs[b!]!) / 2;
      }
      const points = [...(g.spouseMid !== undefined ? [g.spouseMid] : g.anchors.map(centre)), ...g.children.map(centre)];
      g.start = Math.min(...points);
      g.end = Math.max(...points);
    }
    const busTracks: number[] = new Array<number>(layerCount).fill(0);
    for (let k = 1; k < layerCount; k += 1) {
      const inLayer = groups.filter((g) => g.layer === k && g.end - g.start > 0.5);
      const { tracks, count: n } = assignTracks(inLayer, trackSpacing);
      inLayer.forEach((g, i) => (g.track = tracks[i]!));
      busTracks[k] = n;
    }
    interface Arc {
      layer: number;
      a: number;
      b: number;
      start: number;
      end: number;
      track: number;
      id: string;
    }
    const arcs: Arc[] = [];
    const adjacentSpouses: Array<{ l: number; r: number; id: string }> = [];
    const unalignedEdges: Array<{ a: number; b: number; id: string }> = [];
    for (const i of spouseByComponent.get(find(compMembers[0]!)) ?? []) {
      const e = spouseEdges[i]!;
      if (!aligned[i]) {
        unalignedEdges.push(e);
        continue;
      }
      const [l, r] = pos[e.a]! < pos[e.b]! ? [e.a, e.b] : [e.b, e.a];
      if (pos[r]! - pos[l]! === 1) {
        adjacentSpouses.push({ l, r, id: e.id });
      } else {
        arcs.push({ layer: gen[l]!, a: l, b: r, start: xs[l]! + W * 0.8, end: xs[r]! + W * 0.2, track: 0, id: e.id });
      }
    }
    nonAdjacentSpouses += arcs.length;
    const arcTracks: number[] = new Array<number>(layerCount).fill(0);
    for (let k = 0; k < layerCount; k += 1) {
      const inLayer = arcs.filter((a) => a.layer === k);
      const { tracks, count: n } = assignTracks(inLayer, trackSpacing);
      inLayer.forEach((a, i) => (a.track = tracks[i]!));
      arcTracks[k] = n;
    }
    // Row tops: each gap holds [pad][bus tracks][pad][arc tracks][pad].
    const tops: number[] = [];
    let y = arcTracks[0]! > 0 ? bandPad + arcTracks[0]! * trackSpacing : 0;
    for (let k = 0; k < layerCount; k += 1) {
      if (k > 0) {
        const gap = bandPad + busTracks[k]! * trackSpacing + bandPad + arcTracks[k]! * trackSpacing + bandPad * 0.6;
        y += Math.max(H * 0.75, gap);
      }
      tops.push(y);
      y += H;
    }
    const height = y;
    const busY = (g: Group) => tops[g.layer - 1]! + H + bandPad + g.track * trackSpacing + trackSpacing / 2;
    const arcY = (a: Arc) => tops[a.layer]! - bandPad * 0.6 - a.track * trackSpacing - trackSpacing / 2;
    for (const m of compMembers) {
      nodeY[m] = tops[gen[m]!]!;
    }

    const edges: LayoutEdge[] = [];
    for (const g of groups) {
      const by = busY(g);
      const paths: Point[][] = [];
      const top = tops[g.layer]!;
      const aboveBottom = tops[g.layer - 1]! + H;
      if (g.spouseMid !== undefined) {
        paths.push([[g.spouseMid, tops[g.layer - 1]! + H / 2], [g.spouseMid, by]]);
      } else {
        for (const a of g.anchors) {
          paths.push([[centre(a), aboveBottom], [centre(a), by]]);
        }
      }
      if (g.end - g.start > 0.5) {
        paths.push([[g.start, by], [g.end, by]]);
      }
      for (const c of g.children) {
        paths.push([[centre(c), by], [centre(c), top]]);
      }
      edges.push({ kind: 'parent', relationshipIds: g.relationshipIds, paths, double: false });
    }
    // Chains of dummy points for edges that skip generations.
    for (const [id, chain] of chainsByComponent.get(find(compMembers[0]!)) ?? []) {
      const parent = elements[chain[0]!]!.up[0]!;
      const points: Point[] = [[centre(parent), tops[elements[parent]!.layer]! + H]];
      for (const el of chain) {
        points.push([xs[el]!, tops[elements[el]!.layer]!], [xs[el]!, tops[elements[el]!.layer]! + H]);
      }
      edges.push({ kind: 'parent', relationshipIds: [id], paths: [points], double: false });
    }
    for (const { l, r, id } of adjacentSpouses) {
      const midY = tops[gen[l]!]! + H / 2;
      edges.push({ kind: 'spouse', relationshipIds: [id], paths: [[[xs[l]! + W, midY], [xs[r]!, midY]]], double: true });
    }
    for (const a of arcs) {
      const ay = arcY(a);
      const top = tops[a.layer]!;
      edges.push({ kind: 'spouse', relationshipIds: [a.id], paths: [[[a.start, top], [a.start, ay], [a.end, ay], [a.end, top]]], double: false });
    }
    for (const e of unalignedEdges) {
      const [u, l] = gen[e.a]! < gen[e.b]! ? [e.a, e.b] : [e.b, e.a];
      edges.push({
        kind: 'spouse_unaligned',
        relationshipIds: [e.id],
        paths: [[[centre(u), tops[gen[u]!]! + H], [centre(l), tops[gen[l]!]!]]],
        double: false,
      });
    }
    placed.push({ members: compMembers, width, height, edges, layers: finalLayers });
  }

  // ---- 6. Pack family groups onto shelves ------------------------------------------------------
  const order = placed.map((_, i) => i).sort((a, b) => placed[b]!.height - placed[a]!.height || placed[b]!.width - placed[a]!.width || byName(placed[a]!.members[0]!, placed[b]!.members[0]!));
  const gapX = W * 0.8;
  const gapY = H * 1.2;
  const area = placed.reduce((s, c) => s + (c.width + gapX) * (c.height + gapY), 0);
  const targetWidth = Math.max(placed.length ? Math.max(...placed.map((c) => c.width)) : 0, Math.sqrt(area * 1.6));
  let shelfX = 0;
  let shelfY = 0;
  let shelfH = 0;
  let totalW = 0;
  const offsets = new Map<number, [number, number]>();
  for (const i of order) {
    const c = placed[i]!;
    if (shelfX > 0 && shelfX + c.width > targetWidth) {
      shelfY += shelfH + gapY;
      shelfX = 0;
      shelfH = 0;
    }
    offsets.set(i, [shelfX, shelfY]);
    shelfX += c.width + gapX;
    shelfH = Math.max(shelfH, c.height);
    totalW = Math.max(totalW, shelfX - gapX);
  }
  const totalH = placed.length ? shelfY + shelfH : 0;

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  let number = 0;
  order.forEach((ci, packIndex) => {
    const c = placed[ci]!;
    const [ox, oy] = offsets.get(ci)!;
    for (const layer of c.layers) {
      for (const el of layer) {
        const m = elements[el]!.member;
        if (m < 0) {
          continue;
        }
        number += 1;
        nodes.push({
          id: members[m]!.id,
          number,
          x: xs[el]! + ox,
          y: nodeY[m]! + oy,
          w: W,
          h: H,
          lines: labels[m]!.lines,
          truncated: labels[m]!.truncated,
          generation: gen[m]! + 1,
          component: packIndex + 1,
        });
      }
    }
    for (const e of c.edges) {
      edges.push({ ...e, paths: e.paths.map((p) => p.map(([px, py]) => [px + ox, py + oy] as const)) });
    }
  });

  return {
    width: totalW,
    height: totalH,
    nodes,
    edges,
    metrics,
    stats: {
      members: count,
      relationships: relationships.length,
      components: placed.length,
      generations: maxGenerations,
      widestRow,
      dummyPoints,
      crossings: totalCrossings,
      unalignedSpouses: aligned.filter((a) => !a).length,
      nonAdjacentSpouses,
      truncatedLabels,
      unsupportedCharacters,
      membersWithoutRelationships: placed.filter((c) => c.members.length === 1).length,
    },
  };
}

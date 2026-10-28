import { MAX_PAGE_POINTS, MM, PAGE_SIZES, sheetSize, type ExportOptions, type ExportScope } from './export-options.ts';
import { PdfCanvas, PdfDocument, type Rgb } from './pdf-writer.ts';
import { textEngine } from './text-engine.ts';
import { hasIndic, layoutTree, wrapLabel, type LayoutEdge, type LayoutNode, type TreeLayout, type TreeMember, type TreeRelationship } from './tree-layout.ts';

// Family tree PDF renderer (TASK-11). Three modes, all vector (no screenshots):
//   single — the whole tree fitted to one sheet; warns when names become hard to read;
//   poster — one large page sized from the layout at the chosen print scale;
//   tiled  — sheets at a constant scale with overlap, registration marks, alignment guides,
//            sheet numbers and neighbour hints, after an assembly overview page.
// Lines are drawn from the same geometry on every sheet and clipped, so a line crossing a sheet
// edge continues exactly on the neighbouring sheet. Optional index pages list every member.

export interface RenderInput {
  workspaceName: string;
  members: readonly TreeMember[];
  relationships: readonly TreeRelationship[];
  options: ExportOptions;
  generatedAt: Date;
  /** Hard limit; exceeding it fails the export with `too_many_pages`. */
  maxPages: number;
  /** Tests only: record which members and relationships each page draws. */
  collectManifest?: boolean;
  /** Plan only: pages, scale and warnings without drawing (the preview; `pdf` is empty). */
  preview?: boolean;
}

export interface PageManifest {
  kind: 'tree' | 'overview' | 'sheet' | 'index';
  width: number;
  height: number;
  sheet?: { number: number; row: number; column: number; x: number; y: number; w: number; h: number };
  nodes?: string[];
  relationships?: string[];
  indexed?: string[];
}

export interface RenderResult {
  pdf: Buffer;
  pageCount: number;
  memberCount: number;
  warnings: string[];
  details: {
    mode: ExportOptions['mode'];
    pageWidthMm: number;
    pageHeightMm: number;
    sheets?: { rows: number; columns: number };
    effectiveLabelPt: number;
    scale: number;
    /** Where the tree starts on the drawing, below the title block (drawing units). */
    treeTop: number;
    layoutMs: number;
    renderMs: number;
    stats: TreeLayout['stats'];
  };
  manifest?: PageManifest[];
}

export class ExportLimitError extends Error {
  readonly code: 'too_many_pages';

  constructor(code: 'too_many_pages', message: string) {
    super(message);
    this.name = 'ExportLimitError';
    this.code = code;
  }
}

/** Width of shaped text in points (bold is drawn with an outline stroke, about 4% wider). */
const textWidth = (text: string, size: number, bold = false) => textEngine().width(text, size) * (bold ? 1.04 : 1);

/** The shaped-text measure the layout uses, so boxes are sized for the glyphs actually drawn. */
const measure = { width: (text: string, size: number) => textEngine().width(text, size), missing: (text: string) => textEngine().missing(text) };

const INK: Rgb = [0.13, 0.12, 0.11];
const MUTED: Rgb = [0.42, 0.4, 0.38];
const BOX_STROKE: Rgb = [0.36, 0.31, 0.26];
const BOX_FILL: Rgb = [1, 1, 1];
const PARENT_LINE: Rgb = [0.25, 0.25, 0.25];
const SPOUSE_LINE: Rgb = [0.55, 0.16, 0.14];
const GUIDE: Rgb = [0.1, 0.35, 0.75];
const SHEET_GRID: Rgb = [0.1, 0.35, 0.75];

/** Readability thresholds for printed names (points). */
export const LABEL_SMALL_PT = 6;
export const LABEL_UNREADABLE_PT = 3.5;

// Natural order for the index: "Person 2" before "Person 10", case and accents ignored.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const MARGIN = 12 * MM;
const TILE_MARGIN = 10 * MM;
const FOOTER = 9 * MM;
const OVERLAP = 10 * MM;

/** Limits the graph to the chosen subtree. Descendants include their spouses. */
export function selectScope(
  members: readonly TreeMember[],
  relationships: readonly TreeRelationship[],
  scope: ExportScope,
): { members: TreeMember[]; relationships: TreeRelationship[]; focus?: TreeMember } | undefined {
  if (scope.kind === 'all') {
    return { members: [...members], relationships: [...relationships] };
  }
  const focus = members.find((m) => m.id === scope.memberId);
  if (!focus) {
    return undefined;
  }
  const next = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, k: string, v: string) => {
    const list = map.get(k);
    if (list) {
      list.push(v);
    } else {
      map.set(k, [v]);
    }
  };
  for (const r of relationships) {
    if (r.type === 'parent_of') {
      if (scope.kind === 'descendants') {
        add(next, r.from, r.to);
      } else {
        add(next, r.to, r.from);
      }
    } else {
      add(spouses, r.from, r.to);
      add(spouses, r.to, r.from);
    }
  }
  const keep = new Set([focus.id]);
  const queue = [focus.id];
  for (let i = 0; i < queue.length; i += 1) {
    for (const id of next.get(queue[i]!) ?? []) {
      if (!keep.has(id)) {
        keep.add(id);
        queue.push(id);
      }
    }
  }
  if (scope.kind === 'descendants') {
    for (const id of [...keep]) {
      for (const s of spouses.get(id) ?? []) {
        keep.add(s);
      }
    }
  }
  return {
    members: members.filter((m) => keep.has(m.id)),
    relationships: relationships.filter((r) => keep.has(r.from) && keep.has(r.to)),
    focus,
  };
}

interface Header {
  height: number;
  width: number;
  draw: (canvas: PdfCanvas, x: number, y: number) => void;
}

function header(input: RenderInput, layout: TreeLayout, scopeLabel: string): Header {
  const s = input.options.labelSize;
  const title = `Family tree: ${input.workspaceName}`;
  const date = input.generatedAt.toISOString().slice(0, 10);
  const sub = `${scopeLabel} · ${layout.stats.members} members · ${layout.stats.relationships} relationships · created ${date}`;
  const titleSize = s * 1.8;
  const subSize = s * 0.95;
  const legendSize = s * 0.85;
  const legend = [
    { label: 'Parent and child', kind: 'parent' as const },
    { label: 'Spouses', kind: 'spouse' as const },
    { label: 'Spouses (drawn across generations)', kind: 'unaligned' as const },
  ];
  const sample = s * 3;
  const legendWidth = legend.reduce((w, l) => w + sample + s * 0.5 + textWidth(l.label, legendSize) + s * 1.5, 0);
  const width = Math.max(textWidth(title, titleSize, true), textWidth(sub, subSize), legendWidth);
  const height = titleSize * 1.25 + subSize * 1.6 + legendSize * 2.2;
  return {
    height,
    width,
    draw(canvas, x, y) {
      canvas.text(title, x, y + titleSize, titleSize, { bold: true, color: INK });
      canvas.text(sub, x, y + titleSize * 1.25 + subSize * 1.1, subSize, { color: MUTED });
      let lx = x;
      const ly = y + titleSize * 1.25 + subSize * 1.6 + legendSize;
      for (const item of legend) {
        const midY = ly - legendSize * 0.35;
        if (item.kind === 'parent') {
          canvas.stroke(PARENT_LINE, s * 0.075);
          canvas.line([[lx, midY], [lx + sample, midY]]);
        } else if (item.kind === 'spouse') {
          canvas.stroke(SPOUSE_LINE, s * 0.075);
          canvas.line([[lx, midY - s * 0.12], [lx + sample, midY - s * 0.12]]);
          canvas.line([[lx, midY + s * 0.12], [lx + sample, midY + s * 0.12]]);
        } else {
          canvas.stroke(SPOUSE_LINE, s * 0.075, [s * 0.4, s * 0.3]);
          canvas.line([[lx, midY], [lx + sample, midY]]);
        }
        canvas.text(item.label, lx + sample + s * 0.5, ly, legendSize, { color: MUTED });
        lx += sample + s * 0.5 + textWidth(item.label, legendSize) + s * 1.5;
      }
    },
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function edgeBounds(edge: LayoutEdge, dy: number): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of edge.paths) {
    for (const [x, y] of path) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y + dy);
      maxY = Math.max(maxY, y + dy);
    }
  }
  const pad = 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

/**
 * Draws the tree (shifted down by `dy` for the header). `view` limits drawing to what can be seen,
 * so a sheet's content stream holds only its own part of a large tree.
 */
function drawTree(
  canvas: PdfCanvas,
  layout: TreeLayout,
  dy: number,
  opts: { view?: Rect; text: boolean; showNumbers: boolean; showGeneration: boolean; record?: { nodes: string[]; relationships: string[] } },
) {
  const m = layout.metrics;
  for (const edge of layout.edges) {
    if (opts.view && !intersects(edgeBounds(edge, dy), opts.view)) {
      continue;
    }
    opts.record?.relationships.push(...edge.relationshipIds);
    const shifted = edge.paths.map((p) => p.map(([x, y]) => [x, y + dy] as const));
    if (edge.kind === 'parent') {
      canvas.stroke(PARENT_LINE, m.lineWidth);
      shifted.forEach((p) => canvas.line(p));
    } else if (edge.double) {
      canvas.stroke(SPOUSE_LINE, m.lineWidth);
      const off = m.lineWidth * 1.6;
      for (const p of shifted) {
        canvas.line(p.map(([x, y]) => [x, y - off] as const));
        canvas.line(p.map(([x, y]) => [x, y + off] as const));
      }
    } else {
      canvas.stroke(SPOUSE_LINE, m.lineWidth, edge.kind === 'spouse_unaligned' ? [m.labelSize * 0.4, m.labelSize * 0.3] : undefined);
      shifted.forEach((p) => canvas.line(p));
    }
  }
  canvas.stroke(BOX_STROKE, m.lineWidth);
  const visible: LayoutNode[] = [];
  for (const node of layout.nodes) {
    if (opts.view && !intersects({ x: node.x, y: node.y + dy, w: node.w, h: node.h }, opts.view)) {
      continue;
    }
    visible.push(node);
    opts.record?.nodes.push(node.id);
  }
  canvas.fill(BOX_FILL);
  for (const node of visible) {
    canvas.rect(node.x, node.y + dy, node.w, node.h, 'B');
  }
  if (!opts.text) {
    return;
  }
  const numberRow = opts.showNumbers || opts.showGeneration;
  for (const node of visible) {
    const top = node.y + dy;
    let lineTop = top + m.padding;
    if (numberRow) {
      const parts = [opts.showNumbers ? `${node.number}` : '', opts.showGeneration ? `Gen ${node.generation}` : ''].filter(Boolean);
      canvas.text(parts.join(' · '), node.x + m.padding, lineTop + m.numberSize * 0.9, m.numberSize, { color: MUTED });
      lineTop += m.numberSize * 1.25;
    }
    // Centre the name block vertically in the remaining space.
    const space = node.y + dy + node.h - m.padding - lineTop;
    const block = node.lines.length * m.lineHeight;
    lineTop += Math.max(0, (space - block) / 2);
    node.lines.forEach((line, i) => {
      const w = textWidth(line, m.labelSize);
      canvas.text(line, node.x + (node.w - w) / 2, lineTop + i * m.lineHeight + m.lineHeight / 2 + m.labelSize * 0.35, m.labelSize, { color: INK });
    });
  }
}

function footer(canvas: PdfCanvas, left: string, page: number, total: number, margin: number) {
  const size = 7.5;
  const y = canvas.pageHeight - margin * 0.45;
  canvas.textPage(left, margin, y, size, { color: MUTED });
  const right = `Page ${page} of ${total}`;
  canvas.textPage(right, canvas.pageWidth - margin - textWidth(right, size), y, size, { color: MUTED });
}

function orient([w, h]: [number, number], orientation: 'portrait' | 'landscape'): [number, number] {
  return orientation === 'portrait' ? [Math.min(w, h), Math.max(w, h)] : [Math.max(w, h), Math.min(w, h)];
}

interface IndexEntry {
  node: LayoutNode;
  name: string;
  where: string;
}

interface IndexPlan {
  pages: Array<Array<{ entry: IndexEntry; lines: string[]; column: number; y: number; lineH: number }>>;
  width: number;
  height: number;
}

/** Lays the alphabetical member index out on pages of the given size. */
function planIndex(entries: IndexEntry[], [pw, ph]: [number, number]): IndexPlan {
  const size = 8;
  const lineH = 10.2;
  const columns = pw > 700 ? 3 : 2;
  const gutter = 8 * MM;
  const colW = (pw - MARGIN * 2 - gutter * (columns - 1)) / columns;
  const top = MARGIN + 26;
  const bottom = ph - MARGIN - FOOTER;
  const pages: IndexPlan['pages'] = [];
  let page: IndexPlan['pages'][number] = [];
  let column = 0;
  let y = top;
  for (const entry of entries) {
    const ref = entry.where;
    const refW = textWidth(ref, size) + 6;
    const lines = wrapLabel(entry.name, size, Math.max(40, colW - refW), measure, 8).lines;
    const itemLineH = hasIndic(entry.name) ? lineH * 1.25 : lineH;
    const h = lines.length * itemLineH + 2.5;
    if (y + h > bottom) {
      column += 1;
      y = top;
      if (column >= columns) {
        pages.push(page);
        page = [];
        column = 0;
      }
    }
    page.push({ entry, lines, column, y, lineH: itemLineH });
    y += h;
  }
  if (page.length > 0) {
    pages.push(page);
  }
  return { pages, width: pw, height: ph };
}

function drawIndexPage(canvas: PdfCanvas, plan: IndexPlan, pageIndex: number, pageNo: number, total: number, title: string) {
  const size = 8;
  const columns = plan.width > 700 ? 3 : 2;
  const gutter = 8 * MM;
  const colW = (plan.width - MARGIN * 2 - gutter * (columns - 1)) / columns;
  canvas.textPage(pageIndex === 0 ? 'Member index' : 'Member index (continued)', MARGIN, MARGIN + 12, 12, { bold: true, color: INK });
  for (const item of plan.pages[pageIndex]!) {
    const x = MARGIN + item.column * (colW + gutter);
    item.lines.forEach((line, i) => canvas.textPage(line, x, item.y + i * item.lineH + size, size, { color: INK }));
    const ref = item.entry.where;
    canvas.textPage(ref, x + colW - textWidth(ref, size), item.y + size, size, { color: MUTED });
  }
  footer(canvas, title, pageNo, total, MARGIN);
}

/** A crosshair in a square, drawn at the same point of the drawing on two neighbouring sheets. */
function registrationMark(canvas: PdfCanvas, x: number, y: number) {
  const r = 1.8 * MM;
  canvas.strokePage(INK, 0.35);
  canvas.linePage(x - r * 1.6, y, x + r * 1.6, y);
  canvas.linePage(x, y - r * 1.6, x, y + r * 1.6);
  canvas.rectPage(x - r, y - r, r * 2, r * 2, 'S');
}

/** One sheet grid for printable sheets. Lengths are in points on the page. */
export interface SheetGrid {
  rows: number;
  columns: number;
  contentW: number;
  contentH: number;
  /** Overlap between neighbouring sheets: at least one box plus a gap, so every name is whole on some sheet. */
  overlapX: number;
  overlapY: number;
  stepX: number;
  stepY: number;
  /** Shift that centres the drawing in the grid (the same on every sheet, so alignment holds). */
  offsetX: number;
  offsetY: number;
}

export interface PagePlan {
  pageW: number;
  pageH: number;
  scale: number;
  sheets?: SheetGrid;
  warnings: string[];
}

/** Scale limits of printable sheets (the scalePercent option range). */
const MIN_TILE_SCALE = 0.25;
const MAX_TILE_SCALE = 4;

function sheetGrid([w, h]: [number, number], canvasW: number, canvasH: number, box: { w: number; h: number }, scale: number): SheetGrid {
  const contentW = w - TILE_MARGIN * 2;
  const contentH = h - TILE_MARGIN * 2 - FOOTER;
  const overlapX = Math.min(contentW / 2, Math.max(OVERLAP, box.w * scale + 3 * MM));
  const overlapY = Math.min(contentH / 2, Math.max(OVERLAP, box.h * scale + 3 * MM));
  const across = (total: number, size: number, overlap: number) => (total <= size ? 1 : Math.ceil((total - overlap) / (size - overlap)));
  const columns = across(canvasW * scale, contentW, overlapX);
  const rows = across(canvasH * scale, contentH, overlapY);
  const stepX = contentW - overlapX;
  const stepY = contentH - overlapY;
  return {
    rows,
    columns,
    contentW,
    contentH,
    overlapX,
    overlapY,
    stepX,
    stepY,
    offsetX: Math.max(0, ((columns - 1) * stepX + contentW - canvasW * scale) / 2),
    offsetY: Math.max(0, ((rows - 1) * stepY + contentH - canvasH * scale) / 2),
  };
}

/**
 * Page geometry for a drawing of canvasW × canvasH points (at 100%) whose boxes are `box`.
 * Pure: the export preview and the renderer use the same numbers.
 */
export function planPages(canvasW: number, canvasH: number, box: { w: number; h: number }, options: ExportOptions): PagePlan {
  const warnings: string[] = [];
  if (options.mode === 'single') {
    const base = sheetSize(options);
    const fit = ([w, h]: [number, number]) => Math.min((w - MARGIN * 2) / canvasW, (h - MARGIN * 2 - FOOTER) / canvasH);
    const choice: 'portrait' | 'landscape' =
      options.orientation === 'auto' ? (fit(orient(base, 'landscape')) > fit(orient(base, 'portrait')) ? 'landscape' : 'portrait') : options.orientation;
    const [pageW, pageH] = orient(base, choice);
    // Small trees are enlarged at most 2x, so a three-person tree does not fill a poster.
    return { pageW, pageH, scale: Math.min(2, fit([pageW, pageH])), warnings };
  }
  if (options.mode === 'poster') {
    let scale = options.scalePercent / 100;
    const maxScale = Math.min((MAX_PAGE_POINTS - MARGIN * 2) / canvasW, (MAX_PAGE_POINTS - MARGIN * 2 - FOOTER) / canvasH);
    if (scale > maxScale) {
      scale = maxScale;
      warnings.push('poster_reduced');
    }
    return { pageW: Math.max(PAGE_SIZES.A4[0], canvasW * scale + MARGIN * 2), pageH: Math.max(PAGE_SIZES.A4[0], canvasH * scale + MARGIN * 2 + FOOTER), scale, warnings };
  }
  const base = sheetSize(options);
  const orientations: Array<'portrait' | 'landscape'> = options.orientation === 'auto' ? ['portrait', 'landscape'] : [options.orientation];
  const count = (o: 'portrait' | 'landscape', scale: number) => {
    const g = sheetGrid(orient(base, o), canvasW, canvasH, box, scale);
    return g.rows * g.columns;
  };
  const best = (scale: number) => orientations.reduce((a, b) => (count(b, scale) < count(a, scale) ? b : a));
  let scale = options.scalePercent / 100;
  if (options.targetSheets !== undefined) {
    // The largest scale (most readable names) whose sheet count fits the target.
    const fits = (s: number) => count(best(s), s) <= options.targetSheets!;
    if (!fits(MIN_TILE_SCALE)) {
      scale = MIN_TILE_SCALE;
      warnings.push('target_sheets_unreachable');
    } else if (fits(MAX_TILE_SCALE)) {
      scale = MAX_TILE_SCALE;
    } else {
      let lo = MIN_TILE_SCALE;
      let hi = MAX_TILE_SCALE;
      for (let i = 0; i < 30; i += 1) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      scale = Math.floor(lo * 1000) / 1000;
    }
  }
  const [pageW, pageH] = orient(base, best(scale));
  return { pageW, pageH, scale, sheets: sheetGrid([pageW, pageH], canvasW, canvasH, box, scale), warnings };
}

export function renderTreePdf(input: RenderInput, onProgress: (percent: number) => void = () => undefined): RenderResult {
  const { options } = input;
  const started = performance.now();
  const scoped = selectScope(input.members, input.relationships, options.scope);
  if (!scoped) {
    throw new Error('scope member not found');
  }
  const scopeLabel =
    options.scope.kind === 'all' ? 'Complete tree' : options.scope.kind === 'descendants' ? `Descendants of ${scoped.focus!.name}` : `Ancestors of ${scoped.focus!.name}`;
  const showDetails = options.showNumbers || options.showGeneration;
  const layout = layoutTree(scoped.members, scoped.relationships, { labelSize: options.labelSize, showNumbers: showDetails, measure });
  const layoutMs = performance.now() - started;
  onProgress(35);

  const head = header(input, layout, scopeLabel);
  const headGap = options.labelSize * 2;
  const empty = layout.nodes.length === 0;
  const emptyNote = 'There are no members in this family tree yet.';
  const canvasW = Math.max(layout.width, head.width, empty ? textWidth(emptyNote, options.labelSize) : 0);
  const canvasH = head.height + headGap + (empty ? options.labelSize * 2 : layout.height);
  const dy = head.height + headGap;
  const warnings: string[] = [];
  const doc = new PdfDocument(
    {
      title: `Family tree: ${input.workspaceName}`,
      subject: `${scopeLabel}, ${layout.stats.members} members`,
      creationDate: input.generatedAt,
    },
    textEngine(),
  );
  const manifest: PageManifest[] | undefined = input.collectManifest ? [] : undefined;
  const titleLine = `Family tree: ${input.workspaceName}`;
  const drawContent = (canvas: PdfCanvas, view: Rect | undefined, text: boolean, record?: { nodes: string[]; relationships: string[] }) => {
    if (!view || intersects({ x: 0, y: 0, w: canvasW, h: head.height }, view)) {
      head.draw(canvas, 0, 0);
    }
    if (empty) {
      canvas.text(emptyNote, 0, dy + options.labelSize, options.labelSize, { color: MUTED });
      return;
    }
    drawTree(canvas, layout, dy, { view, text, showNumbers: options.showNumbers, showGeneration: options.showGeneration, record });
  };

  // ---- Page geometry per mode ----
  const plan = planPages(canvasW, canvasH, { w: layout.metrics.boxWidth, h: layout.metrics.boxHeight }, options);
  const { pageW, pageH, scale, sheets } = plan;
  warnings.push(...plan.warnings);
  const effectiveLabelPt = options.labelSize * scale;
  if (!empty) {
    if (effectiveLabelPt < LABEL_UNREADABLE_PT) {
      warnings.push('labels_unreadable');
    } else if (effectiveLabelPt < LABEL_SMALL_PT) {
      warnings.push('labels_small');
    }
  }
  if (layout.stats.truncatedLabels > 0) {
    warnings.push('labels_truncated');
  }
  // Characters no bundled font covers are drawn as a visible box, never replaced silently.
  if (layout.stats.unsupportedCharacters > 0 || measure.missing(input.workspaceName) > 0) {
    warnings.push('unsupported_characters');
  }
  if (layout.stats.unalignedSpouses > 0) {
    warnings.push('spouses_across_generations');
  }

  // ---- Index (planned first so every page knows the total) ----
  const sheetOf = (node: LayoutNode) => {
    if (!sheets) {
      return undefined;
    }
    // The overlap is wider than a box, so the sheet where a box's left/top edge falls holds it whole.
    const col = Math.min(sheets.columns - 1, Math.floor((node.x * scale + sheets.offsetX) / sheets.stepX));
    const row = Math.min(sheets.rows - 1, Math.floor(((node.y + dy) * scale + sheets.offsetY) / sheets.stepY));
    return row * sheets.columns + col + 1;
  };
  const names = new Map(scoped.members.map((mm) => [mm.id, mm.name]));
  const entries: IndexEntry[] = layout.nodes
    .map((node) => {
      const sheet = sheetOf(node);
      const parts = [
        options.showNumbers ? `No. ${node.number}` : '',
        sheet ? `sheet ${sheet} (page ${sheet + 1})` : `group ${node.component}, gen ${node.generation}`,
      ].filter(Boolean);
      return { node, name: names.get(node.id)!, where: parts.join(' · ') };
    })
    .sort((a, b) => collator.compare(a.name, b.name) || a.node.number - b.node.number);
  const indexSize: [number, number] = options.mode === 'poster' ? [PAGE_SIZES.A4[0], PAGE_SIZES.A4[1]] : [pageW, pageH];
  const index = options.includeIndex && entries.length > 0 ? planIndex(entries, indexSize) : undefined;
  const treePages = sheets ? 1 + sheets.rows * sheets.columns : 1;
  const total = treePages + (index?.pages.length ?? 0);
  if (input.preview) {
    return {
      pdf: Buffer.alloc(0),
      pageCount: total,
      memberCount: layout.stats.members,
      warnings: total > input.maxPages ? [...warnings, 'too_many_pages'] : warnings,
      details: details(),
    };
  }
  if (total > input.maxPages) {
    throw new ExportLimitError('too_many_pages', `This export needs ${total} pages; the limit is ${input.maxPages}. Use a smaller scale or a larger sheet.`);
  }
  const step = (done: number) => onProgress(35 + Math.round((done / total) * 60));

  // ---- Draw ----
  let pageNo = 0;
  if (!sheets) {
    pageNo += 1;
    const canvas = new PdfCanvas(pageW, pageH);
    const usedW = canvasW * scale;
    const usedH = canvasH * scale;
    const offsetX = (pageW - usedW) / 2;
    const offsetY = options.mode === 'single' ? MARGIN + Math.max(0, (pageH - MARGIN * 2 - FOOTER - usedH) / 2) : MARGIN;
    canvas.setTransform(scale, 0, 0, offsetX, offsetY);
    const record: { nodes: string[]; relationships: string[] } | undefined = manifest ? { nodes: [], relationships: [] } : undefined;
    drawContent(canvas, undefined, true, record);
    footer(canvas, `${titleLine} · ${options.mode === 'poster' ? 'poster' : 'single page'}`, pageNo, total, MARGIN);
    doc.addPage(canvas);
    manifest?.push({ kind: 'tree', width: pageW, height: pageH, ...record });
    step(pageNo);
  } else {
    const { rows, columns, contentW, contentH, overlapX, overlapY, stepX, stepY, offsetX, offsetY } = sheets;
    const mmText = (v: number) => `${Math.round(v / MM)} mm`;
    // Assembly overview: the whole tree in miniature with the sheet grid over it.
    pageNo += 1;
    const ov = new PdfCanvas(pageW, pageH);
    const paragraphs = [
      `Assembly: ${rows * columns} sheets in ${rows} row${rows === 1 ? '' : 's'} of ${columns}. Print every page at 100% (actual size, not "fit to page").`,
      `Neighbouring sheets overlap by ${mmText(overlapX)}${rows > 1 && Math.round(overlapY / MM) !== Math.round(overlapX / MM) ? ` (${mmText(overlapY)} between rows)` : ''}, so every name is whole on at least one sheet. Cut each sheet along the dashed blue guide near its left and top edges, then lay it on the sheet to its left or above so the cut edge sits on that sheet's guide and the crosshairs match.`,
      `Names are printed at ${Math.round(effectiveLabelPt * 10) / 10} pt. Sheet numbers run left to right, top to bottom; the index lists the sheet that shows each person whole.`,
    ];
    const instructions = paragraphs.flatMap((p) => wrapLabel(p, 8.5, pageW - MARGIN * 2, measure, 20).lines);
    ov.textPage(titleLine, MARGIN, MARGIN + 14, 14, { bold: true, color: INK });
    instructions.forEach((line, i) => ov.textPage(line, MARGIN, MARGIN + 32 + i * 11, 8.5, { color: INK }));
    const areaTop = MARGIN + 32 + instructions.length * 11 + 10;
    const areaW = pageW - MARGIN * 2;
    const areaH = pageH - areaTop - MARGIN - FOOTER;
    const totalW = (columns - 1) * stepX + contentW;
    const totalH = (rows - 1) * stepY + contentH;
    const mini = Math.min(areaW / totalW, areaH / totalH);
    const ox = MARGIN + (areaW - totalW * mini) / 2;
    ov.setTransform(mini * scale, 0, 0, ox + offsetX * mini, areaTop + offsetY * mini);
    drawContent(ov, undefined, effectiveLabelPt * mini >= 2.5);
    ov.strokePage(SHEET_GRID, 0.6);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const x = ox + c * stepX * mini;
        const y = areaTop + r * stepY * mini;
        ov.rectPage(x, y, contentW * mini, contentH * mini, 'S');
        // The sheet number sits in the cell's top-left corner on a white tab, clear of the tree.
        const label = String(r * columns + c + 1);
        const size = Math.max(5, Math.min(14, contentH * mini * 0.22));
        const tabW = textWidth(label, size, true) + size * 0.6;
        ov.fill([1, 1, 1]);
        ov.rectPage(x + 0.6, y + 0.6, tabW, size * 1.3, 'B');
        ov.textPage(label, x + 0.6 + size * 0.3, y + 0.6 + size * 1.02, size, { bold: true, color: SHEET_GRID });
      }
    }
    footer(ov, `${titleLine} · assembly overview`, pageNo, total, MARGIN);
    doc.addPage(ov);
    manifest?.push({ kind: 'overview', width: pageW, height: pageH });
    step(pageNo);

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        pageNo += 1;
        const sheetNo = r * columns + c + 1;
        const canvas = new PdfCanvas(pageW, pageH);
        const x0 = (c * stepX - offsetX) / scale;
        const y0 = (r * stepY - offsetY) / scale;
        const view = { x: x0, y: y0, w: contentW / scale, h: contentH / scale };
        canvas.save();
        canvas.clipPage(TILE_MARGIN, TILE_MARGIN, contentW, contentH);
        canvas.setTransform(scale, x0, y0, TILE_MARGIN, TILE_MARGIN);
        const record: { nodes: string[]; relationships: string[] } | undefined = manifest ? { nodes: [], relationships: [] } : undefined;
        drawContent(canvas, view, true, record);
        canvas.restore();
        // Alignment guides run through the middle of each overlap. A guide and its neighbour's
        // guide are the same line of the drawing, so the crosshairs on them coincide when overlaid.
        const right = TILE_MARGIN + contentW;
        const bottom = TILE_MARGIN + contentH;
        const verticalGuides = [...(c > 0 ? [TILE_MARGIN + overlapX / 2] : []), ...(c < columns - 1 ? [right - overlapX / 2] : [])];
        const horizontalGuides = [...(r > 0 ? [TILE_MARGIN + overlapY / 2] : []), ...(r < rows - 1 ? [bottom - overlapY / 2] : [])];
        canvas.strokePage(GUIDE, 0.5, [3, 2]);
        verticalGuides.forEach((gx) => canvas.linePage(gx, TILE_MARGIN, gx, bottom));
        horizontalGuides.forEach((gy) => canvas.linePage(TILE_MARGIN, gy, right, gy));
        for (const gx of verticalGuides) {
          registrationMark(canvas, gx, TILE_MARGIN + contentH * 0.25);
          registrationMark(canvas, gx, TILE_MARGIN + contentH * 0.75);
        }
        for (const gy of horizontalGuides) {
          registrationMark(canvas, TILE_MARGIN + contentW * 0.25, gy);
          registrationMark(canvas, TILE_MARGIN + contentW * 0.75, gy);
        }
        // Corner marks show the edge of the printed area.
        canvas.strokePage(INK, 0.35);
        for (const [mx, my, dx, dy2] of [[TILE_MARGIN, TILE_MARGIN, -1, -1], [right, TILE_MARGIN, 1, -1], [TILE_MARGIN, bottom, -1, 1], [right, bottom, 1, 1]] as const) {
          canvas.linePage(mx + dx * 1.5 * MM, my, mx + dx * 5 * MM, my);
          canvas.linePage(mx, my + dy2 * 1.5 * MM, mx, my + dy2 * 5 * MM);
        }
        // Neighbour hints in the margins.
        const hint = (text: string, x: number, y: number, rotate = false) => canvas.textPage(text, x, y, 6.5, { color: GUIDE, rotate90: rotate });
        if (r > 0) {
          hint(`Above: sheet ${sheetNo - columns}`, TILE_MARGIN + 6 * MM, TILE_MARGIN - 2.5 * MM);
        }
        if (c > 0) {
          hint(`Left: sheet ${sheetNo - 1}`, TILE_MARGIN - 2.5 * MM, bottom - 6 * MM, true);
        }
        if (c < columns - 1) {
          hint(`Right: sheet ${sheetNo + 1}`, right + 5 * MM, bottom - 6 * MM, true);
        }
        if (r < rows - 1) {
          hint(`Below: sheet ${sheetNo + columns}`, TILE_MARGIN + 6 * MM, bottom + 4.5 * MM);
        }
        footer(canvas, `${titleLine} · sheet ${sheetNo} of ${rows * columns} (row ${r + 1}, column ${c + 1})`, pageNo, total, TILE_MARGIN);
        doc.addPage(canvas);
        manifest?.push({
          kind: 'sheet',
          width: pageW,
          height: pageH,
          sheet: { number: sheetNo, row: r + 1, column: c + 1, ...view },
          ...record,
        });
        step(pageNo);
      }
    }
  }
  if (index) {
    index.pages.forEach((_, i) => {
      pageNo += 1;
      const canvas = new PdfCanvas(index.width, index.height);
      drawIndexPage(canvas, index, i, pageNo, total, titleLine);
      doc.addPage(canvas);
      manifest?.push({ kind: 'index', width: index.width, height: index.height, indexed: index.pages[i]!.map((item) => item.entry.node.id) });
      step(pageNo);
    });
  }
  const pdf = doc.toBuffer();
  onProgress(98);
  return {
    pdf,
    pageCount: doc.pageCount,
    memberCount: layout.stats.members,
    warnings,
    details: details(),
    ...(manifest ? { manifest } : {}),
  };

  function details(): RenderResult['details'] {
    return {
      mode: options.mode,
      pageWidthMm: Math.round(pageW / MM),
      pageHeightMm: Math.round(pageH / MM),
      ...(sheets ? { sheets: { rows: sheets.rows, columns: sheets.columns } } : {}),
      effectiveLabelPt: Math.round(effectiveLabelPt * 100) / 100,
      scale: Math.round(scale * 10_000) / 10_000,
      treeTop: dy,
      layoutMs: Math.round(layoutMs),
      renderMs: Math.round(performance.now() - started - layoutMs),
      stats: layout.stats,
    };
  }
}

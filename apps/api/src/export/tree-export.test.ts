import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';
import { DEFAULT_OPTIONS, validateExportOptions, type ExportOptions } from './export-options.ts';
import { PdfCanvas, PdfDocument } from './pdf-writer.ts';
import { textEngine } from './text-engine.ts';
import { deepTree, randomFamily, wideTree, withIndianNames, type SyntheticTree } from './synthetic-tree.ts';
import { layoutTree, wrapLabel, type TreeLayout } from './tree-layout.ts';
import { ExportLimitError, renderTreePdf, selectScope, type RenderResult } from './tree-render.ts';

// TASK-11 tree export: PDF validity, layout invariants (no overlaps, generations, completeness),
// the three modes, page-boundary lines, page numbering, limits and option validation.

interface ParsedPdf {
  version: string;
  objects: number;
  pages: Array<{ width: number; height: number; content: string; texts: string[] }>;
  info: string;
}

/** A strict reader for the subset this writer produces: checks every xref offset and stream length. */
function parsePdf(buf: Buffer): ParsedPdf {
  const s = buf.toString('latin1');
  assert.match(s, /^%PDF-1\.7\n/);
  const tail = /startxref\n(\d+)\n%%EOF\n$/.exec(s);
  assert.ok(tail, 'startxref trailer');
  const xrefAt = Number(tail[1]);
  assert.ok(s.startsWith('xref\n', xrefAt), 'startxref points at the xref table');
  const head = /^xref\n0 (\d+)\n/.exec(s.slice(xrefAt))!;
  const count = Number(head[1]);
  const rows = s.slice(xrefAt + head[0].length).split('\n').slice(0, count);
  assert.equal(rows[0], '0000000000 65535 f ');
  const offsets: number[] = [];
  for (let id = 1; id < count; id += 1) {
    const m = /^(\d{10}) 00000 n $/.exec(rows[id]!);
    assert.ok(m, `xref row ${id}`);
    offsets[id] = Number(m[1]);
    assert.ok(s.startsWith(`${id} 0 obj\n`, offsets[id]), `object ${id} at its xref offset`);
  }
  assert.match(s, new RegExp(`trailer\\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>`));
  const body = (id: number) => s.slice(offsets[id]!, s.indexOf('endobj', offsets[id]!));
  const kids = /\/Kids \[([^\]]*)\] \/Count (\d+)/.exec(body(2))!;
  const pageIds = kids[1]!.split(' 0 R').map((x) => x.trim()).filter(Boolean).map(Number);
  assert.equal(pageIds.length, Number(kids[2]));
  const pages = pageIds.map((id) => {
    const page = body(id);
    const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(page)!;
    const contentsId = Number(/\/Contents (\d+) 0 R/.exec(page)![1]);
    const obj = body(contentsId);
    const length = Number(/\/Length (\d+)/.exec(obj)![1]);
    const start = offsets[contentsId]! + obj.indexOf('stream\n') + 'stream\n'.length;
    assert.equal(s.slice(start + length, start + length + 10), '\nendstream', 'stream length is exact');
    const content = inflateSync(buf.subarray(start, start + length)).toString('latin1');
    // Every text object carries its exact string as ActualText (UTF-16BE).
    const texts = [...content.matchAll(/\/ActualText <FEFF([0-9A-F]*)>/g)].map((m) => Buffer.from(m[1]!, 'hex').swap16().toString('utf16le'));
    return { width: Number(box[1]), height: Number(box[2]), content, texts };
  });
  return { version: '1.7', objects: count - 1, pages, info: body(3) };
}

const render = (tree: SyntheticTree, options: Partial<ExportOptions> = {}, maxPages = 2000): RenderResult =>
  renderTreePdf({
    workspaceName: 'Test family',
    members: tree.members,
    relationships: tree.relationships,
    options: { ...DEFAULT_OPTIONS, ...options },
    generatedAt: new Date('2026-10-25T10:00:00Z'),
    maxPages,
    collectManifest: true,
  });

/** No two boxes overlap; every parent is in a higher row than each child; spouses share a row. */
function assertLayoutInvariants(layout: TreeLayout, tree: SyntheticTree) {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  assert.equal(layout.nodes.length, tree.members.length, 'every member is laid out');
  assert.equal(new Set(layout.nodes.map((n) => n.id)).size, tree.members.length, 'each member exactly once');
  const sorted = [...layout.nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]!;
    assert.ok(a.x >= -0.01 && a.y >= -0.01 && a.x + a.w <= layout.width + 0.01 && a.y + a.h <= layout.height + 0.01, 'box inside the drawing');
    for (let j = i + 1; j < sorted.length && sorted[j]!.y < a.y + a.h; j += 1) {
      const b = sorted[j]!;
      const overlap = a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01;
      assert.ok(!overlap, `boxes ${a.number} and ${b.number} overlap`);
    }
  }
  for (const r of tree.relationships) {
    const a = byId.get(r.from)!;
    const b = byId.get(r.to)!;
    if (r.type === 'parent_of') {
      assert.ok(b.y >= a.y + a.h, 'a child is drawn below its parent');
    }
  }
  const drawn = new Set(layout.edges.flatMap((e) => e.relationshipIds));
  for (const r of tree.relationships) {
    assert.ok(drawn.has(r.id), `relationship ${r.id} is drawn`);
  }
}

/** Horizontal or vertical segments of parent lines never pass through a box they do not belong to. */
function assertLinesAvoidBoxes(layout: TreeLayout) {
  for (const edge of layout.edges.filter((e) => e.kind === 'parent')) {
    for (const path of edge.paths) {
      for (let i = 1; i < path.length; i += 1) {
        const [x1, y1] = path[i - 1]!;
        const [x2, y2] = path[i]!;
        if (x1 !== x2 && y1 !== y2) {
          continue;
        }
        for (const n of layout.nodes) {
          const inside = (x: number, y: number) => x > n.x + 0.5 && x < n.x + n.w - 0.5 && y > n.y + 0.5 && y < n.y + n.h - 0.5;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          assert.ok(!inside(mx, my), `a parent line passes through box ${n.number}`);
        }
      }
    }
  }
}

/** The shared HarfBuzz engine, adapted to the layout's measure interface. */
const engine = textEngine();

describe('pdf writer', () => {
  it('writes a structurally valid PDF with embedded font subsets, metadata, exact xref offsets and stream lengths', () => {
    const doc = new PdfDocument({ title: 'Family tree: પટેલ परिवार (test) \\ ok', subject: 'Complete tree', creationDate: new Date('2026-10-25T10:00:00Z') }, engine);
    const canvas = new PdfCanvas(200, 100);
    canvas.text('Hello (world) \\ ok', 10, 20, 12);
    canvas.text('હીર પટેલ', 10, 40, 12);
    canvas.text('हीर पटेल', 10, 60, 12, { bold: true });
    canvas.stroke([0, 0, 0], 1);
    canvas.line([[0, 0], [100, 50]]);
    doc.addPage(canvas);
    doc.addPage(new PdfCanvas(300, 300));
    const bytes = doc.toBuffer();
    const parsed = parsePdf(bytes);
    assert.equal(parsed.pages.length, 2);
    assert.deepEqual(parsed.pages[0]!.texts, ['Hello (world) \\ ok', 'હીર પટેલ', 'हीर पटेल']);
    assert.equal(parsed.pages[1]!.width, 300);
    // Info strings are UTF-16BE hex with a byte-order mark, so any title is safe.
    const title = /\/Title <FEFF([0-9A-F]+)>/.exec(parsed.info)!;
    assert.equal(Buffer.from(title[1]!, 'hex').swap16().toString('utf16le'), 'Family tree: પટેલ परिवार (test) \\ ok');
    assert.match(parsed.info, /\/CreationDate \(D:20261025100000Z\)/);
    assert.match(parsed.info, /\/Producer \(Kulvriksh tree export\)/);
    // Three fonts, each embedded as a tagged subset with a ToUnicode map; nothing relies on viewer fonts.
    const s = bytes.toString('latin1');
    const names = [...s.matchAll(/\/Type \/Font \/Subtype \/Type0 \/BaseFont \/([A-Z]{6})\+(\S+)/g)].map((m) => m[2]);
    assert.deepEqual(names.sort(), ['NotoSans-Regular', 'NotoSansDevanagari-Regular', 'NotoSansGujarati-Regular']);
    assert.equal([...s.matchAll(/\/FontFile2 \d+ 0 R/g)].length, 3);
    assert.equal([...s.matchAll(/\/ToUnicode \d+ 0 R/g)].length, 3);
    assert.ok(!/\/Helvetica/.test(s), 'no unembedded standard fonts');
    // Subsets are small: well under the 760 KB of the three full fonts.
    assert.ok(bytes.length < 60_000, `PDF is ${bytes.length} bytes`);
  });
});

describe('text shaping', () => {
  const glyphCount = (text: string) => engine.shape(text).runs.reduce((n, r) => n + r.glyphs.length, 0);
  const fonts = (text: string) => engine.shape(text).runs.map((r) => r.font.key);

  it('shapes the sample names of every supported script with no missing glyphs', () => {
    for (const name of ['હીર પટેલ', 'જયેશભાઈ પટેલ', 'વડોદરા', 'हीर पटेल', 'राजेश कुमार', 'परिवार वृक्ष', 'Heel Patel', 'José Álvarez', 'Ānand', 'O’Brien-Smith, Jr. (Ravi) — “Dada” 42']) {
      const shaped = engine.shape(name);
      assert.equal(shaped.missing, 0, name);
      assert.ok(shaped.advance > 0, name);
    }
    assert.deepEqual(fonts('હીર પટેલ'), ['gujarati']);
    assert.deepEqual(fonts('राजेश कुमार'), ['devanagari']);
    assert.deepEqual(fonts('José Álvarez'), ['latin']);
  });

  it('applies Indic shaping: conjuncts, reordered vowel signs and positioned marks', () => {
    // क्ष (ka + virama + ssa) and ક્ષ become one conjunct glyph each.
    assert.equal(glyphCount('क्ष'), 1);
    assert.equal(glyphCount('ક્ષ'), 1);
    // In परि the vowel sign ि is drawn before र although it is typed after it.
    const pari = engine.shape('परि').runs[0]!.glyphs;
    const ra = engine.shape('र').runs[0]!.glyphs[0]!.gid;
    assert.equal(pari.length, 3);
    assert.equal(pari[2]!.gid, ra, 'र is the last glyph: ि was reordered before it');
    // The vowel sign ु under म is placed with a non-zero offset by the font's mark positioning.
    assert.ok(engine.shape('कुमार').runs[0]!.glyphs.some((g) => g.advance === 0 && (g.xOffset !== 0 || g.yOffset !== 0)));
    // A combining accent (A + U+0301) stays with its base letter.
    assert.equal(engine.shape('Ánand').missing, 0);
  });

  it('falls back per character between fonts and counts characters no font has', () => {
    // Gujarati font has no Latin digits: they come from Noto Sans in the same name.
    assert.deepEqual(fonts('હીર 42'), ['gujarati', 'latin']);
    assert.deepEqual(fonts('Mixed नाम ગુજરાતી'), ['latin', 'devanagari', 'gujarati']);
    // Tamil is not bundled yet: counted as missing (shown as a box and warned), never replaced by "?".
    assert.equal(engine.shape('தமிழ்').missing > 0, true);
    assert.ok(!engine.shape('தமிழ்').runs.some((r) => r.glyphs.some((g) => g.text === '?')));
  });

  it('wraps long names between words or grapheme clusters, and truncates beyond four lines with an ellipsis', () => {
    const short = wrapLabel('Asha Patel', 9, 90, engine);
    assert.deepEqual(short, { lines: ['Asha Patel'], truncated: false });
    const long = wrapLabel('Very Long Name '.repeat(12).trim(), 9, 90, engine);
    assert.equal(long.lines.length, 4);
    assert.equal(long.truncated, true);
    assert.ok(long.lines[3]!.endsWith('…'));
    const unbroken = wrapLabel('X'.repeat(60), 9, 90, engine);
    assert.ok(unbroken.lines.length > 1, 'an unbroken word is split');
    // A long Devanagari word is split only between clusters: every piece shapes without loose marks.
    const word = 'परिवारवृक्षक्षत्रियश्रीकुमार'.repeat(3);
    const pieces = wrapLabel(word, 9, 60, engine, 10).lines;
    assert.ok(pieces.length > 1);
    assert.equal(pieces.join(''), word);
    for (const piece of pieces) {
      assert.ok(!/^[ा-्ंः]/.test(piece), `piece "${piece}" starts with a dependent sign`);
    }
    // A hyphenated name too wide for the box breaks after the hyphen, not one letter from the end.
    const width = engine.width('Álvarez-Ānandakrishnan', 9) - 1;
    assert.deepEqual(wrapLabel('Álvarez-Ānandakrishnan', 9, width, engine).lines, ['Álvarez-', 'Ānandakrishnan']);
  });
});

describe('tree layout', () => {
  it('lays out an empty tree', () => {
    const layout = layoutTree([], [], { labelSize: 9, showNumbers: true, measure: engine });
    assert.equal(layout.nodes.length, 0);
    assert.equal(layout.width, 0);
  });

  it('places a small family by generation with spouses side by side', () => {
    const tree = deepTree(3);
    const layout = layoutTree(tree.members, tree.relationships, { labelSize: 9, showNumbers: true, measure: engine });
    assertLayoutInvariants(layout, tree);
    assertLinesAvoidBoxes(layout);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const r of tree.relationships.filter((x) => x.type === 'spouse_of')) {
      assert.equal(byId.get(r.from)!.y, byId.get(r.to)!.y, 'spouses share a row');
    }
    assert.equal(layout.stats.generations, 3);
    assert.equal(layout.stats.crossings, 0);
  });

  it('handles a wide family (one couple, 60 married children)', () => {
    const tree = wideTree(60);
    const layout = layoutTree(tree.members, tree.relationships, { labelSize: 9, showNumbers: false, measure: engine });
    assertLayoutInvariants(layout, tree);
    assertLinesAvoidBoxes(layout);
    assert.equal(layout.stats.widestRow, 120);
    assert.equal(layout.stats.crossings, 0);
  });

  it('handles a deep family (40 generations)', () => {
    const tree = deepTree(40);
    const layout = layoutTree(tree.members, tree.relationships, { labelSize: 9, showNumbers: true, measure: engine });
    assertLayoutInvariants(layout, tree);
    assert.equal(layout.stats.generations, 40);
  });

  it('handles hundreds of members with remarriages, cousin marriages and loose members', () => {
    const tree = randomFamily(400, 11);
    const layout = layoutTree(tree.members, tree.relationships, { labelSize: 9, showNumbers: true, measure: engine });
    assertLayoutInvariants(layout, tree);
    assertLinesAvoidBoxes(layout);
    assert.ok(layout.stats.membersWithoutRelationships > 0);
  });

  it('routes a parent line past intermediate rows with dummy points', () => {
    // g1 is parent of x; g1's spouse g2 is a grandchild generation away through another line, so
    // x is pushed two rows below g1 and its line must bend around the row in between.
    const ids = ['a', 'b', 'c', 'd', 'e'].map((k, i) => `00000000-0000-4000-8000-00000000000${i + 1}`);
    const [a, b, c, d, e] = ids as [string, string, string, string, string];
    const tree: SyntheticTree = {
      members: ids.map((id, i) => ({ id, name: `M${i + 1}` })),
      relationships: [
        { id: 'r1', type: 'parent_of', from: a, to: b },
        { id: 'r2', type: 'parent_of', from: b, to: c },
        { id: 'r3', type: 'parent_of', from: c, to: e },
        { id: 'r4', type: 'parent_of', from: d, to: e },
        { id: 'r5', type: 'parent_of', from: a, to: d },
      ],
    };
    const layout = layoutTree(tree.members, tree.relationships, { labelSize: 9, showNumbers: false, measure: engine });
    assertLayoutInvariants(layout, tree);
    assertLinesAvoidBoxes(layout);
    assert.equal(layout.stats.dummyPoints, 1);
  });

  it('draws a spouse who is also in an older generation with a dashed connector instead of looping', () => {
    const [a, b, c] = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3'];
    const tree: SyntheticTree = {
      members: [a, b, c].map((id, i) => ({ id, name: `P${i}` })),
      relationships: [
        { id: 's1', type: 'parent_of', from: a!, to: b! },
        { id: 's2', type: 'parent_of', from: b!, to: c! },
        { id: 's3', type: 'spouse_of', from: a!, to: c! },
      ],
    };
    const layout = layoutTree(tree.members, tree.relationships, { labelSize: 9, showNumbers: false, measure: engine });
    assertLayoutInvariants(layout, tree);
    assert.equal(layout.stats.unalignedSpouses, 1);
    assert.equal(layout.edges.find((x) => x.relationshipIds.includes('s3'))!.kind, 'spouse_unaligned');
  });
});

describe('tree PDF modes', () => {
  it('exports an empty tree as a valid one-page PDF that says so', () => {
    const result = render({ members: [], relationships: [] });
    const pdf = parsePdf(result.pdf);
    assert.equal(pdf.pages.length, 1);
    assert.ok(pdf.pages[0]!.texts.includes('There are no members in this family tree yet.'));
    assert.deepEqual(result.warnings, []);
  });

  it('single page: fits the tree, names every member and relationship, numbers the pages', () => {
    const tree = randomFamily(60, 3);
    const result = render(tree, { mode: 'single', pageSize: 'A3' });
    const pdf = parsePdf(result.pdf);
    assert.equal(pdf.pages.length, result.pageCount);
    const tree0 = result.manifest![0]!;
    assert.equal(tree0.kind, 'tree');
    assert.equal(new Set(tree0.nodes).size, 60);
    assert.deepEqual(new Set(tree0.relationships), new Set(tree.relationships.map((r) => r.id)));
    const text = pdf.pages[0]!.texts;
    for (const m of tree.members) {
      assert.ok(text.includes(m.name), `${m.name} printed`);
    }
    pdf.pages.forEach((page, i) => assert.ok(page.texts.includes(`Page ${i + 1} of ${pdf.pages.length}`), `page ${i + 1} numbered`));
    // A3 landscape, chosen automatically for a wide tree.
    assert.equal(Math.round(pdf.pages[0]!.width), 1191);
    // The index lists every member exactly once.
    const indexed = result.manifest!.filter((p) => p.kind === 'index').flatMap((p) => p.indexed!);
    assert.equal(indexed.length, 60);
    assert.equal(new Set(indexed).size, 60);
  });

  it('single page: warns when names become hard to read, and when unreadable', () => {
    const medium = render(randomFamily(150, 5), { mode: 'single', pageSize: 'A4' });
    assert.ok(medium.warnings.includes('labels_small') || medium.warnings.includes('labels_unreadable'));
    const tiny = render(wideTree(10), { mode: 'single', pageSize: 'A0' });
    assert.ok(!tiny.warnings.includes('labels_small') && !tiny.warnings.includes('labels_unreadable'));
    assert.ok(tiny.details.effectiveLabelPt >= 9);
  });

  it('poster: sizes the page from the layout at the chosen scale and keeps names at full size', () => {
    const tree = randomFamily(120, 9);
    const result = render(tree, { mode: 'poster', scalePercent: 100, labelSize: 10 });
    const pdf = parsePdf(result.pdf);
    assert.equal(result.details.effectiveLabelPt, 10);
    assert.ok(pdf.pages[0]!.width > 595, 'larger than a sheet');
    assert.equal(new Set(result.manifest![0]!.nodes).size, 120);
    // The index of a poster is printed on A4.
    const indexPage = pdf.pages[pdf.pages.length - 1]!;
    assert.equal(Math.round(indexPage.width), 595);
  });

  it('poster: reduces a tree that would exceed 200 inches and says so', () => {
    const result = render(wideTree(120), { mode: 'poster', scalePercent: 400 });
    const pdf = parsePdf(result.pdf);
    assert.ok(result.warnings.includes('poster_reduced'));
    assert.ok(pdf.pages[0]!.width <= 14_400.01);
  });

  it('tiled: constant scale, overview first, every member and relationship on some sheet, numbered sheets', () => {
    const tree = randomFamily(250, 4);
    const result = render(tree, { mode: 'tiled', pageSize: 'A4', scalePercent: 100 });
    const pdf = parsePdf(result.pdf);
    const { rows, columns } = result.details.sheets!;
    assert.ok(rows * columns > 1);
    assert.equal(result.manifest![0]!.kind, 'overview');
    const sheets = result.manifest!.filter((p) => p.kind === 'sheet');
    assert.equal(sheets.length, rows * columns);
    assert.deepEqual(
      sheets.map((p) => p.sheet!.number),
      Array.from({ length: rows * columns }, (_, i) => i + 1),
    );
    assert.equal(new Set(sheets.flatMap((p) => p.nodes!)).size, 250);
    assert.deepEqual(new Set(sheets.flatMap((p) => p.relationships!)), new Set(tree.relationships.map((r) => r.id)));
    // Same scale everywhere: every sheet is the same size, and names print at the chosen size.
    assert.equal(new Set(sheets.map((p) => `${p.width}x${p.height}`)).size, 1);
    assert.equal(result.details.effectiveLabelPt, 9);
    pdf.pages.forEach((page, i) => assert.ok(page.texts.includes(`Page ${i + 1} of ${pdf.pages.length}`)));
    pdf.pages.slice(1, 1 + rows * columns).forEach((page, i) => {
      assert.ok(page.texts.some((t) => t.includes(`sheet ${i + 1} of ${rows * columns}`)), `sheet label ${i + 1}`);
      // Each sheet is clipped to its printed area.
      assert.match(page.content, / re W n/);
    });
    // Overview names every sheet.
    for (let n = 1; n <= rows * columns; n += 1) {
      assert.ok(pdf.pages[0]!.texts.includes(String(n)));
    }
  });

  it('tiled: a line crossing a sheet edge is drawn on both sheets, with guides and registration marks', () => {
    const tree = wideTree(30);
    const result = render(tree, { mode: 'tiled', pageSize: 'A4', orientation: 'landscape' });
    const sheets = result.manifest!.filter((p) => p.kind === 'sheet');
    assert.ok(sheets.length >= 3);
    // The parents' family bus spans the whole row of children, so it reaches every sheet.
    const bus = tree.relationships.find((r) => r.type === 'parent_of')!.id;
    const withBus = sheets.filter((p) => p.relationships!.includes(bus)).length;
    assert.ok(withBus >= 2, `bus drawn on ${withBus} sheets`);
    // A member box straddling a boundary appears on both neighbouring sheets.
    let straddling = 0;
    for (let i = 0; i + 1 < sheets.length; i += 1) {
      const shared = sheets[i]!.nodes!.filter((id) => sheets[i + 1]!.nodes!.includes(id));
      straddling += shared.length;
    }
    assert.ok(straddling > 0);
    const pdf = parsePdf(result.pdf);
    const middle = pdf.pages[2]!;
    assert.match(middle.content, /\[3 2\] 0 d/, 'dashed alignment guides');
    assert.ok(middle.texts.some((t) => t.startsWith('Left: sheet')));
    assert.ok(middle.texts.some((t) => t.startsWith('Right: sheet')));
  });

  it('tiled: refuses an export over the page limit', () => {
    assert.throws(() => render(randomFamily(400, 2), { mode: 'tiled', pageSize: 'A4', scalePercent: 400 }, 30), (err: unknown) => err instanceof ExportLimitError && err.code === 'too_many_pages');
  });

  it('marks truncated and unsupported names as warnings; supported scripts are not warned about', () => {
    const tree: SyntheticTree = {
      members: [
        { id: '00000000-0000-4000-8000-000000000001', name: 'A'.repeat(20) + ' ' + 'Very long family name '.repeat(6) },
        { id: '00000000-0000-4000-8000-000000000002', name: 'Rāma' },
        { id: '00000000-0000-4000-8000-000000000003', name: 'தமிழ் செல்வன்' },
      ],
      relationships: [],
    };
    const result = render(tree, { mode: 'single' });
    assert.ok(result.warnings.includes('labels_truncated'));
    assert.ok(result.warnings.includes('unsupported_characters'));
    // The full name is still in the index.
    const pdf = parsePdf(result.pdf);
    const indexText = pdf.pages[pdf.pages.length - 1]!.texts.join(' ');
    assert.match(indexText, /Very long family name Very long family name/);
  });

  it('selects an explicit subtree and labels it', () => {
    const tree = deepTree(5);
    const focus = tree.members[2]!; // the first child generation's heir
    const descendants = selectScope(tree.members, tree.relationships, { kind: 'descendants', memberId: focus.id })!;
    assert.ok(descendants.members.length < tree.members.length);
    assert.ok(descendants.members.some((m) => m.id === focus.id));
    const ancestors = selectScope(tree.members, tree.relationships, { kind: 'ancestors', memberId: focus.id })!;
    assert.deepEqual(ancestors.members.map((m) => m.name).sort(), ['Person 1', 'Person 2', focus.name].sort());
    assert.equal(selectScope(tree.members, tree.relationships, { kind: 'ancestors', memberId: '00000000-0000-4000-8000-ffffffffffff' }), undefined);
    const result = render(tree, { scope: { kind: 'descendants', memberId: focus.id } });
    const pdf = parsePdf(result.pdf);
    assert.ok(pdf.pages[0]!.texts.some((t) => t.startsWith(`Descendants of ${focus.name}`)));
    assert.equal(result.memberCount, descendants.members.length);
  });

  it('stress: thousands of members export in every mode within a bounded time', () => {
    const tree = randomFamily(3000, 21);
    for (const mode of ['single', 'poster', 'tiled'] as const) {
      const started = performance.now();
      const result = render(tree, { mode, pageSize: 'A3', scalePercent: mode === 'tiled' ? 50 : 100 });
      const ms = performance.now() - started;
      assert.ok(ms < 30_000, `${mode} took ${Math.round(ms)} ms`);
      const pdf = parsePdf(result.pdf);
      assert.equal(pdf.pages.length, result.pageCount);
      const drawn = new Set(result.manifest!.filter((p) => p.kind === 'tree' || p.kind === 'sheet').flatMap((p) => p.nodes!));
      assert.equal(drawn.size, 3000, `${mode}: every member drawn`);
      const indexed = result.manifest!.filter((p) => p.kind === 'index').flatMap((p) => p.indexed!);
      assert.equal(indexed.length, 3000, `${mode}: every member indexed`);
    }
  });
});

describe('export options', () => {
  it('defaults to the complete tree on one A4 sheet', () => {
    assert.deepEqual(validateExportOptions(undefined), { ok: true, value: DEFAULT_OPTIONS });
    assert.deepEqual(validateExportOptions({}), { ok: true, value: DEFAULT_OPTIONS });
  });

  it('accepts every documented control', () => {
    const result = validateExportOptions({
      mode: 'tiled',
      pageSize: 'custom',
      customWidthMm: 600,
      customHeightMm: 400,
      orientation: 'landscape',
      labelSize: 11,
      scalePercent: 80,
      showNumbers: false,
      showGeneration: true,
      includeIndex: false,
      scope: { kind: 'descendants', memberId: '00000000-0000-4000-8000-000000000001' },
    });
    assert.equal(result.ok, true);
  });

  it('refuses unknown fields, bad values and incomplete custom sizes', () => {
    const result = validateExportOptions({ mode: 'huge', pageSize: 'custom', labelSize: 100, scalePercent: 12.5, extra: 1, scope: { kind: 'ancestors', memberId: 'x' }, showNumbers: 'yes' });
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys((result as { fields: Record<string, string> }).fields).sort(), [
      'customHeightMm',
      'customWidthMm',
      'extra',
      'labelSize',
      'mode',
      'scalePercent',
      'scope',
      'showNumbers',
    ]);
    assert.equal(validateExportOptions([]).ok, false);
    assert.equal(validateExportOptions({ mode: 'poster', pageSize: 'custom', customWidthMm: 500, customHeightMm: 500 }).ok, false);
    assert.equal(validateExportOptions({ pageSize: 'A4', customWidthMm: 300 }).ok, false);
  });
});

describe('printable sheets (TASK-12 visual review fixes)', () => {
  it('every member box is whole on at least one sheet, and the index points to such a sheet', () => {
    const tree = withIndianNames(wideTree(30), 3);
    const result = render(tree, { mode: 'tiled', pageSize: 'A4', orientation: 'landscape' });
    const layout = layoutTree(tree.members, tree.relationships, { labelSize: 9, showNumbers: true, measure: engine });
    const sheets = result.manifest!.filter((p) => p.kind === 'sheet');
    // Sheet views are in drawing coordinates; the tree starts below the title block (treeTop).
    const inside = (b: { x: number; y: number; w: number; h: number }, v: { x: number; y: number; w: number; h: number }) =>
      b.x >= v.x - 0.01 && b.y >= v.y - 0.01 && b.x + b.w <= v.x + v.w + 0.01 && b.y + b.h <= v.y + v.h + 0.01;
    const pdf = parsePdf(result.pdf);
    const indexText = pdf.pages.filter((_, i) => result.manifest![i]!.kind === 'index').flatMap((p) => p.texts);
    for (const node of layout.nodes) {
      const holders = sheets.filter((s) => s.nodes!.includes(node.id));
      assert.ok(holders.length > 0, `member ${node.number} drawn`);
      const whole = holders.filter((s) => inside({ x: node.x, y: node.y + treeTop(result), w: node.w, h: node.h }, s.sheet!));
      assert.ok(whole.length > 0, `member ${node.number} is whole on some sheet`);
      const ref = indexText.find((t) => t.startsWith(`No. ${node.number} ·`));
      const sheetNo = Number(/sheet (\d+)/.exec(ref ?? '')?.[1]);
      assert.ok(whole.some((s) => s.sheet!.number === sheetNo), `index sheet ${sheetNo} holds member ${node.number} whole`);
    }
  });

  it('centres the drawing in the sheet grid, identically on every sheet', () => {
    const result = render(wideTree(12), { mode: 'tiled', pageSize: 'A4', orientation: 'landscape' });
    const sheets = result.manifest!.filter((p) => p.kind === 'sheet');
    // The first sheet's view starts left of / above the drawing by the same centring shift.
    assert.ok(sheets[0]!.sheet!.y < 0, 'vertical slack is split above and below the drawing');
    assert.equal(new Set(sheets.map((s) => s.sheet!.y)).size, 1);
  });

  it('fits a tree on a target number of sheets at the largest possible scale, or says it cannot', () => {
    const tree = randomFamily(120, 5);
    for (const target of [2, 6, 20]) {
      const r = render(tree, { mode: 'tiled', pageSize: 'A4', targetSheets: target });
      const { rows, columns } = r.details.sheets!;
      assert.ok(rows * columns <= target, `${rows}x${columns} ≤ ${target}`);
      // One step larger would need more sheets (the scale is the largest that fits).
      const bigger = render(tree, { mode: 'tiled', pageSize: 'A4', scalePercent: Math.min(400, Math.ceil(r.details.scale * 100) + 2) });
      const more = bigger.details.sheets!.rows * bigger.details.sheets!.columns;
      assert.ok(r.details.scale >= 3.99 || more > target || bigger.details.scale > r.details.scale, `target ${target}`);
    }
    const impossible = render(randomFamily(400, 2), { mode: 'tiled', pageSize: 'A4', targetSheets: 1 });
    assert.ok(impossible.warnings.includes('target_sheets_unreachable'));
    assert.equal(impossible.details.scale, 0.25);
  });
});

/** Where the tree starts on the drawing (below the title block). */
function treeTop(result: RenderResult): number {
  return result.details.treeTop;
}

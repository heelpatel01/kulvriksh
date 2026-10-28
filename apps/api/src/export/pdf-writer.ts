import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { subsetFont } from './font-subset.ts';
import { textEngine, type LoadedFont, type ShapedText, type TextEngine } from './text-engine.ts';

// A minimal PDF 1.7 writer for vector drawings (TASK-11, Unicode since TASK-12). It writes pages
// with Flate-compressed content streams, an Info dictionary and an exact cross-reference table.
//
// Text is drawn from glyphs shaped by HarfBuzz (text-engine.ts). Each font used is embedded as a
// subset (only the glyphs the document uses) in a Type 0 / CIDFontType2 font with Identity-H
// encoding and an identity CID-to-glyph map, so any viewer shows exactly the glyphs chosen by the
// shaper — no viewer-side fonts are needed. Positioned glyphs (Indic vowel signs and marks) are
// placed individually. A ToUnicode map lets readers copy and search the text.

/** Formats a number compactly for content streams (at most 2 decimals). */
export function n(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('non-finite coordinate');
  }
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export type Rgb = readonly [number, number, number];

const hex4 = (v: number) => v.toString(16).padStart(4, '0').toUpperCase();

/** Glyphs used, per font index: gid → the text it stands for (for ToUnicode). */
type GlyphUse = Map<number, Map<number, string>>;

function recordGlyph(used: GlyphUse, font: number, gid: number, text: string) {
  let glyphs = used.get(font);
  if (!glyphs) {
    glyphs = new Map();
    used.set(font, glyphs);
  }
  if (!glyphs.has(gid) || (glyphs.get(gid) === '' && text !== '')) {
    glyphs.set(gid, text);
  }
}

/**
 * Drawing operations for one page, in a top-left coordinate system (y grows downwards), mapped to
 * PDF space through `scale`, an origin offset and a page margin.
 */
export class PdfCanvas {
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly used: GlyphUse = new Map();
  readonly #ops: string[] = [];
  #scale = 1;
  #dx = 0;
  #dy = 0;

  constructor(pageWidth: number, pageHeight: number) {
    this.pageWidth = pageWidth;
    this.pageHeight = pageHeight;
  }

  /** Maps model coordinates: page point = margin + (model - origin) * scale. */
  setTransform(scale: number, originX = 0, originY = 0, marginX = 0, marginY = 0): void {
    this.#scale = scale;
    this.#dx = marginX - originX * scale;
    this.#dy = marginY - originY * scale;
  }

  get scale(): number {
    return this.#scale;
  }

  #px(x: number) {
    return this.#dx + x * this.#scale;
  }

  #py(y: number) {
    return this.pageHeight - (this.#dy + y * this.#scale);
  }

  save(): void {
    this.#ops.push('q');
  }

  restore(): void {
    this.#ops.push('Q');
  }

  /** Clips later drawing to a rectangle given in PAGE coordinates (top-left origin, points). */
  clipPage(x: number, y: number, w: number, h: number): void {
    this.#ops.push(`${n(x)} ${n(this.pageHeight - y - h)} ${n(w)} ${n(h)} re W n`);
  }

  stroke(color: Rgb, width: number, dash?: readonly number[]): void {
    this.#ops.push(`${color.map(n).join(' ')} RG ${n(width * this.#scale)} w ${dash ? `[${dash.map((d) => n(d * this.#scale)).join(' ')}] 0 d` : '[] 0 d'}`);
  }

  /** Stroke settings in page units (not scaled), for page furniture such as marks and guides. */
  strokePage(color: Rgb, width: number, dash?: readonly number[]): void {
    this.#ops.push(`${color.map(n).join(' ')} RG ${n(width)} w ${dash ? `[${dash.map(n).join(' ')}] 0 d` : '[] 0 d'}`);
  }

  fill(color: Rgb): void {
    this.#ops.push(`${color.map(n).join(' ')} rg`);
  }

  /** A polyline in model coordinates. */
  line(points: ReadonlyArray<readonly [number, number]>): void {
    if (points.length < 2) {
      return;
    }
    const [first, ...rest] = points;
    this.#ops.push(`${n(this.#px(first![0]))} ${n(this.#py(first![1]))} m ${rest.map(([x, y]) => `${n(this.#px(x))} ${n(this.#py(y))} l`).join(' ')} S`);
  }

  /** A line in page coordinates. */
  linePage(x1: number, y1: number, x2: number, y2: number): void {
    this.#ops.push(`${n(x1)} ${n(this.pageHeight - y1)} m ${n(x2)} ${n(this.pageHeight - y2)} l S`);
  }

  /** A rectangle in model coordinates: 'f' fill, 'S' stroke, 'B' both. */
  rect(x: number, y: number, w: number, h: number, mode: 'f' | 'S' | 'B'): void {
    this.#ops.push(`${n(this.#px(x))} ${n(this.#py(y + h))} ${n(w * this.#scale)} ${n(h * this.#scale)} re ${mode}`);
  }

  rectPage(x: number, y: number, w: number, h: number, mode: 'f' | 'S' | 'B'): void {
    this.#ops.push(`${n(x)} ${n(this.pageHeight - y - h)} ${n(w)} ${n(h)} re ${mode}`);
  }

  /** Shaped text at a model-coordinate baseline. */
  text(content: ShapedText | string, x: number, baseline: number, size: number, opts: { bold?: boolean; color?: Rgb } = {}): void {
    this.#glyphs(typeof content === 'string' ? textEngine().shape(content) : content, this.#px(x), this.#py(baseline), size * this.#scale, opts);
  }

  /** Shaped text at a page-coordinate baseline (unscaled); `rotate90` turns it to read bottom-to-top. */
  textPage(content: ShapedText | string, x: number, baseline: number, size: number, opts: { bold?: boolean; color?: Rgb; rotate90?: boolean } = {}): void {
    this.#glyphs(typeof content === 'string' ? textEngine().shape(content) : content, x, this.pageHeight - baseline, size, opts);
  }

  #glyphs(shaped: ShapedText, x: number, y: number, size: number, opts: { bold?: boolean; color?: Rgb; rotate90?: boolean }) {
    if (shaped.runs.length === 0) {
      return;
    }
    const color = (opts.color ?? [0, 0, 0]).map(n).join(' ');
    // ActualText carries the exact string: shaped glyphs (reordered Indic vowel signs, conjuncts)
    // cannot be mapped back to text glyph by glyph, so copy, search and screen readers use this.
    const parts: string[] = [`/Span << /ActualText <${utf16Hex(shaped.text)}> >> BDC BT`, `${color} rg`];
    // Bold is drawn by also stroking the outline (the bundled fonts have one weight).
    if (opts.bold) {
      parts.push(`${color} RG ${n(size * 0.035)} w [] 0 d 2 Tr`);
    }
    const at = (along: number, across: number) =>
      opts.rotate90 ? `0 1 -1 0 ${n(x - across)} ${n(y + along)} Tm` : `1 0 0 1 ${n(x + along)} ${n(y + across)} Tm`;
    let pen = 0;
    for (const run of shaped.runs) {
      parts.push(`/K${run.font.index} ${n(size)} Tf`);
      let segment: string[] = [];
      let segmentStart = pen;
      const flush = () => {
        if (segment.length > 0) {
          parts.push(`${at(segmentStart, 0)} [${segment.join('')}] TJ`);
          segment = [];
        }
      };
      for (const g of run.glyphs) {
        recordGlyph(this.used, run.font.index, g.gid, g.text);
        const advance = (g.advance / 1000) * size;
        if (g.xOffset !== 0 || g.yOffset !== 0) {
          // A positioned mark: draw it on its own at the shaper's offset.
          flush();
          parts.push(`${at(pen + (g.xOffset / 1000) * size, (g.yOffset / 1000) * size)} [<${hex4(g.gid)}>] TJ`);
          pen += advance;
          continue;
        }
        if (segment.length === 0) {
          segmentStart = pen;
        }
        segment.push(`<${hex4(g.gid)}>`);
        // The viewer advances by the font's own width; correct any difference the shaper made.
        const correction = textEngine().glyphAdvance(run.font, g.gid) - g.advance;
        if (Math.abs(correction) > 0.01) {
          segment.push(` ${n(correction)} `);
        }
        pen += advance;
      }
      flush();
    }
    if (opts.bold) {
      parts.push('0 Tr');
    }
    parts.push('ET EMC');
    this.#ops.push(parts.join(' '));
  }

  get operationCount(): number {
    return this.#ops.length;
  }

  content(): string {
    return this.#ops.join('\n');
  }
}

export interface PdfInfo {
  title: string;
  subject?: string;
  creationDate: Date;
}

function pdfDate(d: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** UTF-16BE hex of `text`, optionally with a byte-order mark (PDF text strings need one). */
function utf16Hex(text: string, bom = true): string {
  const buf = Buffer.from((bom ? String.fromCharCode(0xfeff) : '') + text, 'utf16le');
  buf.swap16();
  return buf.toString('hex').toUpperCase();
}

function toUnicodeCMap(glyphs: Map<number, string>): string {
  const entries = [...glyphs].filter(([, text]) => text !== '').sort((a, b) => a[0] - b[0]);
  const blocks: string[] = [];
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    blocks.push(`${chunk.length} beginbfchar\n${chunk.map(([gid, text]) => `<${hex4(gid)}> <${utf16Hex(text, false)}>`).join('\n')}\nendbfchar`);
  }
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    ...blocks,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

/** /W array: runs of consecutive glyph ids with their widths. */
function widthArray(engine: TextEngine, font: LoadedFont, gids: number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < gids.length) {
    const start = gids[i]!;
    const widths = [n(engine.glyphAdvance(font, start))];
    let j = i + 1;
    while (j < gids.length && gids[j] === gids[j - 1]! + 1) {
      widths.push(n(engine.glyphAdvance(font, gids[j]!)));
      j += 1;
    }
    out.push(`${start} [${widths.join(' ')}]`);
    i = j;
  }
  return `[${out.join(' ')}]`;
}

/** Collects pages and writes the file. Pages are compressed as they are added, to bound memory. */
export class PdfDocument {
  readonly #pages: Array<{ width: number; height: number; stream: Buffer }> = [];
  readonly #used: GlyphUse = new Map();
  readonly #info: PdfInfo;
  readonly #engine: TextEngine;

  constructor(info: PdfInfo, engine: TextEngine) {
    this.#info = info;
    this.#engine = engine;
  }

  addPage(canvas: PdfCanvas): void {
    for (const [font, glyphs] of canvas.used) {
      for (const [gid, text] of glyphs) {
        recordGlyph(this.#used, font, gid, text);
      }
    }
    this.#pages.push({ width: canvas.pageWidth, height: canvas.pageHeight, stream: deflateSync(Buffer.from(canvas.content(), 'latin1'), { level: 6 }) });
  }

  get pageCount(): number {
    return this.#pages.length;
  }

  /** Keys of the fonts embedded so far (for tests and diagnostics). */
  get fontsUsed(): string[] {
    return [...this.#used.keys()].sort().map((i) => this.#engine.fonts[i]!.key);
  }

  toBuffer(): Buffer {
    const objects: Array<string | Buffer[]> = [];
    const alloc = () => objects.push('');
    const set = (id: number, body: string | Buffer[]) => {
      objects[id - 1] = body;
    };
    const stream = (dict: string, data: Buffer) => [Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, 'latin1'), data, Buffer.from('\nendstream', 'latin1')];

    const catalogId = alloc();
    const pagesId = alloc();
    const infoId = alloc();
    const resourcesId = alloc();
    set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const subject = this.#info.subject ? ` /Subject <${utf16Hex(this.#info.subject)}>` : '';
    set(infoId, `<< /Title <${utf16Hex(this.#info.title)}>${subject} /Producer (Kulvriksh tree export) /Creator (Kulvriksh) /CreationDate (${pdfDate(this.#info.creationDate)}) >>`);

    // Fonts: one embedded subset per font actually used.
    const fontRefs: string[] = [];
    for (const index of [...this.#used.keys()].sort()) {
      const font = this.#engine.fonts[index]!;
      const glyphs = this.#used.get(index)!;
      const gids = [...new Set([0, ...glyphs.keys()])].sort((a, b) => a - b);
      const subset = subsetFont(font.data, gids);
      // Subset tag: six capital letters derived from the glyph set (ISO 32000-1 §9.6.4).
      const digest = createHash('sha256').update(`${font.key}:${gids.join(',')}`).digest();
      const tag = [...digest.subarray(0, 6)].map((b) => String.fromCharCode(65 + (b % 26))).join('');
      const name = `${tag}+${font.postScriptName}`;
      const fileId = alloc();
      const descriptorId = alloc();
      const cidId = alloc();
      const toUnicodeId = alloc();
      const type0Id = alloc();
      set(fileId, stream(`/Length1 ${subset.length} /Filter /FlateDecode`, deflateSync(subset)));
      const [x0, y0, x1, y1] = font.bbox.map((v) => n((v * 1000) / font.upem));
      set(
        descriptorId,
        `<< /Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [${x0} ${y0} ${x1} ${y1}] /ItalicAngle 0 /Ascent ${n((font.ascender * 1000) / font.upem)} /Descent ${n((font.descender * 1000) / font.upem)} /CapHeight 714 /StemV 80 /FontFile2 ${fileId} 0 R >>`,
      );
      set(
        cidId,
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /DW 1000 /W ${widthArray(this.#engine, font, gids)} /CIDToGIDMap /Identity >>`,
      );
      set(toUnicodeId, stream('/Filter /FlateDecode', deflateSync(Buffer.from(toUnicodeCMap(glyphs), 'latin1'))));
      set(type0Id, `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`);
      fontRefs.push(`/K${index} ${type0Id} 0 R`);
    }
    set(resourcesId, `<< /Font << ${fontRefs.join(' ')} >> >>`);

    const pageIds: number[] = [];
    for (const page of this.#pages) {
      const pageId = alloc();
      const contentId = alloc();
      set(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(page.width)} ${n(page.height)}] /Resources ${resourcesId} 0 R /Contents ${contentId} 0 R >>`);
      set(contentId, stream('/Filter /FlateDecode', page.stream));
      pageIds.push(pageId);
    }
    set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

    const chunks: Buffer[] = [];
    const offsets: number[] = [];
    let length = 0;
    const push = (b: Buffer) => {
      chunks.push(b);
      length += b.length;
    };
    // Header with a binary comment, so transfer tools treat the file as binary.
    push(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1'));
    objects.forEach((body, i) => {
      offsets[i + 1] = length;
      if (typeof body === 'string') {
        push(Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1'));
      } else {
        push(Buffer.from(`${i + 1} 0 obj\n`, 'latin1'));
        body.forEach(push);
        push(Buffer.from('\nendobj\n', 'latin1'));
      }
    });
    const count = objects.length + 1;
    const xrefAt = length;
    let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let id = 1; id < count; id += 1) {
      xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    push(Buffer.from(`${xref}trailer\n<< /Size ${count} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(chunks, length);
  }
}

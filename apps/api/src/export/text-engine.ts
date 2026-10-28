import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as hb from 'harfbuzzjs';

// Unicode text for the tree PDF (TASK-12). Names are shaped with HarfBuzz (harfbuzzjs, the
// reference OpenType shaping engine compiled to WebAssembly), so Indic scripts get their
// conjuncts, reordered vowel signs and positioned marks. Glyphs come from three embedded Noto
// fonts (SIL OFL 1.1, bundled in apps/api/assets/fonts):
//   Noto Sans            — Latin (with accents), Greek, Cyrillic, digits and punctuation
//   Noto Sans Gujarati   — Gujarati
//   Noto Sans Devanagari — Devanagari (Hindi, Marathi, Sanskrit, …)
// Text is split into runs by script; neutral characters (spaces, digits, punctuation) stay in the
// current run when its font has them, otherwise they use Noto Sans. A character no font covers is
// drawn as the font's "missing glyph" box and COUNTED, so the export warns instead of guessing.

export const FONT_KEYS = ['latin', 'gujarati', 'devanagari'] as const;
export type FontKey = (typeof FONT_KEYS)[number];

const FONT_FILES: Record<FontKey, { file: string; postScriptName: string }> = {
  latin: { file: 'NotoSans-Regular.ttf', postScriptName: 'NotoSans-Regular' },
  gujarati: { file: 'NotoSansGujarati-Regular.ttf', postScriptName: 'NotoSansGujarati-Regular' },
  devanagari: { file: 'NotoSansDevanagari-Regular.ttf', postScriptName: 'NotoSansDevanagari-Regular' },
};

/** src/export and dist/export both sit two levels below apps/api, where assets/ lives. */
export const FONT_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));

export interface LoadedFont {
  key: FontKey;
  index: number;
  postScriptName: string;
  data: Buffer;
  upem: number;
  font: hb.Font;
  unicodes: Set<number>;
  ascender: number;
  descender: number;
  bbox: [number, number, number, number];
}

/** One shaped glyph. Advances and offsets are in 1/1000 em. */
export interface Glyph {
  gid: number;
  advance: number;
  xOffset: number;
  yOffset: number;
  /** The characters this glyph stands for (first glyph of a cluster only), for copy and search. */
  text: string;
}

export interface ShapedRun {
  font: LoadedFont;
  glyphs: Glyph[];
}

export interface ShapedText {
  text: string;
  runs: ShapedRun[];
  /** Total advance in 1/1000 em. */
  advance: number;
  /** Characters no bundled font can show (drawn as a box, never replaced silently). */
  missing: number;
}

function scriptFont(cp: number): FontKey | undefined {
  if (cp >= 0x0a80 && cp <= 0x0aff) {
    return 'gujarati';
  }
  if ((cp >= 0x0900 && cp <= 0x097f) || (cp >= 0xa8e0 && cp <= 0xa8ff) || (cp >= 0x1cd0 && cp <= 0x1cff)) {
    return 'devanagari';
  }
  if ((cp >= 0x0041 && cp <= 0x005a) || (cp >= 0x0061 && cp <= 0x007a) || (cp >= 0x00c0 && cp <= 0x024f) || (cp >= 0x1e00 && cp <= 0x1eff) || (cp >= 0x0370 && cp <= 0x04ff)) {
    return 'latin';
  }
  return undefined;
}

/** Combining marks and joiners belong to the character before them. */
const inherits = (cp: number) => (cp >= 0x0300 && cp <= 0x036f) || cp === 0x200c || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f);

const CACHE_LIMIT = 20_000;

export class TextEngine {
  readonly fonts: readonly LoadedFont[];
  readonly #byKey: Record<FontKey, LoadedFont>;
  readonly #cache = new Map<string, ShapedText>();
  readonly #buffer = new hb.Buffer();
  readonly #advances = new Map<number, number>();

  constructor(dir = FONT_DIR) {
    this.fonts = FONT_KEYS.map((key, index) => {
      const spec = FONT_FILES[key];
      const data = readFileSync(`${dir}${spec.file}`);
      const face = new hb.Face(new hb.Blob(data));
      const font = new hb.Font(face);
      const head = face.referenceTable('head')!;
      const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
      const extents = font.hExtents();
      return {
        key,
        index,
        postScriptName: spec.postScriptName,
        data,
        upem: face.upem,
        font,
        unicodes: new Set(face.collectUnicodes()),
        ascender: extents.ascender,
        descender: extents.descender,
        bbox: [view.getInt16(36), view.getInt16(38), view.getInt16(40), view.getInt16(42)],
      };
    });
    this.#byKey = Object.fromEntries(this.fonts.map((f) => [f.key, f])) as Record<FontKey, LoadedFont>;
  }

  /** Splits text into runs that one font can shape. */
  #itemize(text: string): Array<{ font: LoadedFont; text: string }> {
    const runs: Array<{ font: LoadedFont; text: string }> = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      const current = runs[runs.length - 1];
      let font: LoadedFont;
      const own = scriptFont(cp);
      if (own) {
        font = this.#byKey[own];
      } else if (current && (inherits(cp) || current.font.unicodes.has(cp))) {
        font = current.font;
      } else {
        font = this.fonts.find((f) => f.unicodes.has(cp)) ?? this.#byKey.latin;
      }
      if (current && current.font === font) {
        current.text += ch;
      } else {
        runs.push({ font, text: ch });
      }
    }
    return runs;
  }

  shape(text: string): ShapedText {
    const cached = this.#cache.get(text);
    if (cached) {
      return cached;
    }
    const runs: ShapedRun[] = [];
    let advance = 0;
    let missing = 0;
    for (const run of this.#itemize(text)) {
      const buffer = this.#buffer;
      buffer.clearContents();
      buffer.addText(run.text);
      buffer.guessSegmentProperties();
      hb.shape(run.font.font, buffer);
      const infos = buffer.getGlyphInfosAndPositions();
      const scale = 1000 / run.font.upem;
      // Cluster starts, to give each cluster's first glyph the characters it stands for.
      const starts = [...new Set(infos.map((g) => g.cluster))].sort((a, b) => a - b);
      const seen = new Set<number>();
      const glyphs = infos.map((g) => {
        const first = !seen.has(g.cluster);
        seen.add(g.cluster);
        const next = starts.find((s) => s > g.cluster) ?? run.text.length;
        if (g.codepoint === 0) {
          missing += 1;
        }
        return {
          gid: g.codepoint,
          advance: (g.xAdvance ?? 0) * scale,
          xOffset: (g.xOffset ?? 0) * scale,
          yOffset: (g.yOffset ?? 0) * scale,
          text: first ? run.text.slice(g.cluster, next) : '',
        };
      });
      advance += glyphs.reduce((s, g) => s + g.advance, 0);
      runs.push({ font: run.font, glyphs });
    }
    const shaped = { text, runs, advance, missing };
    if (this.#cache.size >= CACHE_LIMIT) {
      this.#cache.clear();
    }
    this.#cache.set(text, shaped);
    return shaped;
  }

  /** Width in points at `size`. */
  width(text: string, size: number): number {
    return (this.shape(text).advance / 1000) * size;
  }

  /** Characters in `text` that no bundled font can show. */
  missing(text: string): number {
    return this.shape(text).missing;
  }

  /** Advance of one glyph in 1/1000 em (for the PDF /W array). */
  glyphAdvance(font: LoadedFont, gid: number): number {
    const key = font.index * 0x10000 + gid;
    let advance = this.#advances.get(key);
    if (advance === undefined) {
      advance = (font.font.glyphHAdvance(gid) * 1000) / font.upem;
      this.#advances.set(key, advance);
    }
    return advance;
  }
}

let shared: TextEngine | undefined;

/** One engine per thread: fonts are parsed once and shaping results are cached. */
export function textEngine(): TextEngine {
  shared ??= new TextEngine();
  return shared;
}

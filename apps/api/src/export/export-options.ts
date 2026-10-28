import { isUuid } from '../http.ts';

// Options for a family tree PDF (TASK-11). Everything here is layout only: no personal data is
// stored in export_job.options. Validation mirrors family-validation.ts: unknown fields are refused.

export const EXPORT_MODES = ['single', 'poster', 'tiled'] as const;
export type ExportMode = (typeof EXPORT_MODES)[number];

/** Standard sheet sizes in points (1 pt = 1/72 in), portrait. */
export const PAGE_SIZES = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  A2: [1190.55, 1683.78],
  A1: [1683.78, 2383.94],
  A0: [2383.94, 3370.39],
  Letter: [612, 792],
  Legal: [612, 1008],
  Tabloid: [792, 1224],
} as const satisfies Record<string, readonly [number, number]>;
export type PageSizeName = keyof typeof PAGE_SIZES | 'custom';
export const PAGE_SIZE_NAMES = [...Object.keys(PAGE_SIZES), 'custom'] as PageSizeName[];

export const ORIENTATIONS = ['auto', 'portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export type ExportScope = { kind: 'all' } | { kind: 'descendants' | 'ancestors'; memberId: string };

export interface ExportOptions {
  mode: ExportMode;
  pageSize: PageSizeName;
  /** Only with pageSize 'custom'. */
  customWidthMm?: number;
  customHeightMm?: number;
  orientation: Orientation;
  /** Name text size in points when printed at 100%. */
  labelSize: number;
  /** Poster and tiled: print scale in percent. A single page is always fitted. */
  scalePercent: number;
  /** Printable sheets only: the largest scale whose sheet count is at most this (replaces scalePercent). */
  targetSheets?: number;
  /** Optional member details. Only names exist today (R17), so details are reference numbers and generations. */
  showNumbers: boolean;
  showGeneration: boolean;
  /** An alphabetical index of every member, with where to find them. */
  includeIndex: boolean;
  /** The whole tree unless a subtree is explicitly chosen. */
  scope: ExportScope;
}

export const LABEL_SIZE = { min: 5, max: 24, default: 9 } as const;
export const SCALE_PERCENT = { min: 25, max: 400, default: 100 } as const;
export const CUSTOM_MM = { min: 100, max: 5000 } as const;
/** PDF viewers limit a page to 200 × 200 inches (14,400 pt) without UserUnit. */
export const MAX_PAGE_POINTS = 14_400;
export const MM = 72 / 25.4;

export const DEFAULT_OPTIONS: ExportOptions = {
  mode: 'single',
  pageSize: 'A4',
  orientation: 'auto',
  labelSize: LABEL_SIZE.default,
  scalePercent: SCALE_PERCENT.default,
  showNumbers: true,
  showGeneration: false,
  includeIndex: true,
  scope: { kind: 'all' },
};

export type Validation<T> = { ok: true; value: T } | { ok: false; fields: Record<string, string> };

const ALLOWED = ['mode', 'pageSize', 'customWidthMm', 'customHeightMm', 'orientation', 'labelSize', 'scalePercent', 'showNumbers', 'showGeneration', 'includeIndex', 'scope', 'targetSheets'];
export const TARGET_SHEETS = { min: 1, max: 2000 } as const;

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function numberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function validateExportOptions(raw: unknown): Validation<ExportOptions> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: { ...DEFAULT_OPTIONS } };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const body = raw as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (!ALLOWED.includes(key)) {
      fields[key] = 'This field is not accepted.';
    }
  }
  const out: ExportOptions = { ...DEFAULT_OPTIONS };
  if (body.mode !== undefined) {
    if (oneOf(body.mode, EXPORT_MODES)) {
      out.mode = body.mode;
    } else {
      fields.mode = `Choose one of ${EXPORT_MODES.join(', ')}.`;
    }
  }
  if (body.pageSize !== undefined) {
    if (oneOf(body.pageSize, PAGE_SIZE_NAMES)) {
      out.pageSize = body.pageSize;
    } else {
      fields.pageSize = `Choose one of ${PAGE_SIZE_NAMES.join(', ')}.`;
    }
  }
  if (out.pageSize === 'custom') {
    for (const key of ['customWidthMm', 'customHeightMm'] as const) {
      if (numberIn(body[key], CUSTOM_MM.min, CUSTOM_MM.max)) {
        out[key] = Math.round(body[key] * 10) / 10;
      } else {
        fields[key] = `Enter a size from ${CUSTOM_MM.min} to ${CUSTOM_MM.max} mm.`;
      }
    }
    if (out.mode === 'poster') {
      fields.pageSize = 'A poster is sized to the tree; choose a standard size only for single page or tiled.';
    }
  } else {
    for (const key of ['customWidthMm', 'customHeightMm'] as const) {
      if (body[key] !== undefined) {
        fields[key] = 'Only used with a custom page size.';
      }
    }
  }
  if (body.orientation !== undefined) {
    if (oneOf(body.orientation, ORIENTATIONS)) {
      out.orientation = body.orientation;
    } else {
      fields.orientation = `Choose one of ${ORIENTATIONS.join(', ')}.`;
    }
  }
  if (body.labelSize !== undefined) {
    if (numberIn(body.labelSize, LABEL_SIZE.min, LABEL_SIZE.max)) {
      out.labelSize = Math.round(body.labelSize * 2) / 2;
    } else {
      fields.labelSize = `Use a text size from ${LABEL_SIZE.min} to ${LABEL_SIZE.max} pt.`;
    }
  }
  if (body.targetSheets !== undefined) {
    if (out.mode !== 'tiled') {
      fields.targetSheets = 'Only used with printable sheets.';
    } else if (!Number.isInteger(body.targetSheets) || !numberIn(body.targetSheets, TARGET_SHEETS.min, TARGET_SHEETS.max)) {
      fields.targetSheets = `Use a whole number of sheets from ${TARGET_SHEETS.min} to ${TARGET_SHEETS.max}.`;
    } else {
      out.targetSheets = body.targetSheets;
    }
  }
  if (body.scalePercent !== undefined) {
    if (numberIn(body.scalePercent, SCALE_PERCENT.min, SCALE_PERCENT.max) && Number.isInteger(body.scalePercent)) {
      out.scalePercent = body.scalePercent;
    } else {
      fields.scalePercent = `Use a whole percentage from ${SCALE_PERCENT.min} to ${SCALE_PERCENT.max}.`;
    }
  }
  for (const key of ['showNumbers', 'showGeneration', 'includeIndex'] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] === 'boolean') {
        out[key] = body[key];
      } else {
        fields[key] = 'Use true or false.';
      }
    }
  }
  if (body.scope !== undefined) {
    const scope = body.scope as Record<string, unknown> | null;
    if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
      fields.scope = 'Choose the whole tree or a subtree.';
    } else if (scope.kind === 'all' && Object.keys(scope).length === 1) {
      out.scope = { kind: 'all' };
    } else if ((scope.kind === 'descendants' || scope.kind === 'ancestors') && typeof scope.memberId === 'string' && isUuid(scope.memberId) && Object.keys(scope).length === 2) {
      out.scope = { kind: scope.kind, memberId: scope.memberId };
    } else {
      fields.scope = 'Choose the whole tree, or the ancestors or descendants of one member.';
    }
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: out };
}

/** Portrait sheet dimensions in points for the chosen size. */
export function sheetSize(options: Pick<ExportOptions, 'pageSize' | 'customWidthMm' | 'customHeightMm'>): [number, number] {
  if (options.pageSize === 'custom') {
    const w = options.customWidthMm! * MM;
    const h = options.customHeightMm! * MM;
    return [Math.min(w, h), Math.max(w, h)];
  }
  const [w, h] = PAGE_SIZES[options.pageSize];
  return [w, h];
}

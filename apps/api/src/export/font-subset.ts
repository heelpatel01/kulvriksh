import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Font subsetting with HarfBuzz's hb-subset (shipped in harfbuzzjs as a standalone WebAssembly
// module with no imports). Only the glyphs a PDF uses are embedded. Glyph ids are retained, so the
// PDF can address glyphs by their original id (CIDToGIDMap /Identity).

const HB_MEMORY_MODE_DUPLICATE = 0;
const HB_SUBSET_FLAGS_RETAIN_GIDS = 0x2;
const HB_SUBSET_FLAGS_NO_HINTING = 0x1;

// Minimal typing: the project's TypeScript setup has no DOM/WebAssembly lib types.
interface WasmApi {
  Module: new (bytes: Uint8Array) => object;
  Instance: new (module: object, imports: object) => { exports: unknown };
}
const Wasm = (globalThis as unknown as { WebAssembly: WasmApi }).WebAssembly;

interface SubsetExports {
  memory: { buffer: ArrayBuffer };
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(data: number, length: number, mode: number, user: number, destroy: number): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, lengthPtr: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_glyph_set(input: number): number;
  hb_subset_input_set_flags(input: number, flags: number): void;
  hb_set_add(set: number, value: number): void;
  hb_subset_or_fail(face: number, input: number): number;
}

let wasm: SubsetExports | undefined;

function subsetter(): SubsetExports {
  if (!wasm) {
    const path = createRequire(import.meta.url).resolve('harfbuzzjs/dist/harfbuzz-subset.wasm');
    wasm = new Wasm.Instance(new Wasm.Module(readFileSync(path)), {}).exports as SubsetExports;
  }
  return wasm;
}

/** A TrueType font containing only `gids` (plus .notdef and composite components), ids unchanged. */
export function subsetFont(font: Uint8Array, gids: Iterable<number>): Buffer {
  const hb = subsetter();
  const fontPtr = hb.malloc(font.byteLength);
  new Uint8Array(hb.memory.buffer, fontPtr, font.byteLength).set(font);
  const blob = hb.hb_blob_create(fontPtr, font.byteLength, HB_MEMORY_MODE_DUPLICATE, 0, 0);
  hb.free(fontPtr);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  const input = hb.hb_subset_input_create_or_fail();
  if (!input) {
    hb.hb_face_destroy(face);
    throw new Error('font subset: out of memory');
  }
  hb.hb_subset_input_set_flags(input, HB_SUBSET_FLAGS_RETAIN_GIDS | HB_SUBSET_FLAGS_NO_HINTING);
  const set = hb.hb_subset_input_glyph_set(input);
  hb.hb_set_add(set, 0);
  for (const gid of gids) {
    hb.hb_set_add(set, gid);
  }
  const subset = hb.hb_subset_or_fail(face, input);
  hb.hb_subset_input_destroy(input);
  hb.hb_face_destroy(face);
  if (!subset) {
    throw new Error('font subset failed');
  }
  const out = hb.hb_face_reference_blob(subset);
  const lengthPtr = hb.malloc(4);
  const dataPtr = hb.hb_blob_get_data(out, lengthPtr);
  const length = new Uint32Array(hb.memory.buffer, lengthPtr, 1)[0]!;
  const bytes = Buffer.from(new Uint8Array(hb.memory.buffer, dataPtr, length));
  hb.free(lengthPtr);
  hb.hb_blob_destroy(out);
  hb.hb_face_destroy(subset);
  if (length < 12) {
    throw new Error('font subset produced an empty font');
  }
  return bytes;
}

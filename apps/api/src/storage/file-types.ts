// Content-signature detection (Flows §7.1): the type comes from the file's first bytes, never from
// its name or the client's Content-Type. Which formats are allowed is R23's decision, so the list
// is configuration (MEDIA_ALLOWED_TYPES); detection covers every candidate format.

export type MediaKind = 'photo' | 'document' | 'voice';

interface Signature {
  type: string;
  kind: MediaKind;
  matches(head: Buffer): boolean;
}

const ascii = (head: Buffer, offset: number, text: string) => head.subarray(offset, offset + text.length).toString('latin1') === text;

const SIGNATURES: readonly Signature[] = [
  { type: 'image/jpeg', kind: 'photo', matches: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  { type: 'image/png', kind: 'photo', matches: (h) => ascii(h, 0, '\x89PNG\r\n\x1a\n') },
  { type: 'image/webp', kind: 'photo', matches: (h) => ascii(h, 0, 'RIFF') && ascii(h, 8, 'WEBP') },
  { type: 'application/pdf', kind: 'document', matches: (h) => ascii(h, 0, '%PDF-') },
  { type: 'audio/mpeg', kind: 'voice', matches: (h) => ascii(h, 0, 'ID3') || (h[0] === 0xff && ((h[1] ?? 0) & 0xe0) === 0xe0) },
  { type: 'audio/ogg', kind: 'voice', matches: (h) => ascii(h, 0, 'OggS') },
  { type: 'audio/wav', kind: 'voice', matches: (h) => ascii(h, 0, 'RIFF') && ascii(h, 8, 'WAVE') },
  { type: 'audio/mp4', kind: 'voice', matches: (h) => ascii(h, 4, 'ftypM4A') },
];

export const DETECTABLE_TYPES = SIGNATURES.map((s) => s.type);

export function detectType(head: Buffer): { type: string; kind: MediaKind } | undefined {
  const match = SIGNATURES.find((s) => s.matches(head));
  return match ? { type: match.type, kind: match.kind } : undefined;
}

/**
 * Display-only file name: path parts, control characters and quotes removed, length bounded. It is
 * never used to build a path (DM §7.5).
 */
export function sanitiseFilename(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // keep the raw value; it is sanitised below either way
  }
  const base = decoded.split(/[\\/]/).pop() ?? '';
  // Drop control characters (code points below 32 and DEL) and characters unsafe in file names.
  const clean = [...base]
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127 && !'"<>|*?:'.includes(ch))
    .join('')
    .trim()
    .slice(0, 255);
  return clean === '' || clean === '.' || clean === '..' ? null : clean;
}

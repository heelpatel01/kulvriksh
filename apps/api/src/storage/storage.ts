import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Storage abstraction (Roadmap Phase 2, DM §7.4). Bytes live behind a provider; the database holds
// only a server-generated key. Uploads stream to a temporary area first and are committed only
// when complete, so an interrupted upload leaves no row and no object (AS-MED-04).
//
// Only the local private-disk adapter exists: no object-storage provider or credentials are
// configured. A cloud adapter implements the same interface.

export interface TempUpload {
  readonly id: string;
  readonly byteSize: number;
  readonly sha256: string;
  /** The first bytes, for content-signature detection. */
  readonly head: Buffer;
}

export class UploadTooLargeError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`upload exceeds ${limit} bytes`);
    this.name = 'UploadTooLargeError';
    this.limit = limit;
  }
}

export interface StorageProvider {
  readonly backend: string;
  /** Streams to the temporary area, aborting as soon as `maxBytes` is exceeded. */
  writeTemp(source: Readable, maxBytes: number): Promise<TempUpload>;
  /** Moves a complete temporary upload to its permanent key. */
  commit(temp: TempUpload, key: string): Promise<void>;
  discardTemp(temp: TempUpload): Promise<void>;
  open(key: string): Promise<{ stream: Readable; byteSize: number }>;
  /** Idempotent: deleting a missing object succeeds. */
  delete(key: string): Promise<void>;
  /** Removes temporary uploads older than `olderThanMs` (abandoned or crashed uploads). */
  sweepTemp(olderThanMs: number): Promise<number>;
}

const KEY = /^[a-z0-9/_-]{8,200}$/;
const TEMP_ID = /^[a-f0-9]{32}$/;
const HEAD_BYTES = 64;

/** A new random key, sharded in two levels so no directory grows too large. */
export function newStorageKey(kind: string): string {
  const id = randomBytes(16).toString('hex');
  return `${kind}/${id.slice(0, 2)}/${id}`;
}

export class LocalDiskStorage implements StorageProvider {
  readonly backend = 'local';
  readonly #objects: string;
  readonly #temp: string;

  constructor(root: string) {
    this.#objects = resolve(root, 'objects');
    this.#temp = resolve(root, 'tmp');
  }

  /** Keys are server-generated, but the path is still checked to stay inside the store. */
  #objectPath(key: string): string {
    if (!KEY.test(key) || key.includes('..')) {
      throw new Error('invalid storage key');
    }
    const path = resolve(this.#objects, ...key.split('/'));
    if (!path.startsWith(this.#objects + sep)) {
      throw new Error('invalid storage key');
    }
    return path;
  }

  #tempPath(id: string): string {
    if (!TEMP_ID.test(id)) {
      throw new Error('invalid temporary id');
    }
    return join(this.#temp, id);
  }

  async writeTemp(source: Readable, maxBytes: number): Promise<TempUpload> {
    await mkdir(this.#temp, { recursive: true });
    const id = randomBytes(16).toString('hex');
    const path = this.#tempPath(id);
    const hash = createHash('sha256');
    const head: Buffer[] = [];
    let byteSize = 0;
    let headSize = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        byteSize += chunk.length;
        if (byteSize > maxBytes) {
          done(new UploadTooLargeError(maxBytes));
          return;
        }
        if (headSize < HEAD_BYTES) {
          head.push(chunk.subarray(0, HEAD_BYTES - headSize));
          headSize += Math.min(chunk.length, HEAD_BYTES - headSize);
        }
        hash.update(chunk);
        done(null, chunk);
      },
    });
    try {
      await pipeline(source, meter, createWriteStream(path, { flags: 'wx', mode: 0o600 }));
    } catch (err) {
      await rm(path, { force: true });
      throw err;
    }
    return { id, byteSize, sha256: hash.digest('hex'), head: Buffer.concat(head) };
  }

  async commit(temp: TempUpload, key: string): Promise<void> {
    const target = this.#objectPath(key);
    await mkdir(dirname(target), { recursive: true });
    await rename(this.#tempPath(temp.id), target);
  }

  async discardTemp(temp: TempUpload): Promise<void> {
    await rm(this.#tempPath(temp.id), { force: true });
  }

  async open(key: string): Promise<{ stream: Readable; byteSize: number }> {
    const path = this.#objectPath(key);
    const info = await stat(path);
    return { stream: createReadStream(path), byteSize: info.size };
  }

  async delete(key: string): Promise<void> {
    await rm(this.#objectPath(key), { force: true });
  }

  async sweepTemp(olderThanMs: number): Promise<number> {
    let removed = 0;
    let names: string[];
    try {
      names = await readdir(this.#temp);
    } catch {
      return 0;
    }
    const cutoff = Date.now() - olderThanMs;
    for (const name of names) {
      if (!TEMP_ID.test(name)) {
        continue;
      }
      const path = join(this.#temp, name);
      const info = await stat(path).catch(() => undefined);
      if (info && info.mtimeMs < cutoff) {
        await rm(path, { force: true });
        removed += 1;
      }
    }
    return removed;
  }
}

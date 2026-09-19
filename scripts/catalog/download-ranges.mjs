import { createWriteStream } from 'node:fs';
import { mkdir, stat, readFile, appendFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function fileSize(path) {
  try { return (await stat(path)).size; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Three bounded requests, durable prefixes and final whole-file verification by the caller. */
export async function downloadRanges(action, partial, directory, offset, total) {
  const chunksDirectory = join(directory, 'download-chunks');
  await mkdir(chunksDirectory, { recursive: true });
  const ranges = [];
  for (let start = offset; start < total; start += 8 * 1024 * 1024) {
    const end = Math.min(total - 1, start + 8 * 1024 * 1024 - 1);
    ranges.push({ start, end, path: join(chunksDirectory, `${start}-${end}.part`) });
  }
  const controller = new AbortController();
  let next = 0;
  let completedBytes = offset;
  async function worker() {
    while (next < ranges.length) {
      const range = ranges[next++];
      const saved = await fileSize(range.path) ?? 0;
      const size = range.end - range.start + 1;
      if (saved > size) throw new Error('Oversized range file; inspect it before retrying.');
      if (saved < size) {
        const start = range.start + saved;
        const response = await fetch(action.href, {
          headers: { ...action.header, 'Accept-Encoding': 'identity', Range: `bytes=${start}-${range.end}` },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(1800000)]),
        });
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
        // The host sometimes reports remaining length as total. Check actual
        // boundaries and length; the final pinned SHA256 is still mandatory.
        if (response.status !== 206 || !match || Number(match[1]) !== start || Number(match[2]) !== range.end ||
            Number(response.headers.get('content-length')) !== size - saved) {
          await response.body?.cancel();
          throw new Error(`Unexpected range response (HTTP ${response.status}); files preserved.`);
        }
        let received = saved;
        const limit = new Transform({ transform(chunk, _encoding, callback) {
          received += chunk.length;
          callback(received > size ? new Error('Range body exceeds expected length.') : null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(range.path, { flags: saved ? 'a' : 'w' }));
        if (await fileSize(range.path) !== size) throw new Error('Incomplete range; files preserved.');
      }
      completedBytes += size;
      console.log(`${(100 * completedBytes / total).toFixed(1)}% downloaded (${completedBytes} bytes)`);
    }
  }
  const workers = Array.from({ length: 3 }, () => worker().catch(error => { controller.abort(); throw error; }));
  const results = await Promise.allSettled(workers);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  for (const range of ranges) {
    if (await fileSize(partial) !== range.start) throw new Error('Partial archive changed during download.');
    await appendFile(partial, await readFile(range.path)); // At most 8 MiB in memory.
  }
  return async () => { for (const range of ranges) await unlink(range.path); };
}

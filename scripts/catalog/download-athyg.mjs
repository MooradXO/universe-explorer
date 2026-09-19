import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ATHYG_SOURCE as source, CATALOG_DIRECTORY } from './athyg-source.mjs';
import { verifyArchive } from './integrity.mjs';
import { downloadRanges, fileSize } from './download-ranges.mjs';

async function download() {
  await mkdir(CATALOG_DIRECTORY, { recursive: true });
  const complete = join(CATALOG_DIRECTORY, 'athyg_40.csv.gz');
  const partial = `${complete}.partial`;
  if (await fileSize(complete) !== null) {
    await verifyArchive(complete, source);
    console.log('AT-HYG 4.0 already complete; SHA256 verified.');
    return;
  }
  const offset = await fileSize(partial) ?? 0;
  if (offset > source.archiveBytes) throw new Error('Partial archive is larger than the pinned source; inspect before retrying.');
  let cleanChunks = async () => {};
  if (offset < source.archiveBytes) {
    const batch = await fetch(`${source.repository}.git/info/lfs/objects/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.git-lfs+json', Accept: 'application/vnd.git-lfs+json' },
      body: JSON.stringify({ operation: 'download', transfers: ['basic'], objects: [{ oid: source.archiveSha256, size: source.archiveBytes }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!batch.ok) throw new Error(`LFS batch HTTP ${batch.status}`);
    const object = (await batch.json()).objects?.[0];
    const action = object?.actions?.download;
    if (object?.oid !== source.archiveSha256 || !action?.href || new URL(action.href).protocol !== 'https:') {
      throw new Error('Unexpected LFS download response.');
    }
    // Signed URLs and action headers stay in memory, never in logs or manifests.
    if (await fileSize(partial) === null) await writeFile(partial, '', { flag: 'wx' });
    console.log(`Downloading AT-HYG 4.0 from byte ${offset} / ${source.archiveBytes} (3 connections)`);
    cleanChunks = await downloadRanges(action, partial, CATALOG_DIRECTORY, offset, source.archiveBytes);
  }
  const verified = await verifyArchive(partial, source);
  await rename(partial, complete);
  await cleanChunks();
  console.log(`AT-HYG 4.0 complete: ${verified.bytes} bytes; SHA256 verified.`);
}

download().catch(error => { console.error(error.message); process.exitCode = 1; });

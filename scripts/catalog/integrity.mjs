import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyArchive(path, source) {
  const { size } = await stat(path);
  if (size !== source.archiveBytes) throw new Error(`Archive size mismatch: ${size}, expected ${source.archiveBytes}`);
  const sha256 = await hashFile(path);
  if (sha256 !== source.archiveSha256) throw new Error('Archive SHA256 mismatch; the input has not been accepted.');
  return { bytes: size, sha256 };
}

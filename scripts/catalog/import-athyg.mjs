import { createReadStream } from 'node:fs';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ATHYG_FIELDS, normalizeAthygRow, validateAthygHeader } from '../../src/catalog/adapters/AthygRecord.ts';
import { ATHYG_SOURCE, CATALOG_DIRECTORY } from './athyg-source.mjs';
import { hashFile, verifyArchive } from './integrity.mjs';
import { readCsv } from './csv.mjs';
import { createCatalogStore } from './catalog-store.mjs';
import { createReport, countAccepted, countRejected, sourceManifest } from './catalog-report.mjs';

export async function importAthyg({ input, output, source = ATHYG_SOURCE, onProgress = () => {} }) {
  const started = performance.now();
  const inputIntegrity = await verifyArchive(input, source);
  // Never overwrite an earlier import, including failed/incomplete work.
  await mkdir(output);
  const incomplete = join(output, 'INCOMPLETE');
  await writeFile(incomplete, 'Import in progress. Only manifest.json with status=complete marks a valid result.\n');
  const databasePath = join(output, 'catalog.sqlite');
  const store = createCatalogStore(databasePath);
  const report = createReport(source);
  const digest = createHash('sha256');
  const rejectedDigest = createHash('sha256');
  const decoded = createGunzip();
  decoded.setEncoding('utf8');
  const pumping = pipeline(createReadStream(input), decoded);
  pumping.catch(() => {}); // Awaited below, including on parser failure.
  let header = false;
  try {
    for await (const fields of readCsv(decoded)) {
      if (!header) { validateAthygHeader(fields); header = true; continue; }
      const rowNumber = ++report.inputRows;
      const raw = fields.length === ATHYG_FIELDS.length
        ? Object.fromEntries(ATHYG_FIELDS.map((field, index) => [field, fields[index]]))
        : fields;
      const rawJson = JSON.stringify(raw);
      const result = Array.isArray(raw) ? { accepted: false, reason: 'column-count-mismatch' } : normalizeAthygRow(raw);
      let rejection = result.accepted ? null : result.reason;
      if (result.accepted) {
        const json = JSON.stringify(result.record);
        if (store.add(rowNumber, result.record, json, rawJson)) {
          countAccepted(report, result.record, raw);
          digest.update(json + '\n');
        } else rejection = 'duplicate-primary-id';
      }
      if (rejection) {
        store.reject(rowNumber, rejection, rawJson);
        countRejected(report, rejection);
        rejectedDigest.update(JSON.stringify({ rowNumber, reason: rejection, raw }) + '\n');
      }
      if (rowNumber % 10000 === 0) store.checkpoint();
      if (rowNumber % 100000 === 0) onProgress({ inputRows: rowNumber, acceptedRows: report.acceptedRows });
    }
    await pumping; // Includes the gzip CRC/trailer check.
    if (!header || !report.inputRows) throw new Error('Catalogue contains no data rows.');
    if (report.inputRows !== report.acceptedRows + report.rejectedRows) throw new Error('Row accounting mismatch.');
    report.identityCollisions = store.finish();
  } catch (error) {
    decoded.destroy();
    await pumping.catch(() => {});
    await writeFile(join(output, 'failure.json'), JSON.stringify({ status: 'failed', inputRows: report.inputRows, reason: error.message }, null, 2) + '\n');
    throw error;
  } finally { store.close(); }

  report.datasetSha256 = digest.digest('hex');
  report.rejectedRowsSha256 = rejectedDigest.digest('hex');
  report.inputIntegrity = inputIntegrity;
  report.database = { file: 'catalog.sqlite', bytes: (await stat(databasePath)).size, sha256: await hashFile(databasePath) };
  report.elapsedSeconds = Number(((performance.now() - started) / 1000).toFixed(3));
  report.peakRssBytes = process.resourceUsage().maxRSS * 1024;
  const metadata = sourceManifest(source);
  await writeFile(join(output, 'source-manifest.json'), JSON.stringify(metadata, null, 2) + '\n');
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(output, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, status: 'complete', importerVersion: 'athyg-normalized-v1',
    recordSchemaVersion: 1, datasetSha256: report.datasetSha256,
    inputRows: report.inputRows, acceptedRows: report.acceptedRows, rejectedRows: report.rejectedRows,
    database: report.database, sourceManifest: 'source-manifest.json', report: 'report.json',
  }, null, 2) + '\n');
  await unlink(incomplete);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && !(args.length === 2 && args[0] === '--output')) {
    console.error('Usage: node scripts/catalog/import-athyg.mjs [--output <new-directory>]');
    process.exitCode = 1;
  } else {
    importAthyg({
      input: join(CATALOG_DIRECTORY, 'athyg_40.csv.gz'),
      output: args.length ? resolve(args[1]) : join(CATALOG_DIRECTORY, 'prepared-v1'),
      onProgress: progress => console.log(`Imported ${progress.inputRows} rows`),
    }).then(report => console.log(JSON.stringify(report, null, 2)))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}

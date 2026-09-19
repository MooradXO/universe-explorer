import { readFile, access, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { CATALOG_DIRECTORY } from './athyg-source.mjs';
import { hashFile } from './integrity.mjs';

function check(condition, message) { if (!condition) throw new Error(message); }

export async function verifyPrepared(directory) {
  try { await access(join(directory, 'INCOMPLETE')); throw new Error('Import is incomplete.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
  check(manifest.status === 'complete' && manifest.schemaVersion === 1, 'Unknown or incomplete manifest.');
  check(manifest.database.file === 'catalog.sqlite', 'Unexpected database path.');
  const path = join(directory, 'catalog.sqlite');
  check((await stat(path)).size === manifest.database.bytes, 'Prepared database size mismatch.');
  check(await hashFile(path) === manifest.database.sha256, 'Prepared database SHA256 mismatch.');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    check(db.prepare('PRAGMA quick_check').get().quick_check === 'ok', 'SQLite integrity failed.');
    const total = db.prepare('SELECT count(*) AS n FROM objects').get().n;
    const rejected = db.prepare('SELECT count(*) AS n FROM rejected_rows').get().n;
    check(total === manifest.acceptedRows && rejected === manifest.rejectedRows && total + rejected === manifest.inputRows, 'Stored row counts differ from manifest.');
    check(report.inputRows === manifest.inputRows && report.acceptedRows === total && report.rejectedRows === rejected, 'Report row counts differ from manifest.');
    const positionCounts = db.prepare('SELECT position_status AS status, count(*) AS n FROM objects GROUP BY position_status').all();
    for (const status of ['available', 'missing', 'invalid']) {
      check((positionCounts.find(row => row.status === status)?.n ?? 0) === report.position3d[status], 'Position counts differ from report.');
    }
    const misplaced = db.prepare(`SELECT count(*) AS n FROM objects WHERE
      (position_status='available' AND (x_pc IS NULL OR y_pc IS NULL OR z_pc IS NULL)) OR
      (position_status!='available' AND (x_pc IS NOT NULL OR y_pc IS NOT NULL OR z_pc IS NOT NULL))`).get().n;
    check(misplaced === 0, 'Invalid rows have been given renderable coordinates.');
    const alteredIds = db.prepare(`SELECT count(*) AS n FROM objects WHERE gaia_dr3_id IS NOT NULL AND
      (typeof(gaia_dr3_id)!='text' OR gaia_dr3_id != trim(json_extract(raw_json, '$.gaia')))` ).get().n;
    check(alteredIds === 0, 'Gaia IDs differ from original source strings.');

    const digest = createHash('sha256');
    let sampledRows = 0;
    let maxAngularPositionResidualPc = 0;
    for (const row of db.prepare('SELECT row_number, record_json FROM objects ORDER BY row_number').iterate()) {
      digest.update(row.record_json + '\n');
      if (row.row_number > 100 && row.row_number % 10000 !== 0) continue;
      const record = JSON.parse(row.record_json);
      check(typeof record.source.value === 'string' && record.identifiers.every(id => typeof id.value === 'string'), 'Non-string catalogue ID.');
      check(record.id === `athyg:4.0:${record.source.value}`, 'Object identity differs from its source.');
      const p = record.position;
      if (p.cartesianParsecs) {
        check(p.cartesianParsecs.every(Number.isFinite) && Number.isFinite(p.distanceParsecs), 'Non-finite position.');
        // Independent spherical conversion checks axes and RA units on a spread
        // of source rows. This check does not assess measurement uncertainty.
        const ra = p.raHours * Math.PI / 12;
        const dec = p.decDegrees * Math.PI / 180;
        const expected = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)].map(v => v * p.distanceParsecs);
        const residual = Math.hypot(...expected.map((v, index) => v - p.cartesianParsecs[index]));
        maxAngularPositionResidualPc = Math.max(maxAngularPositionResidualPc, residual);
        check(residual <= Math.max(0.002, p.distanceParsecs * 1e-5), 'Spherical and Cartesian positions disagree beyond rounding tolerance.');
      }
      sampledRows++;
    }
    const datasetSha256 = digest.digest('hex');
    check(datasetSha256 === manifest.datasetSha256 && datasetSha256 === report.datasetSha256, 'Canonical record digest mismatch.');
    const rejectedDigest = createHash('sha256');
    for (const row of db.prepare('SELECT * FROM rejected_rows ORDER BY row_number').iterate()) {
      rejectedDigest.update(JSON.stringify({ rowNumber: row.row_number, reason: row.reason, raw: JSON.parse(row.raw_json) }) + '\n');
    }
    check(rejectedDigest.digest('hex') === report.rejectedRowsSha256, 'Rejected-row digest mismatch.');
    return { status: 'pass', inputRows: total + rejected, acceptedRows: total, rejectedRows: rejected,
      datasetSha256, allGaiaIdsPreserved: true, sampledRows, maxAngularPositionResidualPc };
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length > 1) { console.error('Usage: node scripts/catalog/verify-athyg.mjs [prepared-directory]'); process.exitCode = 1; }
  else {
    const directory = args.length ? resolve(args[0]) : join(CATALOG_DIRECTORY, 'prepared-v1');
    verifyPrepared(directory).then(async result => {
      await writeFile(join(directory, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
      console.log(JSON.stringify(result, null, 2));
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}

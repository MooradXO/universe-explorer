import { DatabaseSync } from 'node:sqlite';

/** Offline staging store. SQLite is bundled with Node 24; no browser dependency. */
export function createCatalogStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=DELETE;
    PRAGMA synchronous=NORMAL;
    PRAGMA cache_size=-32768;
    PRAGMA temp_store=MEMORY;
    PRAGMA user_version=1;
    CREATE TABLE objects (
      row_number INTEGER PRIMARY KEY,
      catalog_id TEXT NOT NULL UNIQUE,
      gaia_dr3_id TEXT,
      tycho2_id TEXT,
      hipparcos_id TEXT,
      name TEXT,
      position_status TEXT NOT NULL,
      x_pc REAL, y_pc REAL, z_pc REAL,
      record_json TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );
    CREATE TABLE rejected_rows (
      row_number INTEGER PRIMARY KEY,
      reason TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );
    BEGIN;
  `);
  const insert = db.prepare(`INSERT INTO objects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(catalog_id) DO NOTHING`);
  const reject = db.prepare('INSERT INTO rejected_rows VALUES (?, ?, ?)');
  const sourceId = (record, catalog) => record.identifiers.find(id => id.catalog === catalog)?.value ?? null;
  return {
    add(rowNumber, record, recordJson, rawJson) {
      const xyz = record.position.cartesianParsecs ?? [null, null, null];
      return insert.run(rowNumber, record.id, sourceId(record, 'gaia'), sourceId(record, 'tycho'),
        sourceId(record, 'hipparcos'), record.names[0] ?? null, record.quality.position3d,
        ...xyz, recordJson, rawJson).changes === 1;
    },
    reject(rowNumber, reason, rawJson) { reject.run(rowNumber, reason, rawJson); },
    checkpoint() { db.exec('COMMIT; BEGIN;'); },
    finish() {
      db.exec(`COMMIT;
        CREATE INDEX gaia_identity ON objects(gaia_dr3_id) WHERE gaia_dr3_id IS NOT NULL;
        CREATE INDEX tycho_identity ON objects(tycho2_id) WHERE tycho2_id IS NOT NULL;
        CREATE INDEX named_objects ON objects(name) WHERE name IS NOT NULL;
      `);
      const duplicateSummary = {};
      for (const [namespace, column] of [['gaia:DR3', 'gaia_dr3_id'], ['tycho:2', 'tycho2_id']]) {
        const query = `SELECT ${column} AS value, count(*) AS matches FROM objects
          WHERE ${column} IS NOT NULL GROUP BY ${column} HAVING count(*) > 1`;
        duplicateSummary[namespace] = {
          ...db.prepare(`SELECT count(*) AS identifiers, coalesce(sum(matches), 0) AS records FROM (${query})`).get(),
          examples: db.prepare(`${query} ORDER BY value LIMIT 20`).all(),
        };
      }
      const integrity = db.prepare('PRAGMA quick_check').get().quick_check;
      if (integrity !== 'ok') throw new Error('SQLite integrity check failed.');
      return duplicateSummary;
    },
    close() { db.close(); },
  };
}

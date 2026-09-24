# Star catalogue pipeline

AT-HYG 4.0 supplies local search and the streamed 3D star map. Gaia DR3, SIMBAD and NASA/IPAC NED add observations only on explicit request. SQLite is never downloaded into the browser.

## Preparation

Use Node.js 24.19+ with built-in SQLite, TypeScript execution and system certificates.

```sh
npm run catalog:download
npm run catalog:import
npm run catalog:verify
npm run catalog:map
node scripts/catalog/verify-map.mjs
```

Without npm, run the corresponding scripts/catalog/*.mjs files with Node; downloading uses --use-system-ca. Never disable TLS verification.

Default data is outside the repository at ../.catalog-research/athyg-4.0/.

| Artifact | Contents |
| --- | --- |
| athyg_40.csv.gz | Verified source |
| prepared-v1/catalog.sqlite | Normalized records, raw fields and rejected rows |
| prepared-v1/source-manifest.json | Pinned provenance, units and terms |
| prepared-v1/report.json | Accounting, errors, ID collisions, sizes and hashes |
| prepared-v1/manifest.json | Completion marker and artifact references |
| prepared-v1/verification.json | Independent verification |
| map-v1/search.sqlite | Searchable object cards |
| map-v1/manifest.json and tiles/ | Adaptive octree and compressed blocks |

Repeated imports/exports require a fresh destination. Existing outputs are not silently overwritten.

```sh
node scripts/catalog/import-athyg.mjs --output ../.catalog-research/athyg-4.0/prepared-v1-repeat
node scripts/catalog/verify-athyg.mjs ../.catalog-research/athyg-4.0/prepared-v1-repeat
```

## Integrity and recovery

Pinned upstream commit: eebe42b3552ae04e67d27ae085a8aad997b42bc0. Source: 199,688,001 bytes; SHA256 69ad04dd33d7c7bb4f5e1b4682798075811547ea9fb8d0e802e5b319c46818a6.

The Git LFS downloader uses up to three connections and chunks at most 8 MiB. Signed URLs/headers are not retained. Partial chunks allow resumption; final naming requires the full pinned checksum. Range endpoints and lengths are checked despite a previously observed incorrect upstream Content-Range denominator.

Import verifies the source and gzip CRC, streams CSV and accounts for every row. INCOMPLETE and failure.json identify unfinished output; retry into another directory. The verifier checks SQLite integrity, file SHA256, accepted/rejected rows, absent XYZ, original Gaia IDs and canonical record hashes. It independently recomputes RA/Dec-to-XYZ on the first 100 and each 10,000th row. Canonical hashes exclude timestamps, memory and SQLite layout.

## Coordinates and identifiers

- Internal IDs: athyg:4.0:<id>, stable within this release. Future versions require mapping.
- Gaia IDs remain strings with a DR3 identifier release. Distance/position/velocity source fields are independent.
- Equinox: J2000.0. Individual measurement epoch is unavailable and stays null.
- Positions: parsecs; XYZ velocities: km/s; proper motions: mas/year. Import does not apply flight scale or force the source Sun to zero.
- Missing/invalid XYZ remains null with a reason; the record stays searchable. Invalid required IDs, row lengths and duplicate primary IDs go to rejected_rows.
- Numeric length tolerance is max(0.001 pc, distance × 1e-6), not an astronomical accuracy estimate.
- Gaia/Tycho collisions remain separate. Inherited component distances and velocities inferred without radial velocity are flagged. Different photometric bands are preserved.
- Unknown distances never receive invented 3D locations.

References: [processing notes](https://codeberg.org/astronexus/athyg/src/commit/eebe42b3552ae04e67d27ae085a8aad997b42bc0/STEPS_V4.txt), [column definitions](https://codeberg.org/astronexus/brahe/src/commit/50348755083917388f6a0a8e3275011d1bdc3740/consts.go).

## Map data and budgets

The prepared snapshot has 2,558,654 cards and 2,533,349 positions. Search DB: 1,486,831,616 bytes; 2,622-node manifest: 442,711 bytes; compressed tiles: 57,310,346 bytes.

Parents contain deterministic samples of up to 512 points; leaves contain all positions without duplication. Tile header: 16 bytes, UXST magic, version 1, count and stride 24. Records: centre-relative Float32 XYZ, magnitude, colour index and Uint32 AT-HYG ID. Gaia IDs are never converted to numbers.

Tile verification compares IDs/XYZ against the source. Maximum measured leaf-axis rounding was approximately 0.0149 pc for distant objects: display precision, not scientific uncertainty. Cards/centring use original higher-precision XYZ.

The browser allows two concurrent requests. HIGH/LOW: 32/20 active blocks, 90,000/45,000 points, 80/48 cached blocks. Existing data stays until replacements are ready; close cancels requests and releases render resources/listeners. Map input blocks the ship while world simulation continues. Distances are linear, while point size/colour are illustrative.

## Endpoints and hosting

Vite supplies the local read-only bridge. Production uses scripts/server/catalog-server.mjs behind Nginx. Static dist alone does not supply the API.

- GET /__catalog/manifest
- GET /__catalog/tiles/<key>
- GET /__catalog/search?q=...
- GET /__catalog/objects/<internal-id>
- GET /__catalog/online?source=gaia|simbad|ned&q=...
- GET /__catalog/enrich/<AT-HYG-id>

Search returns up to 20 cards and supports names/prefixes plus AT-HYG, Gaia DR3, TYC, HIP, HD, HR and GJ IDs. A Gaia ID may return several components. Unavailable map data yields 503 with UI retry. Current game travel supports catalogue stars with known positions; remote observations do not create new spatial destinations.

## Explicit remote lookups

Examples: Gaia DR3 5853498713190525696, SIMBAD Sirius/NGC 7000, NED M31. Typing, selection changes and the render loop do not automatically contact scientific services.

Cache: 32 MiB including temporary writes; response: 512 KiB; one outgoing request; queue of eight distinct URLs; identical requests coalesced. NED spacing: at least 1.1 seconds after the prior response. Timeout: 35 seconds. No bulk harvesting or unbounded retries.

Snapshots last 30 days. Failed refresh can display dated cached data; otherwise the source is marked unavailable while local map/flight continue. Provenance retains query URL, UTC time, SHA256, raw response, units and bibliography. DTD, VOTable error/overflow and malformed rows are rejected.

Gaia parallax/error and quality stay separate; negative parallax is not inverted. SIMBAD preserves names/types/bibliography with an explicit 256-name limit. NED preserves redshift, distance estimates/errors and model parameters. Different sources and Gaia releases are not merged into unattributed values.

## Modules and terms

src/catalog/CatalogTypes.ts and adapters normalize independently of Three.js. scripts/catalog provides download/SQLite/parsing/cache. OnlineCatalogClient and star-map UI display observations.

AT-HYG: David Nash / Astronomy Nexus; [acknowledgments](https://codeberg.org/astronexus/athyg/src/commit/eebe42b3552ae04e67d27ae085a8aad997b42bc0/ACKNOWLEDGMENTS.md). Data terms differ from the MIT code license. [Third-party notices](../THIRD_PARTY_NOTICES.md) retain attribution and the outstanding commercial-use question.

[Deployment](DEPLOYMENT.md) · [Import report](phases_archive/catalog-import-2026-09-15/README.md)

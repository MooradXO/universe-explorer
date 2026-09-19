import { fileURLToPath } from 'node:url';

// Pin both the upstream revision and the LFS content, never import a moving branch.
export const ATHYG_SOURCE = Object.freeze({
  catalog: 'AT-HYG',
  release: '4.0',
  repository: 'https://codeberg.org/astronexus/athyg',
  commit: 'eebe42b3552ae04e67d27ae085a8aad997b42bc0',
  path: 'data/athyg_40.csv.gz',
  archiveBytes: 199688001,
  archiveSha256: '69ad04dd33d7c7bb4f5e1b4682798075811547ea9fb8d0e802e5b319c46818a6',
  declaredLicense: 'CC-BY-SA-4.0',
  upstreamGaiaLicense: 'CC-BY-NC-3.0-IGO',
  commercialPermission: 'not-obtained',
});

export const CATALOG_DIRECTORY = fileURLToPath(new URL('../../../.catalog-research/athyg-4.0/', import.meta.url));

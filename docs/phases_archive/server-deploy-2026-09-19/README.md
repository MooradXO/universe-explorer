# Initial catalogue-service deployment

Installed a dedicated client/catalogue release, verified catalogue data and an isolated Node 24.19 runtime. The catalogue service listens on loopback 4312 behind only the Universe Nginx host. It does not replace system Node or other services. Passed 68 unit tests, build/types/guard, archive/file SHA checks (248 release files and 2,624 catalogue files), health/search/card/tile checks and one-result Gaia/SIMBAD/NED requests. HIGH/LOW staged journeys passed. Ten neighbouring Nginx configuration hashes and existing PM2 identities were preserved; one unrelated Docker container independently changed during observation, and that external change was not reverted. A cold-map early-selection race was recorded and addressed in later work. Initial backup: /var/backups/universe-explorer/2026-09-19/.

## Historical scope

This report records the implementation on the date in its directory name. Later stages may supersede its UI, transport or limits. Retained JSON and screenshots provide compact evidence; local recordings and source backups are not release assets. See the [current documentation](../../README.md).

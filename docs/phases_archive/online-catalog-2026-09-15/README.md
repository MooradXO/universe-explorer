# On-demand scientific observations

Added explicit Gaia DR3, SIMBAD and NASA/IPAC NED queries through bounded local/server adapters. Observations retain source IDs, URLs, timestamps, raw-response hashes, units and bibliography. Negative parallax is not converted to a fabricated distance; sources are not merged blindly. Cache is 32 MiB, responses 512 KiB, one request active and eight queued. NED pacing is at least 1.1 seconds; stale cached responses are clearly dated. Parsing, timeout, unavailable-service and UI cancellation checks passed. The existing flight relative performance budget remained within 5% on the same headless rig; this is not a real-device FPS claim.

## Historical scope

This report records the implementation on the date in its directory name. Later stages may supersede its UI, transport or limits. Retained JSON and screenshots provide compact evidence; local recordings and source backups are not release assets. See the [current documentation](../../README.md).

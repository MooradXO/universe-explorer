# AT-HYG 3D map

Added streamed catalogue tiles, search/cards, camera interaction, accurate string IDs and explicit unknown-distance handling. Prepared data contains 2,558,654 cards and 2,533,349 positions in a verified octree. Browser budgets are bounded; the existing renderer draws the map, and ship input is separately blocked while it is open. Build/types/guard, 33 unit tests and 14 Edge browser tests passed. Coverage includes point selection, wheel/pinch, ambiguous IDs, missing distances, focus/Escape, resource release, retry and cancellation. Near-base draw counts stayed HIGH 104 and LOW 85; a 5% comparative budget passed. These are headless-regression results, not physical-device performance claims.

## Historical scope

This report records the implementation on the date in its directory name. Later stages may supersede its UI, transport or limits. Retained JSON and screenshots provide compact evidence; local recordings and source backups are not release assets. See the [current documentation](../../README.md).

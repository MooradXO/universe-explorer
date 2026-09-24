# Combined catalogue architecture

The selected design uses full AT-HYG 4.0 as a prepared local foundation, with Gaia DR3, SIMBAD and NASA/IPAC NED observations fetched explicitly as the player explores. Bulk downloads of those larger scientific archives were rejected. The existing AT-HYG research working set, including a repeat verification database, was about 13 GB; players receive small map tiles, not that working set.

Roles remain distinct: AT-HYG supplies stable base records/positions, Gaia measurements/quality, SIMBAD cross-identifications/types/bibliography and NED extragalactic observations. IDs stay strings with source/release. Missing distances remain unknown, parallax is not blindly inverted, duplicate components are not merged and newer observations do not silently relocate existing game worlds.

The map is freely orbitable/zoomable/searchable at real linear proportions. In-system flight and interstellar warp use catalogue anchors, with fictional generated content clearly separated from scientific records. Cache, request size/concurrency and service pacing are bounded. See the current catalogue guide for actual values.

Source-data rights are independent of the MIT code license. The ESA request remains unsent; no commercial permission is claimed.

[Current catalogue guide](../CATALOG_PIPELINE.md) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)

## Sources recorded during the original research

- [Source 1](https://codeberg.org/astronexus/athyg)
- [Source 2](https://www.cosmos.esa.int/web/gaia/dr3)
- [Source 3](https://simbad.cds.unistra.fr/Pages/guide/ch15.htx)
- [Source 4](https://ned.ipac.caltech.edu/Documents/Overview)
- [Source 5](https://gea.esac.esa.int/archive/documentation/GDR3/Catalogue_consolidation/chap_crossmatch/sec_crossmatch_algorithm/)
- [Source 6](https://ned.ipac.caltech.edu/Docs%3A%3AAPI/)

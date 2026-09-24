# Third-party notices

The MIT license applies to project code, not automatically to the data, models, textures and effects listed below.

## AT-HYG 4.0 — optional star catalogue

Compiler: David Nash / Astronomy Nexus. [Source](https://codeberg.org/astronexus/athyg).

The full catalogue and map databases live outside repository/public/dist. Six unchanged review anchors (Proxima Centauri, Sirius, Vega, Betelgeuse, Altair and Rigel) are included in src/world/environments/ReviewAnchors.json for reproducible game-world previews. This sample retains CC BY-SA 4.0 and attribution to David Nash / Astronomy Nexus.

Map transformations include field normalization, search indexing, spatial partitioning, distant-view sampling and block-relative Float32 display coordinates. Original records and identifiers are retained separately.

The compilation declares [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Recorded Gaia source terms: [CC BY-NC 3.0 IGO / ESA](https://www.cosmos.esa.int/web/gaia-users/license). Separate commercial-use permission has not been obtained. The project's MIT license does not replace data-source terms. Primary catalogue citations: [AT-HYG acknowledgments](https://codeberg.org/astronexus/athyg/src/commit/eebe42b3552ae04e67d27ae085a8aad997b42bc0/ACKNOWLEDGMENTS.md).

## Gaia DR3, SIMBAD and NASA/IPAC NED

Responses are cached outside the repository. Observations retain query URL, snapshot time, SHA256, units and available publication links; sources remain separately attributed.

- Gaia: ESA / Gaia / DPAC; [DR3](https://www.cosmos.esa.int/web/gaia/dr3), [data terms](https://www.cosmos.esa.int/web/gaia-users/license).
- SIMBAD: CDS, Strasbourg, France; [service](https://simbad.cds.unistra.fr/simbad/), [CDS terms](https://cds.unistra.fr/legals/). Individual measurement bibliographic codes are preserved.
- NED: NASA/IPAC Extragalactic Database, funded by NASA and operated by the California Institute of Technology; [About NED](https://ned.ipac.caltech.edu/Documents/Overview). The adapter uses the current overview API and links to primary publications.

API access does not waive data terms. The unsent ESA draft does not grant permission for commercial redistribution. Scientific data is not relicensed as MIT.

## Solar System coordinates and stellar views

Eight-planet orbital parameters: [JPL approximate positions, Table 1](https://ssd.jpl.nasa.gov/planets/approx_pos.html). The game uses a fixed J2000.0 state, not current ephemerides; the Earth row approximates the Earth–Moon barycentre.

Mean radii: [JPL physical parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html). Astronomical unit: [JPL astrodynamic parameters](https://ssd.jpl.nasa.gov/astro_par.html). Nominal solar radius, 695,700 km: [IAU 2015 Resolution B3](https://www.iau.org/common/Uploaded%20files/IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf), a nominal constant rather than a current surface measurement.

Planet surfaces are illustrative. Generated extrasolar planets and survey locations are fictional game content, not confirmed exoplanets. Other stellar radii are illustrative. Background directions use a bounded AT-HYG sample relative to the selected system; its attribution/terms above still apply.

## EpicToonFX

Original VFX: Archanor VFX. The owner supplied a purchased Three.js adaptation and authorized suitable effects in Universe Explorer. These materials are not MIT/CC0; original rights remain with their owners.

The initial subset contains SpinPortalBlue, ScanExplosion and Plexus with seven textures. The environment subset adds 66 presets and 19 shared textures. Counts include colour variants, not 66 independent structural families. Definitions are preserved, audio disabled and the adapter bounds particles and simulation scale. The supplied source library is unchanged.

Provenance and hashes: src/vendor/epic-fx/README.md, src/vendor/epic-fx/provenance.json, public/assets/fx-environments/provenance.json. Inclusion does not grant an independent license to reuse or redistribute the original library.

## Environment textures and moons

Mercury, Venus atmosphere, Earth, Mars, Jupiter, Saturn, Uranus, Neptune and Moon maps: [Solar System Scope](https://www.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: HIGH/LOW resizing, WebP encoding and cinematic lighting. These are artistic composite maps; some source areas were reconstructed by their authors. File URLs and SHA256 are in public/assets/environments/provenance.json.

Four detail-source materials (regolith, ice, minerals and cloud density) were generated for this project with OpenAI image generation. Large-scale geography is generated separately per world. Original PNG and runtime WebP files are retained; prompts are in docs/research/generated-material-prompts.json.

Relative positions of eleven major Solar System moons use [JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html): fixed J2000.0 TDB geometric ICRF vectors at 10 km/game unit. Mean radii: [JPL satellite parameters](https://ssd.jpl.nasa.gov/sats/phys_par/sep.html). Responses: docs/research/moon-source/; conversion: scripts/prepare-moon-positions.py. Absolute accuracy is limited by the approximate parent-planet orbits. Other moon surfaces, rings, auroras, nebulae and environment objects are artistic.

## d3-celestial — BSD-3-Clause data

Author: Olaf Frohn. [Upstream](https://github.com/ofrohn/d3-celestial). Unchanged source data: src/data/constellations.lines.json from data/constellations.lines.json, and src/data/constellations.names.json from data/constellations.json (renamed locally).

[License source](https://github.com/ofrohn/d3-celestial/blob/master/LICENSE), checked September 15, 2026. This notice is included in the client build. Retained data attribution does not imply that removed constellation artwork is displayed.


```text
Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Colyseus multiplayer

`@colyseus/core`, `@colyseus/sdk`, `@colyseus/schema`, `@colyseus/ws-transport`. Versions are pinned in package-lock.json. Source: https://github.com/colyseus/colyseus

Copyright (c) 2015-2026 Endel Dreyer

MIT License:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

/** Fixed J2000 TDB geocentric/planetocentric ICRF vectors from JPL Horizons. X,Z,-Y; 10 km/unit.
 * Absolute accuracy remains limited by the parent planet approximate J2000 orbit. Textures except Moon are illustrative.
 * Sources: https://ssd.jpl.nasa.gov/api/horizons.api and https://ssd.jpl.nasa.gov/sats/phys_par/sep.html
 */
export const SOLAR_MOONS = [
  {
    "parent": "sol/earth",
    "id": "301",
    "name": "Moon",
    "radius": 173.74,
    "position": [
      -29160.83841877129,
      -7610.248730658794,
      26671.68338540655
    ],
    "style": 0
  },
  {
    "parent": "sol/mars",
    "id": "401",
    "name": "Phobos",
    "radius": 1.108,
    "position": [
      -198.8977928515696,
      -318.226164950267,
      874.3160225250358
    ],
    "style": 15
  },
  {
    "parent": "sol/mars",
    "id": "402",
    "name": "Deimos",
    "radius": 0.62,
    "position": [
      1036.6440288573829,
      -1394.5346077171139,
      1574.76637075316
    ],
    "style": 15
  },
  {
    "parent": "sol/jupiter",
    "id": "501",
    "name": "Io",
    "radius": 182.149,
    "position": [
      39971.423632957296,
      6120.2666940873005,
      -11435.823379347561
    ],
    "style": 9
  },
  {
    "parent": "sol/jupiter",
    "id": "502",
    "name": "Europa",
    "radius": 156.07999999999998,
    "position": [
      -56124.44737473305,
      -15808.64244536325,
      31949.38652420691
    ],
    "style": 3
  },
  {
    "parent": "sol/jupiter",
    "id": "503",
    "name": "Ganymede",
    "radius": 263.12,
    "position": [
      -82134.50948603006,
      -30433.812137228797,
      61508.567338751665
    ],
    "style": 6
  },
  {
    "parent": "sol/jupiter",
    "id": "504",
    "name": "Callisto",
    "radius": 241.03000000000003,
    "position": [
      32507.973063313588,
      79619.80648559552,
      -167365.7388398113
    ],
    "style": 0
  },
  {
    "parent": "sol/saturn",
    "id": "602",
    "name": "Enceladus",
    "radius": 25.21,
    "position": [
      16171.0097341096,
      -118.280590898433,
      17314.16084562344
    ],
    "style": 4
  },
  {
    "parent": "sol/saturn",
    "id": "606",
    "name": "Titan",
    "radius": 257.476,
    "position": [
      -94680.29384488796,
      2708.223040694325,
      -82409.82253187532
    ],
    "style": 12
  },
  {
    "parent": "sol/uranus",
    "id": "703",
    "name": "Titania",
    "radius": 78.89,
    "position": [
      -6310.70017574001,
      -41198.71943028166,
      -12800.03226932252
    ],
    "style": 6
  },
  {
    "parent": "sol/neptune",
    "id": "801",
    "name": "Triton",
    "radius": 135.26,
    "position": [
      -20569.64744679369,
      28881.23684286066,
      -1000.4077126660101
    ],
    "style": 5
  }
];

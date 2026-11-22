// The places shown on the travel map (travel/index.html).
//
// To add a place, just add a line with its name in quotes, optionally with
// the country and the year(s) you were there:
//
//   "Kyoto",
//   "Paris, France 2024",
//   "Cambridge, Massachusetts 2019 2025",
//
// The location is looked up automatically (the biggest city with that name,
// so add the country or state if that is the wrong one). To check what was
// found, open the map with #edit at the end of the address.
//
// For more control, use the long form. Everything except `city` is optional:
//
//   { city: "Kyoto", year: 2025, note: "Temples!", lat: 35.0116, lon: 135.7681 },
//
//   lat/lon  exact coordinates (north and east positive), skips the lookup
//   year     a number or a list of numbers, e.g. 2024 or [2019, 2025]
//   note     a short text shown when hovering over the pin
//   country  only needed if the automatic country is wrong
//   home     true for the place you live (used for distance stats)

window.PLACES = [
  { city: "Copenhagen", lat: 55.6761, lon: 12.5683, home: true },

  // USA
  { city: "San Francisco", lat: 37.7749, lon: -122.4194 },
  { city: "Los Angeles", lat: 34.0522, lon: -118.2437 },
  { city: "Laguna Beach", lat: 33.5423, lon: -117.7831 },
  { city: "Yosemite", lat: 37.7456, lon: -119.5936 },
  { city: "Salt Lake City", lat: 40.7608, lon: -111.8911 },
  { city: "Boston", lat: 42.3584, lon: -71.0598 },
  { city: "Marion", lat: 41.7001, lon: -70.7628 },
  { city: "New York", lat: 40.7143, lon: -74.006 },

  // Spain
  { city: "Bilbao", lat: 43.2627, lon: -2.9253 },
  { city: "San Sebastián", lat: 43.3183, lon: -1.9812 },
  { city: "Barcelona", lat: 41.3888, lon: 2.159 },

  // France and Monaco
  { city: "Paris", lat: 48.8534, lon: 2.3488 },
  { city: "Giverny", lat: 49.0769, lon: 1.53, note: "Monet's garden" },
  { city: "Nice", lat: 43.7031, lon: 7.2661 },
  { city: "Monaco", lat: 43.7314, lon: 7.419 },

  // Italy, San Marino and the Vatican
  { city: "Milan", lat: 45.4643, lon: 9.1895 },
  { city: "Genoa", lat: 44.4048, lon: 8.9444 },
  { city: "Rome", lat: 41.8919, lon: 12.5113 },
  { city: "Vatican City", lat: 41.9023, lon: 12.4533 },
  { city: "San Marino", lat: 43.9367, lon: 12.4463 },
  { city: "Rimini", lat: 44.0575, lon: 12.5653 },

  // Switzerland and Liechtenstein
  { city: "Zurich", lat: 47.3667, lon: 8.55 },
  { city: "Geneva", lat: 46.2022, lon: 6.1457 },
  { city: "Basel", lat: 47.5584, lon: 7.5733 },
  { city: "Bern", lat: 46.9481, lon: 7.4474 },
  { city: "Rapperswil", lat: 47.2256, lon: 8.8223 },
  { city: "Wildhaus-Alt St. Johann", lat: 47.2058, lon: 9.354 },
  { city: "Vaduz", lat: 47.1415, lon: 9.5215 },

  // Germany
  { city: "Berlin", lat: 52.5244, lon: 13.4105 },
  { city: "Hamburg", lat: 53.5507, lon: 9.993 },
  { city: "Bochum", lat: 51.4817, lon: 7.2165 },
  { city: "Münster", lat: 51.9624, lon: 7.6257 },

  // Netherlands
  { city: "The Hague", lat: 52.0767, lon: 4.2986 },
  { city: "Utrecht", lat: 52.0908, lon: 5.1222 },
  { city: "Tilburg", lat: 51.5555, lon: 5.0913 },
  { city: "Rotterdam", lat: 51.9225, lon: 4.4792 },

  // Denmark
  { city: "Aarhus", lat: 56.1567, lon: 10.2108, note: "Lived here" },
  { city: "Odense", lat: 55.3959, lon: 10.3883 },
  { city: "Randers", lat: 56.4607, lon: 10.0364 },
  { city: "Viborg", lat: 56.4532, lon: 9.402 },
  { city: "Varde", lat: 55.6211, lon: 8.4807 },
  { city: "Skagen", lat: 57.7209, lon: 10.5839 },
  { city: "Rømø", lat: 55.0876, lon: 8.5648 },
  { city: "Roskilde", lat: 55.6415, lon: 12.0803 },
  { city: "Sorø", lat: 55.4318, lon: 11.5555 },
  { city: "Helsingør", lat: 56.0361, lon: 12.6136 },
  { city: "Hornbæk", lat: 56.0903, lon: 12.4569 },
  { city: "Gilleleje", lat: 56.122, lon: 12.3106 },
  { city: "Liseleje", lat: 56.0129, lon: 11.9654 },
  { city: "Rønne", lat: 55.1009, lon: 14.7066 },
  { city: "Gudhjem", lat: 55.2105, lon: 14.9713 },
  { city: "Allinge-Sandvig", lat: 55.2759, lon: 14.8024 },

  // Sweden and Norway
  { city: "Malmö", lat: 55.6059, lon: 13.0007 },
  { city: "Lund", lat: 55.7058, lon: 13.1932 },
  { city: "Kungsbacka", lat: 57.4872, lon: 12.0761 },
  { city: "Stockholm", lat: 59.3294, lon: 18.0687 },
  { city: "Oslo", lat: 59.9127, lon: 10.7461 },

  // Czechia and Russia
  { city: "Prague", lat: 50.088, lon: 14.4208 },
  { city: "Saint Petersburg", lat: 59.9386, lon: 30.3141 },

  // China
  { city: "Shanghai", lat: 31.2222, lon: 121.4581, note: "Lived here" },
  { city: "Beijing", lat: 39.9075, lon: 116.3972, note: "Lived here" },
  { city: "Hangzhou", lat: 30.2936, lon: 120.1614 },
  { city: "Wuzhen", lat: 30.7454, lon: 120.4851 },
  { city: "Nanjing", lat: 32.0617, lon: 118.7778 },
  { city: "Harbin", lat: 45.75, lon: 126.65 },
  { city: "Shenyang", lat: 41.7922, lon: 123.4328 },
  { city: "Guangzhou", lat: 23.1167, lon: 113.25 },
  { city: "Kunming", lat: 25.0389, lon: 102.7183 },
  { city: "Jianshui", lat: 23.6347, lon: 102.8263 },
  { city: "Hong Kong", lat: 22.3193, lon: 114.1694 },

  // South Korea and Japan
  { city: "Busan", lat: 35.1017, lon: 129.03 },
  { city: "Shizuoka", lat: 34.9833, lon: 138.3833 },
  { city: "Izu", lat: 34.9716, lon: 138.9464 },
  { city: "Atami", lat: 35.0883, lon: 139.0533 },

  // Southeast Asia
  { city: "Singapore", lat: 1.3667, lon: 103.8 },
  { city: "Bintan", lat: 1.08, lon: 104.48 },
  { city: "Bangkok", lat: 13.754, lon: 100.5014 },
  { city: "Chiang Mai", lat: 18.7904, lon: 98.9847 },
];

// Trips: places visited on the same trip, in the order visited, oldest trip
// first. Use the city names from the list above. Each trip is drawn as a
// route on the map. A trip can also have a name and a year:
//
//   { name: "Summer school", year: 2024, stops: ["Zurich", "Bern"] },

window.TRIPS = [
  ["Boston", "Marion"],
  ["Yosemite", "Los Angeles", "San Francisco", "Laguna Beach"],
  ["Tilburg", "The Hague"],
  ["Tilburg", "Utrecht"],
  ["Tilburg", "Rotterdam"],
  ["Geneva", "Vaduz", "Genoa"],
  ["Chiang Mai", "Bangkok"],
  ["Beijing", "Kunming", "Jianshui", "Shanghai"],
  ["Shizuoka", "Izu", "Atami"],
  ["Shanghai", "Nanjing"],
  ["Shanghai", "Hangzhou", "Wuzhen", "Shanghai"],
  ["Beijing", "Harbin", "Shenyang"],
  ["Bilbao", "San Sebastián"],
  ["Zurich", "Prague"],
  ["Zurich", "Basel"],
  ["Zurich", "Bern"],
  ["Zurich", "Rapperswil"],
  ["Zurich", "Wildhaus-Alt St. Johann"],
  ["Giverny", "Paris", "Zurich"],
  ["Singapore", "Bintan"],
];

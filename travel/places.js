// The places shown on the travel map (travel/index.html).
//
// To add a place, add a line to the list below. Only `city`, `lat` and `lon`
// are required; the country is worked out automatically from the coordinates.
//
//   city     name shown on the map
//   lat/lon  coordinates in degrees (north and east are positive)
//   year     optional, a number or a list of numbers, e.g. 2024 or [2019, 2025]
//   note     optional, a short text shown when hovering over the pin
//   country  optional, only needed if the automatic country is wrong
//   home     optional, true for the place you live (used for distance stats)
//
// Easier: open the map with #edit at the end of the address
// (travel/index.html#edit), click on the map or search for a city, and then
// copy the generated list back into this file.

window.PLACES = [
  { city: "Copenhagen", lat: 55.6761, lon: 12.5683, home: true },
];

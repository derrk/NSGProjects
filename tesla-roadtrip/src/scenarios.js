// Corridor sketches to evaluate. These are NOT validated itineraries, confirmed
// charging stops, or bookings. Waypoints only shape the corridor handed to OSRM.
// Option A and Option B are independent; they are never combined.
//
// Must-see stops are owner-specified. Each happens to sit on a Supercharger site,
// so the charging stop and the visit overlap; `hours` is the time BEYOND a normal
// charging stop, not the whole visit.

const GRAND_CANYON = {
  name: 'Grand Canyon South Rim',
  lat: 36.0544, lon: -112.1401, hours: 3.0,
  charger: 'Tusayan, AZ (12 stalls, 150 kW) - 5.9 mi from the rim',
};
const TESLA_DINER = {
  name: 'Tesla Diner, Hollywood',
  lat: 34.0901, lon: -118.3437, hours: 1.0,
  charger: 'Los Angeles, CA - Tesla Diner (80 stalls, 325 kW) - on site',
};
const STATUE_OF_LIBERTY = {
  name: 'Statue of Liberty (ferry from Battery Park)',
  lat: 40.7033, lon: -74.0170, hours: 4.0,
  charger: 'Manhattan, NY - Vesey St (4 stalls, 72 kW) - 0.7 mi from the ferry',
};

const A = [
  {
    id: 'A1',
    group: 'A',
    label: 'Lodi - I-40 out and back',
    note: 'Lowest-mileage way to reach Lodi. Returning on the same corridor means most return-day sites are ones you already collected outbound, so unique-site yield is capped.',
    mustSee: [GRAND_CANYON],
    waypoints: [
      'Wichita Falls, TX', 'Amarillo, TX', 'Albuquerque, NM', 'Flagstaff, AZ',
      'Grand Canyon (Tusayan), AZ', 'Williams, AZ',
      'Kingman, AZ', 'Barstow, CA', 'Bakersfield, CA', 'Fresno, CA', 'Lodi, CA',
      'Fresno, CA', 'Bakersfield, CA', 'Barstow, CA', 'Kingman, AZ',
      'Flagstaff, AZ', 'Albuquerque, NM', 'Amarillo, TX', 'Wichita Falls, TX',
    ],
  },
  {
    id: 'A2',
    group: 'A',
    label: 'Lodi - I-40 out, southern I-10/I-20 return',
    note: 'Outbound on I-40 via the Grand Canyon, home through LA, Phoenix, Tucson and El Paso. Two distinct corridors, so almost every return-day site is new.',
    mustSee: [GRAND_CANYON, TESLA_DINER],
    waypoints: [
      'Wichita Falls, TX', 'Amarillo, TX', 'Albuquerque, NM', 'Flagstaff, AZ',
      'Grand Canyon (Tusayan), AZ', 'Williams, AZ',
      'Kingman, AZ', 'Barstow, CA', 'Bakersfield, CA', 'Fresno, CA', 'Lodi, CA',
      'Fresno, CA', 'Bakersfield, CA', 'Tesla Diner, Los Angeles, CA', 'Palm Springs, CA',
      'Phoenix, AZ', 'Tucson, AZ', 'Las Cruces, NM', 'El Paso, TX',
      'Midland, TX', 'Abilene, TX', 'Wichita Falls, TX',
    ],
  },
  {
    id: 'A3',
    group: 'A',
    label: 'Lodi - southern I-10 out, I-40 return (weather hedge)',
    note: 'Same two corridors as A2 reversed. Keeps Flagstaff and the Grand Canyon for the return, when you can reroute south if snow is forecast.',
    mustSee: [GRAND_CANYON, TESLA_DINER],
    waypoints: [
      'Wichita Falls, TX', 'Abilene, TX', 'Midland, TX', 'El Paso, TX',
      'Las Cruces, NM', 'Tucson, AZ', 'Phoenix, AZ', 'Palm Springs, CA',
      'Tesla Diner, Los Angeles, CA', 'Bakersfield, CA', 'Fresno, CA', 'Lodi, CA',
      'Fresno, CA', 'Bakersfield, CA', 'Barstow, CA', 'Kingman, AZ',
      'Williams, AZ', 'Grand Canyon (Tusayan), AZ', 'Flagstaff, AZ',
      'Albuquerque, NM', 'Amarillo, TX', 'Wichita Falls, TX',
    ],
  },
  {
    id: 'A4',
    group: 'A',
    label: 'Lodi - Grand Canyon, Las Vegas, NorCal collecting, southern return',
    note: 'A2 plus the Las Vegas cluster outbound and a Stockton/Sacramento loop at Lodi. Highest site density of the Option A set and the highest mileage.',
    mustSee: [GRAND_CANYON, TESLA_DINER],
    waypoints: [
      'Wichita Falls, TX', 'Amarillo, TX', 'Albuquerque, NM', 'Flagstaff, AZ',
      'Grand Canyon (Tusayan), AZ', 'Williams, AZ',
      'Kingman, AZ', 'Las Vegas, NV', 'Barstow, CA', 'Bakersfield, CA',
      'Fresno, CA', 'Stockton, CA', 'Lodi, CA', 'Sacramento, CA', 'Stockton, CA',
      'Fresno, CA', 'Bakersfield, CA', 'Tesla Diner, Los Angeles, CA', 'Palm Springs, CA',
      'Phoenix, AZ', 'Tucson, AZ', 'Las Cruces, NM', 'El Paso, TX',
      'Midland, TX', 'Abilene, TX', 'Wichita Falls, TX',
    ],
  },
];

const RETURN_INLAND = [
  'Harrisburg, PA', 'Pittsburgh, PA', 'Columbus, OH',
  'Indianapolis, IN', 'St. Louis, MO', 'Springfield, MO', 'Tulsa, OK',
  'Oklahoma City, OK', 'Wichita Falls, TX',
];

const OUT_GULF = [
  'Wichita Falls, TX', 'Dallas, TX', 'Shreveport, LA', 'Jackson, MS',
  'Mobile, AL', 'Tallahassee, FL',
];

const UP_COAST = [
  'Savannah, GA', 'Charleston, SC', 'Fayetteville, NC', 'Richmond, VA',
  'Washington, DC', 'Baltimore, MD', 'Philadelphia, PA', 'Battery Park, New York, NY',
];

const B = [
  {
    id: 'B1',
    group: 'B',
    label: 'North Florida (Jacksonville) - coast - NYC - inland return',
    note: 'Shortest of the Florida options. Turns north at Jacksonville without going down the peninsula. Beach time at Jacksonville or Savannah.',
    mustSee: [STATUE_OF_LIBERTY],
    waypoints: [...OUT_GULF, 'Jacksonville, FL', ...UP_COAST, ...RETURN_INLAND],
  },
  {
    id: 'B2',
    group: 'B',
    label: 'Central Florida (Orlando) - coast - NYC - inland return',
    note: 'Adds the Orlando area, the densest Supercharger cluster in Florida, at the cost of a peninsula round trip.',
    mustSee: [STATUE_OF_LIBERTY],
    waypoints: [...OUT_GULF, 'Orlando, FL', 'Jacksonville, FL', ...UP_COAST, ...RETURN_INLAND],
  },
  {
    id: 'B3',
    group: 'B',
    label: 'South Florida (Miami) - coast - NYC - inland return',
    note: 'Full peninsula via Tampa and Miami. Most Florida sites and the best beaches, and by far the longest total route.',
    mustSee: [STATUE_OF_LIBERTY],
    waypoints: [...OUT_GULF, 'Tampa, FL', 'Miami, FL', 'Orlando, FL', 'Jacksonville, FL', ...UP_COAST, ...RETURN_INLAND],
  },
  {
    id: 'B4',
    group: 'B',
    label: 'North Florida - coast - NYC - southern (I-81/I-40) return',
    note: 'Same outbound as B1, returning through the Shenandoah and Tennessee corridor instead of the Midwest. Different return-side sites.',
    mustSee: [STATUE_OF_LIBERTY],
    waypoints: [...OUT_GULF, 'Jacksonville, FL', ...UP_COAST,
      'Harrisburg, PA', 'Knoxville, TN', 'Nashville, TN', 'Memphis, TN',
      'Little Rock, AR', 'Oklahoma City, OK', 'Wichita Falls, TX'],
  },
];

module.exports = { scenarios: [...A, ...B], mustSeeCatalog: { GRAND_CANYON, TESLA_DINER, STATUE_OF_LIBERTY } };

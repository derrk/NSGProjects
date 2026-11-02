# Tesla Thanksgiving Road Trip — route analyzer

Scores candidate road trips on how many **distinct Supercharger sites** each one can
realistically reach inside the Nov 21–29 / Nov 21–30 2026 window, using real catalog
data and real road routing. Output is the comparison page in `web/compare.html`.

This is an unofficial estimator. Tesla is authoritative for anything contest-related.

## Run it

```bash
node src/import-history.js data/untrusted/history/<export>.csv
node src/run.js        # route every scenario, write results/analysis.json
node src/export.js     # build results/trip-data.json for the page
node src/build-page.js # inline that data into web/compare.html
node src/build-itinerary.js B1      # locked route -> results/itinerary.json
node src/build-itinerary-page.js    # -> web/itinerary.html
node src/build-map.js               # -> web/map.html (standalone, self-hostable)
node src/serve.js                   # optional: serve web/ on :4178
node --test test/engine.test.js
```

`src/run.js` calls the OSRM demo server. Responses are cached in `data/route-cache/`,
so a re-run is instant and offline unless you change a scenario's waypoints.

To refresh the Supercharger catalog, re-fetch
`https://supercharge.info/service/supercharge/allSites` into `data/allSites.json` and
update `data/allSites.meta.json` with a new `retrievedAt`.

## Layout

| Path | What it does |
| --- | --- |
| `src/catalog.js` | Loads the site catalog, filters to US + `OPEN`, keeps source IDs separate from any Tesla slug |
| `src/geo.js` | Haversine, polyline decode, corridor matching |
| `src/route.js` | OSRM routing with a disk cache; identifies the provider |
| `src/analyze.js` | Corridor pool → day split → per-day stop optimiser → time and cost |
| `src/scenarios.js` | The eight corridor sketches (A1–A4 Lodi, B1–B4 Florida/NYC) |
| `src/export.js` | Builds the page dataset, including the SVG basemap and route paths |
| `web/compare.template.html` | Comparison page; `__TRIP_DATA__` replaced at build time |
| `src/itinerary.js` | Clock-time schedule, streak margins, timezone handling, nav links |
| `web/itinerary.template.html` | Run sheet for the chosen route |
| `web/map.template.html` | Standalone interactive map with click-to-mark-visited |
| `src/build-map.js` | Inlines catalog + history + plan into `web/map.html` |
| `data/lodging.json` | Hotel candidates per overnight, hand-researched |

## How the site count is produced

Per day: driving time comes from routed distance ÷ an editable average speed. Energy
time is billed kWh ÷ average charge rate and is roughly fixed no matter how many stops
you make, because total energy is the same. So the marginal cost of one extra unique
site is mostly **overhead** — about 10 minutes plus the out-and-back detour.

A dynamic program then picks the stop set that maximises site count subject to:

- consecutive stops at least `minSpacingMi` apart, so each session is a plausible real charge
- no gap longer than `usableRangeMi`, so the day is actually drivable
- the whole day fitting `dayBudgetH`

If no drivable chain exists the day is flagged `range-gap`. If one exists but the
minimum viable set busts the budget it is flagged `charging-wont-fit`. Neither is
silently absorbed.

## Charging history

Import the Tesla account CSV export:

```bash
node src/import-history.js data/untrusted/history/<export>.csv
```

Writes `data/visited.json` (consumed by `run.js`) and `results/history.json` (shown on
the page). Matching folds street-suffix abbreviations so "North Freeway" and "North Fwy"
agree; anything below that goes to a review list rather than being assumed.

The pool the range check uses is **all** open sites, not just unvisited ones: an
already-used site is still somewhere you can charge, it just scores nothing. Without
that split, a corridor of familiar sites looks un-drivable.

## The map

`web/map.html` is one self-contained file: Leaflet and OpenStreetMap tiles from CDN,
everything else inlined. Drop it on any static host, or open it directly.

- All 3,293 open US sites, coloured by whether you have charged there.
- The 124 planned stops are highlighted and tagged with their trip day.
- Click any site to mark or unmark it as charged.
- Search flies the map to the match.
- Marks persist in `localStorage`, keyed per browser and per origin. Export/Import
  moves them between devices, since browser storage does not sync.

Manual marks are stored as **overrides on top of** the imported history, not merged
into it. Re-importing the Tesla CSV never wipes something you marked by hand.

Storage access is wrapped in try/catch: on an origin where it is blocked (a
`data:` URL, a private window) the map still works, it just cannot remember.

Verified end to end on a real HTTP origin: mark → counts update and persist →
reload restores → unmark reverts.

## Known limitations

- **History covers 2026 only**, so "never visited" means never in 2026. Earlier visits
  are not in the export and could make some counted sites not actually new.
- **Two sites are tagged to third-party networks** (Francis Energy Lawton OK, Victron
  Energy Bowie TX) yet appear in the Tesla billing export. They are excluded from the
  Supercharger count and listed for review.
- **Catalog is community data**, not an official Tesla feed, and site identity for the
  contest is Tesla's.
- **OSRM is a road router, not an EV energy model.** It does not know about elevation,
  wind, cold, or payload. Verify legs in the Tesla planner or ABRP.
- **OSRM demo durations run roughly 20% above observed highway times**, so planning time
  is derived from distance × `avgMph` instead. The raw OSRM duration is kept in the data
  as a pessimistic bound.
- **Day boundaries are time-weighted splits**, not real overnight towns. A must-see stop
  forces a day to end there, since you would arrive, see it and sleep. Overnight labels
  are the nearest corridor site to that point. Overnight labels are the
  nearest corridor site to that point. Because the split is fixed, site counts carry
  roughly ±3 of model noise — A2 and A3 are the same two corridors reversed and land 2
  sites apart for that reason alone.
- **No live pricing or stall availability.**
- `minSpacingMi` and `corridorMi` move the results more than anything else; both are
  judgement calls about what counts as a real charging session, not facts.

## Completed vs deferred

Completed: real catalog ingest with provenance, real road routing with caching, corridor
site matching, the per-day stop optimiser with range and budget constraints, cost model,
eight scored scenarios across both date windows, the comparison page with map overlay,
and 13 engine tests.

Added since: charging-history import with a review queue, streak evaluation over the
imported sessions, owner-specified sightseeing stops that reshape the day split, a
clock-time run sheet with timezone handling, and Google Maps navigation export.

Still deferred: live expense logging, IndexedDB persistence and backup/restore, the
countdown dashboard, and the PWA shell. Route edits currently mean editing
`src/scenarios.js` and re-running, not clicking in a UI.

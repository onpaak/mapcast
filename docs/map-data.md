# Map data

The pipeline has three steps: **map data → local generation → local export**. Only step 1 may use the network. The map tiles on the web page are a separate request, and you can switch them off.

## Sources

| Source | Limit | Notes |
| --- | --- | --- |
| OSM Map API (`--provider map-api`, default) | 1 km diagonal | The official editing API. Fine for a street block. |
| Overpass (`--provider overpass`) | 3 km diagonal | For larger areas. Use `--endpoint URL` to choose another Overpass instance. |
| Local file (`--input`) | none | GeoJSON or Overpass JSON; no network needed. |

Bounds are always **west, south, east, north**: longitude, latitude, longitude, latitude. Western hemisphere longitudes are negative; New York is about −74. Areas crossing the dateline or near the poles are not supported.

### Four-corner areas

Street grids often run at an angle. Instead of a box, you can select a convex four-sided area: use **Four corners** on the web page, or `--area` on the command line.

```bash
node src/cli.mjs --area "-73.988897,40.7562 -73.986405,40.755154 -73.984103,40.7583 -73.986595,40.759346" --out output/midtown
```

- The corners go in order around the area, clockwise or counter-clockwise. The shape must be convex and its edges must not cross.
- The download still covers the area's bounding box, and the size limit applies to that box's diagonal.
- Roads, water and green areas are clipped to the area, and the ground follows its outline. Buildings that touch it keep their full outline.
- The model is not rotated: north stays −Z, so the streets run at their real angle.
- `metadata.json` and `source-index.json` record the area, and `source-map.svg` outlines it.

Besides buildings, roads, water and green areas, a download includes shops and cafés, and the street furniture the concrete preset models: benches, litter bins, bicycle parking, gates, fences and railings. The Map API returns everything in the box; the Overpass query asks for these tags. Overpass areas cached before street furniture was added are downloaded again, because the query changed.

Downloads add a small buffer around the selection. They also try to fetch building relations that were only partly returned, so buildings crossing the edge come out whole. Even so, the data may be incomplete for some areas. `source-index.json` lists anything that could not be read.

## Cache and offline mode

Each download is saved in `cache/`. With the Map API, a smaller selection inside an area that is already cached reuses that download.

- `--refresh` downloads again.
- `--cache DIR` uses another cache folder.
- `--offline` (**Use cached data only** on the web page) never touches the network. If this source has no cache for the area, it stops with an error instead of falling back to anything else. Relations missing from the cache are recorded as missing. It cannot be combined with `--refresh` or `--terrain`.

## Local files

```bash
node src/cli.mjs --input area.geojson --out output/my-area
node src/cli.mjs --input overpass.json --bbox 13.401,52.527,13.407,52.531 --out output/local
```

- **GeoJSON:** a WGS84 FeatureCollection. Buildings are Polygon or MultiPolygon features with a `building` property. Roads are LineStrings with a `highway` property. Water, landuse, leisure and natural areas are optional.
- **Overpass JSON:** raw `out geom` output. `--bbox` clips it to a selection.

Every run writes the data it used to `area.geojson`, so a result can be regenerated from it later with `--input`.

Coordinates are projected around the area's centre. This is accurate for a few kilometres, not for whole cities.

## When a download fails

- **`EACCES`:** the connection was refused locally. Check the process's network permissions, sandbox or firewall. It does not mean the area is unsupported.
- **HTTP errors or timeouts:** the service did not answer. It does not mean the area has no buildings. Try again later or switch source.
- **HTTP 429:** rate limited. Wait, or use cached data.

A working local page only shows that the local server runs. It does not show that the machine can reach the map services.

## Credits

OpenStreetMap data is © OpenStreetMap contributors under the [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). Keep the attribution from `ATTRIBUTION.txt` with anything you publish. See the [OSM copyright page](https://www.openstreetmap.org/copyright).

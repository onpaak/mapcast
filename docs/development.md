# Development

Plain Node.js (22+) ES modules with no build step. Runtime dependencies:

- `earcut` for polygon triangulation
- `leaflet` for the web map
- `three` for the web 3D preview

```bash
npm test
```

The tests cover geometry, classification, data import, sign layout and export. They do not replace looking at real areas.

Generation is deterministic: the same input and options produce a byte-identical `city.glb`. When refactoring, generate a few areas before and after the change and compare file hashes.

## Layout

```
src/
  cli.mjs, server.mjs          command line and local web server
  osm.mjs, map-api.mjs,        download, cache and parse OSM data
  area.mjs                     four-corner selection areas: checks and clipping
  relations.mjs, shop-pois.mjs
  scene.mjs                    base scene: buildings, roads, paving, water, green
  road-*.mjs, walking-surfaces.mjs, pavement-clip.mjs, environment.mjs, streetscape.mjs
  ps2.mjs                      shared PS2 look: materials, ground, street lamps
  concrete-city.mjs            the concrete preset, one building at a time
  city/                        its parts:
    materials.mjs                material bins and texture atlases
    street-context.mjs           roads, pavement, obstacles and shared walls
    building-plan.mjs            family, height, floors, facade choice for one building
    edge-geometry.mjs            box / panel / reveal helpers along one facade edge
    shopfront.mjs                modelled ground-floor shop bays
    ground-floor-kit.mjs         roller shutters, service doors, vents and meter cabinets
    facade-bays.mjs              atlas bays, modelled windows and doors, courtyards
    edge-signs.mjs               tower and vertical signs, billboards, rooftop letters
    roof-equipment.mjs           water tanks, plant rooms, condensers and antennas
  facade-atlas.mjs             painted facade atlas and its UV frames
  neon-signs.mjs, pixel-glyphs.mjs, sign-catalog.mjs   sign atlas, glyphs and the sign word list
  brush-glyphs.mjs             24×24 brush-script Chinese for brush signs (baked by tools/brush-glyphs.mjs)
  billboards.mjs, billboard-art.mjs  rooftop billboards and their pixel-art posters
  street-furniture.mjs         mapped bins, bicycle racks and railings
  street-props.mjs, window-posters.mjs, shop-*.mjs, public-hall.mjs, ...
  glb.mjs, png.mjs             glTF and PNG writers
  texture-overrides.mjs        replace generated textures with PNGs from overrides/
  preview.mjs                  small CPU rasteriser for the still previews
  source-report.mjs            source-index.json and source-map.svg
web/                           the page: app.js, viewer.js (3D preview), i18n.js, samples/ (example renders)
tools/                         texture helpers, building kit and audits
examples/                      small synthetic inputs
```

`cache/`, `output/` and `overrides/` are local-only and ignored by git.

## Tools

| Command | |
| --- | --- |
| `npm run kit` | Writes one sample of each building family to `output/building-kit/` |
| `npm run textures:billboards` | Builds the billboard atlas from your images; see [textures](textures.md) |
| `npm run textures:vending` | Builds the vending machine textures from a day and a night picture |
| `node tools/audit-completeness.mjs output/<area>...` | Re-imports the raw Map API cache of generated areas and reports import failures, skipped objects and objects outside the selection. The report goes to `output/validation/`. |
| `node tools/audit-pavement.mjs output/<area>...` | Checks that pavements overlap no buildings, roads or each other |
| `node tools/audit-road-surfaces.mjs output/<area>...` | Checks that road surfaces and junction patches do not overlap, and saves before/after images |

The audits only cover data that was received. They cannot prove every real building was downloaded.

In a generated area, `source-index.json` → `importIssues` links objects that could not be parsed, and `features[].skipReasons` explains objects that were parsed but not generated.

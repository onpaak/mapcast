# How scenes are generated

OpenStreetMap provides the layout: building footprints (including courtyards and multipolygons), heights, roads, water and green areas. Everything visible on the buildings is procedural and seeded by object IDs. The same area always produces the same file.

## Buildings

Each building is assigned one of five families from its tags and the shops found inside it:

| Family | Look |
| --- | --- |
| Residential | Rows of windows, some recessed loggias, a solid entrance door |
| Office | Dense window bands, vertical fins, a deeper cornice |
| Shop | Ground floor with entrance, display windows, canopy, fascia and shop sign |
| Industrial / warehouse | Tall single volume, roller-shutter loading doors at the front, high windows on the sides |
| Public hall | Tall windows, heavy piers, double doors. Civic buildings and libraries, and large venues: theatres, cinemas, arts centres, concert halls, museums, galleries, exhibition and conference centres, sports halls and sports centres |

Schools, hotels and hospitals reuse the ordinary window modules, as do guardhouses and outbuildings; bungalows, cabins, huts and farmhouses are homes. Government buildings and police stations are offices, fire stations get the industrial roller doors, and kiosks are shops. Other special types (churches, stadiums, grandstands, towers, tanks, lift shafts, and any building type not listed) are a plain concrete mass without windows. `building=yes` with no other hints uses the residential layout. `metadata.json` → `concreteFamilies` records the family chosen for each building and the evidence behind it: `tag`, `mapped-use`, `default` or `fallback`.

Shop and restaurant points are matched to the building that contains them. Residential blocks with shops get shopfronts on the ground-floor bays next to the entrance.

### Facades

Following PS2-era practice, most of the building is textured rather than modelled:

- **Modelled:** street-facing ground floors (doors, display windows, canopies, signs), roof parapets, office fins and the roof stair core.
- **Painted:** upper floors, courtyard walls and ground floors away from the street. These come from one 512 × 512 facade atlas, plus an emissive atlas for lit windows. Recessed loggias are a simple cut-in of about 20 triangles.

The atlas has seven facade profiles: slender windows, wide windows, grouped loggias, small square windows, office bands, a plain window block, and a dense tower grid. Buildings of 12 storeys or more use the tower grid: plain mid-grey concrete and three small windows per bay, each lit independently, with about a third lit. Walls are neutral cool grey. Lit windows are mostly cool white with some warm white.

### Glass curtain walls

Buildings tagged as glass get a curtain wall instead: `building:facade:material`, or `building:material` when the facade material is missing, set to `glass` or `mirror`. Untagged buildings never get one, so a skyline does not mix real glass towers with guessed ones. Sections inherit the tag from their outline.

- Blue-grey glass between metal mullions, with a dark spandrel at each floor slab, runs from the pavement to a metal coping, the ground floor included: no modelled entrance, shopfront or vending machines.
- No signs hang on the walls (tower signs, vertical signs, square icon boxes, shop signs). Rooftop billboards and letters still appear. Towers of 12 storeys or more follow the same two rules with their tower-grid facade.
- There are no loggias or air-conditioning units.
- The material is glossy, so Blender and Unreal reflect the sky. With no sky or HDRI, the glass looks dark grey.
- At night whole floors light up, about a third of them, with the odd dark bay.

Tagging varies a lot between cities: parts of Manhattan have many glass-tagged towers, while most Asian city centres have almost none. `metadata.json` → `concreteFamilies` marks these buildings with `facade: curtain-wall`.

### Heights

1. `height` in metres, when it can be parsed.
2. Otherwise `building:levels` × 3 m.
3. Otherwise an estimate from the building type:

| Tag | Height |
| --- | --- |
| house, detached, semidetached_house, terraced, farm | 6.5 m |
| garage, shed, hut, carport, kiosk, bungalow, cabin, greenhouse and similar small structures | 3.5 m |
| barn | 6 m |
| `building=yes` under 200 m² | 6.5 m |
| `building=yes` under 400 m² | 9.5 m |
| anything else | 12 m |

Each object's `heightSource` in the metadata says which rule was used. Buildings with a negative `layer`, or with `location=underground` or `indoor`, are skipped. A positive `layer` only describes the stacking relative to platforms and stations, so those buildings are generated as usual.

Buildings that cross the edge of the selection keep their full outline and may extend past it.

### Building sections

Many tall buildings are mapped as `building:part` sections: a podium, setbacks, a crown or a spire. When an outline has sections inside it, the sections replace it, following OSM's Simple 3D Buildings convention:

- Each section spans `min_height` (or `building:min_level` × 3 m) up to its own `height` (or `building:levels` × 3 m).
- A section without a height takes the outline's height.
- Sections inherit the outline's use, so an office tower's sections are offices.
- Raised sections have no street level: no shopfronts, doors or street signs.
- Sections outside any outline become buildings of their own.
- Structures get no windows and become plain metal or concrete: towers (`building=tower` or a `man_made` tower, mast or chimney) are straight shafts, except a lattice tower (`tower:construction=lattice`) mapped as one building outline, which is drawn as an ordinary building, `building:shape=sphere` sections are low-poly spheres, antennas, masts and very thin sections (under 8 m²) are columns, and spires taper to a point over their `roof:height`.
- A section inside several outlines, such as a tower inside a podium, belongs to the smallest one.
- Sections do not float. When nothing is mapped right under a raised section, for example a podium mapped a storey short or standing outside the selection, the section extends down to the roof below it, or to the ground. Sections tagged `bridge`, `roof`, `canopy` or `balcony` stay in the air.
- A building that crosses the edge of the selection keeps all its sections, including those outside it.

`metadata.json` → `buildingParts` lists which outlines were replaced by which sections, and which sections were extended down (`extendedDown`). Roof shapes (`roof:shape`) are not modelled; every roof is flat.

### Ground-floor kit

Modelled ground floors also carry service details, fitted into the building's own wall so the finish continues around them:

| Piece | Rule |
| --- | --- |
| Roller shutters | Every warehouse loading door (about 70% closed, the rest half open onto a dark interior), with the housing on the wall. About 25% of shop bays without a window poster, closed or half raised; a half-raised shutter over a shop door stops above head height. Vacant shops (`shop=vacant`) keep them closed. The housing of a shop shutter sits in the wall, clear of fascia and canopy. |
| Service doors | About 5% of plain street-facing ground-floor bays, in place of the window. A steel door, 0.98 × 2.08 m, with a louvred transom where the storey is tall enough. Never next to the main entrance. |
| Cellar vents | About 10% of those bays: a louvred vent under the window. |
| Meter cabinets | About 8% of those bays: a wall-mounted cabinet on the pier beside the window, when it fits with 22 cm clear of the window. |

Bays with a vending machine get no kit piece. Glass curtain walls, buildings of 12 storeys or more, offices and raised sections keep their plain ground floors. Parts keep their real size: shutters add slats to fill an opening, and doors, vents and cabinets never stretch. Only the shutter slats keep a folded profile; door leaves, vent frames and cabinet details are single faces, so a cabinet is 34 triangles and a vent about 20. Their painted steel shares one 128 × 128 weathered paint texture (rust and runoff over 4 m), tinted per material; each building picks one shutter colour and one door colour. `metadata.json` → `groundFloorKit` lists every piece with its bay and bounds, and `groundFloorKitSummary` counts them.

### Shared walls

Walls against a neighbouring building, or against another section of the same building, get no facade where the neighbour hides them. A wall only shows above the neighbour's roof. Where two sections share the same outer wall, only the taller one draws it, so the faces never overlap and flicker. Where a taller tower rises from the ground just inside a podium's wall (within 1.5 m), that stretch of podium wall, with its parapet and signs, is left out, so the tower's facade runs down to the street instead of cutting through the podium. In dense blocks this removes a large share of triangles no camera could see.

### Rooftop equipment

Flat roofs of 9 m or more carry up to six items, roughly one per 80 m² of roof:

- water tanks
- plant rooms
- pairs of condensers
- antennas, on buildings of 20 m or more

Items stay clear of the parapet, courtyards, the stair core, billboards and rooftop letters. Special shapes such as churches and tanks stay bare. Each item is a few low-poly boxes or prisms using the existing materials; the list is in `metadata.json` → `rooftopEquipment`.

## Signs

All signs share one atlas 512 px wide (its height grows with the catalog), plus an emissive atlas. Text and icons are drawn in `src/pixel-glyphs.mjs`:

- 12 × 12 kana, hanzi and hangul
- 5 × 7 Latin letters and digits
- 16 × 16 icons: ramen bowl, pharmacy cross, cassette, game pad, cat, coffee, cocktail and more

Words are generic shop categories such as ラーメン, カラオケ, 宵夜, 노래방, HOTEL or DVD. They are fictional and do not represent the real businesses at that location.

The words and designs are listed in `src/sign-catalog.mjs`, a mix of Japanese, Chinese, Korean and English. Each entry names its kind (front, vertical, square, tower or rooftop), text, style, colour scheme and frame. Latin covers A–Z and 0–9, so any English word works; kana, hanzi and hangul exist only for the characters the catalog uses.

A few Cantonese trades are written in brush-script Traditional Chinese (`brush: true`): 茶餐廳, 藥房, 燒臘, 酒樓, 金行珠寶, 海味乾貨, 汽車維修 and 糖水甜品. Their characters are 24 × 24 bitmaps in `src/brush-glyphs.mjs`, drawn at the same size as the 12 × 12 set with four times the detail. `tools/brush-glyphs.mjs` bakes them from [LXGW WenKai TC](https://github.com/lxgw/LxgwWenkaiTC) (SIL Open Font License 1.1): download `LXGWWenKaiTC-Medium.ttf` to `cache/fonts/` and run `node tools/brush-glyphs.mjs` after adding a brush entry. The font itself is not part of the repository. A fascia needs about three characters or more: the band above a shop window can be under 20 cm tall, and a sign narrower than 0.5 m is left out. Rooftop letters and billboards keep their original designs.

Every entry names its `business`, the trade it advertises; pictogram boxes can serve several (the coffee cup fits cafés, 冰室 and 茶餐廳). A shop's projecting blade and pavement lightbox advertise the same trade as its fascia, and are left out when the catalog has nothing matching. Japanese and Korean words for the same trade count as different trades, so a カラオケ shop never gets a 노래방 lightbox. Vertical signs higher up stand for other businesses in the building and are chosen independently.

Glass curtain walls and towers of 12 storeys or more carry none of the wall-mounted signs below, only rooftop billboards and letters.

| Sign | Placement | Metadata |
| --- | --- | --- |
| Shop fascia lightbox | Above the entrance and display windows of shops; width follows the text | `shopSigns` |
| Projecting blade | Beside some shop signs, double-sided, at least 2.6 m above the pavement, in the shop's trade | `shopBlades` |
| Tower sign | One per street front of shop buildings of 3+ storeys (about 85%; 12% for other buildings). It hangs at an end joint so towers line up along the street. It is about 1.3 m wide and spans two or three floors, shrinking to fit, down to about 0.95 m. The same design is not repeated within 40 m. | `streetSigns` (`kind: tower`) |
| Vertical signs and square icon boxes | At bay joints above the ground floor, double-sided, in three widths. About a third are square pictograms. They are denser on shop buildings and staggered on blocks of 5+ storeys. | `streetSigns` |
| Rooftop billboard | About 22% of buildings of 12 m or more, on the front edge. It has a 2:1 face, a steel frame, a catwalk and three floodlights. The whole structure must stand on the roof, clear of courtyards and the stair core. Nearby billboards show different art. | `billboards` |
| Rooftop letters | Front edge of buildings of 12 m or more without a billboard: about 28% of shop and office buildings, 8% of others. Only one within 35 m, and a design is not repeated within 100 m. Cut-out neon letters use an alpha mask. | `rooftopSigns` |

Frames come in four styles: thin, thick, bulb marquee, and top/bottom bands. Signs above the ground floor avoid buildings and each other, and may overhang the road. Materials are lightbox, neon and cut-out. Emissive strength goes above 1 so bloom picks them up.

Some display windows carry one of four fictional posters (`windowPosters`).

## Street props and lamps

All prop placement is inferred. It is recorded in `metadata.json` → `streetProps`, and the objects are named `StreetProps_*`.

| Prop | Rule |
| --- | --- |
| Air-conditioning units | Under about 7% of painted windows up to the 8th floor, except on offices |
| Vending machines | About 6% of street-facing ground-floor bays, never next to a door. Wide bays often get a pair. The front glows at night. |
| Standing lightboxes | Beside about half of shop entrances, 1.2 m tall, double-sided, showing the shop's own trade (none when the catalog has no matching art) |

Street lamps are cool-white curved-arm lamps, roughly every 32 m along roads, standing on the pavement. They are one shared mesh, instanced by position and rotation.

Traffic signal poles stand where OpenStreetMap maps `highway=traffic_signals` on a road, and nowhere else. Each road leaving the signal gets one 3.5 m steel pole on its pavement, just outside the junction, with its head facing back across the junction: it is the far-side signal for the traffic coming from the opposite road, on that traffic's kerb side (the left kerb where traffic keeps left, as in Hong Kong, Japan or the UK). One road axis shows a lit red lens and the crossing axis a lit green one; the lenses glow at night. Street lamps keep 3 m clear of the poles. `metadata.json` → `trafficSignals` records each signal and how many poles it got.

Bus stops appear where OpenStreetMap maps `highway=bus_stop` or a bus platform node (`public_transport=platform` with `bus=yes`), and nowhere else. A stop snaps to the nearest road within 25 m, on the side it is mapped on, 0.3 m back from the kerb with its back to the buildings. It gets a glass shelter: 4 m long, a thin roof with a light strip under its front edge, a glass back, a lightbox poster at one end and the blue stop flag with a lit timetable beyond the other. Where the map says `shelter=no`, or the pavement has no room for a shelter, only the flag pole stands there. The shelter slides up to 6 m along the kerb to keep clear of buildings, lamps, signal poles, shop canopies and props; if even the pole does not fit, the stop is left out. A stop mapped within 18 m of one already placed on the same side is the same stop mapped twice (a stop and its platform) and is merged into it. The flag shows a bus and BUS, never route numbers or names. Every part is one shared mesh, instanced by position and rotation. `metadata.json` → `busStops` records each mapped stop: shelter or pole and why, how far it slid, or why it was merged or left out.

Props stand either fully on the pavement or fully on the ground, never across the kerb. Overhead wires are not generated: without poles and wall brackets they would appear out of nowhere, and OSM rarely maps them.

### Mapped street furniture

Litter bins, bicycle racks and railings appear only where OpenStreetMap maps them; nothing is added elsewhere, so streets with little mapping stay plain. Their look is one kit of cast concrete and painted steel, not a survey of the real objects. The objects are named `StreetFurniture_*`, and `metadata.json` → `streetFurniture` records every mapped item: where it went, its facing and why it came from the map or was inferred, or why it was left out.

| OSM | Model |
| --- | --- |
| `amenity=waste_basket` | Painted steel bin in a concrete frame |
| `amenity=bicycle_parking` (point) | One steel hoop stand |
| `amenity=bicycle_parking` (area) | A row of stands along the longest side: `capacity` / 2 (2 by default), at least 0.9 m apart and inside the area |
| `barrier=fence`, `railing`, `guard_rail`, `handrail` | Steel railing on a low concrete plinth: posts, two rails and one alpha-cut panel of bars per section. Height from `height`, else 1.47 m for fences, 1.05 m for railings and 0.8 m for guard rails |

- Facing follows `direction` when mapped; otherwise the item faces the nearest mapped road or path, square to it.
- Items stand fully on the pavement or fully on the ground. Anything that would cross the kerb, stand on a road, overlap a building, or overlap a vending machine, pavement lightbox or another item is left out. So are indoor items and those on another `level`.
- Railings leave a clear opening at mapped gates (`barrier=gate`, `entrance`, …; the gate leaves are not modelled) and stop where they would cross a carriageway.
- Railings on a central reservation are left out: where carriageways running alongside the railing lie within 12 m on both sides, with no building between, that stretch is dropped, and a railing that runs mostly along one is dropped whole. Such median fences would otherwise stand alone on the open ground between the two halves of a road.
- Walls, hedges, kerbs and bollards are not modelled.
- Lite detail has no street furniture.

## Quieter low-rise areas

Where buildings within 80 m average fewer than 3 storeys, as in villages and suburbs, the street stays calm. There are no tower signs, billboards or rooftop letters. Only shops keep vertical signs and vending machines.

## Lite detail

`--detail lite` (**Lite** on the web page) paints every facade from the atlas: there are no modelled ground floors or shopfronts. It also drops air-conditioning units, vending machines, standing lightboxes and mapped street furniture. Signs, billboards, lamps and bus stops stay. A dense Hong Kong block goes from about 576,000 triangles and 51 MB to about 367,000 triangles and 33 MB.

## Roads and ground

- Road width comes from `width`, lane count or road class. The generator builds flat road surfaces with clean junction patches.
- Every road has a plain 2 m pavement on both sides, starting right at the carriageway edge and trimmed around buildings and junctions. Nothing else is paved: mapped footways, paths, cycleways, pedestrian streets and squares are not drawn, so the ground beyond the pavements stays one even surface. They are listed as omissions in `source-index.json`.
- Zebra crossings are painted where OpenStreetMap maps a crossing on a road with markings: `crossing=zebra`, `marked`, `uncontrolled` or `traffic_signals`, or any `crossing:markings` other than `no`. Crossings without that information are not guessed. White bars 0.5 m wide every 1 m run with the traffic across the whole carriageway, 3 m deep. A crossing that would reach into a junction slides up to 3 m along its road, or is left out. Lane dashes keep clear of crossings. `metadata.json` → `zebraCrossings` records each crossing and why any was left out.
- The ground uses four finishes, plus water: **road** (every carriageway and junction is asphalt, whatever its mapped `surface`; the tag is still recorded as `surfaceKind`), the plain **pavement**, the **base ground**, and **green areas** (grass, parks, gardens and woodland).
- Water, grass, parks and woodland become flat areas. Trees are not generated.
- The ground is flat. An older elevation experiment remains behind `--terrain`, which downloads elevation data. It is not part of the main style.

## Known limits

- Landmarks are not recreated. Objects mapped only as points, with no building outline, may be missing.
- Roof shapes are ignored apart from spires; pitched and domed roofs come out flat. Curtain walls appear only where OSM tags the building as glass. Setbacks and spires appear only where they are mapped as `building:part`. Missing heights flatten the skyline.
- Bridges, tunnels and roads with a non-zero `layer` are skipped. Complex roundabouts, merges and plazas can look rough. Steps and `area=yes` road surfaces are not supported.
- There are no interiors, traffic, collision setup, navigation or LOD. The scene is not a ready-to-play level.
- Large dense areas produce many objects. Check performance in your target engine.

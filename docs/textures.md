# Replacing textures

Every run writes its textures to `<output>/textures/`. To use your own, put a PNG with the **same file name** in `overrides/textures/`, or point `--textures DIR` at another folder. Every later run uses it, including runs from the web page. The command line prints each replaced texture, and `metadata.json` → `textureOverrides` lists them.

- Save as 8-bit, non-interlaced PNG (RGB, RGBA, grey or indexed).
- Any resolution works, but **keep the aspect ratio and the layout** of the original: the model's UVs are proportional. A different aspect ratio triggers a warning.
- Emissive maps (`*_emissive*`) are separate files. If you only replace the colour map, the original glow layout stays. If you move bright areas such as screens and lit panels, supply an emissive map too: black for no glow, bright for glow.

`overrides/` is listed in `.gitignore`, so your source images and textures stay out of the repository.

## Billboards

`Billboards_512.png` holds 8 slots of 256 × 128 px, in two columns and four rows. It is the only atlas with smooth (bilinear) filtering; everything else stays pixel-sharp. By default the slots hold eight pixel-art posters for fictional products, each with its own layout, drawn in `src/billboard-art.mjs`.

To use your own art, put 2:1 images in `overrides/source/billboards/` and run:

```bash
npm run textures:billboards
```

The tool gives the images a PS2 look:

1. It scales each image to 256 × 128, centre-cropping images that are not 2:1.
2. It reduces each image to 64 colours with median cut.
3. It adds 4 × 4 ordered dithering, like the 8-bit palette textures of the time.

For a rougher or cleaner look, change the colour count: `npm run textures:billboards -- --colors 32`.

With fewer than 8 images, the slots repeat. The tool also writes `Billboards_512.json` with the number of distinct images, and generation then only uses those slots, so identical ads do not end up side by side.

At night, billboards are lit by their floodlights, and the image doubles as a faint emissive map.

## Vending machines

`Vending_machines_512.png` and `Vending_machines_emissive_512.png` are 512 × 512:

| Part | Pixels | On the model |
| --- | --- | --- |
| Front | x 0–255, y 0–383 | 1.22 × 1.83 m face |
| Side | x 256–287, y 0–383 | |
| Top | x 288–319, y 0–31 | |

You can build both maps from a day and a night picture of the same machine. Use the same framing for both: front view on a plain background.

```bash
node tools/vending-texture.mjs day.png night.png
```

The tool:

1. Crops the background and the feet.
2. Scales the front to 256 × 384.
3. Takes the side colour from the cabinet edge.
4. Turns whatever stays bright at night into the emissive map: display window, buttons and screen.
5. Writes the result to `overrides/textures/`.

If the two pictures are given in the wrong order, it tells day from night by brightness. With both pictures in `overrides/source/` as `vending_day.png` and `vending_night.png`, `npm run textures:vending` does the same.

## Other atlases

| Texture | Content |
| --- | --- |
| `Facade_atlas_512.png` / `_emissive_` | 8 × 8 cells of 64 px. Rows 0–6 are facade profiles; columns 0–3 are upper floors, 4–7 ground floors. Row 7 holds loggias (0–3), plain wall (4), the loggia recess (5), and dark and lit curtain wall glass (6, 7). |
| `Neon_signs_512x….png` / `_emissive_` | Generated from the sign catalog; its layout changes whenever the catalog does. |
| `Shared_*_64.png` | Tiling materials on modelled parts: concrete, plaster, brick, glass, metal, roof |
| `Asphalt128.png`, `Concreteroad128.png`, `Stoneroad128.png`, `Ground128.png`, `Grass128.png` | Ground and road surfaces |
| `Street_props_128x64.png` | Small street props such as air-conditioning units |
| `Shared_window_posters_128x192.png` | Window posters |

Generated textures are original procedural images. None are taken from games.

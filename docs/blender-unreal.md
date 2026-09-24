# Blender and Unreal Engine

`city.glb` is plain glTF 2.0 with textures embedded. It needs no plugin.

- Units are metres. Y is up, X points east and −Z points north. `metadata.json` stores the real-world origin.
- Pixel textures use nearest-neighbour sampling; billboards use trilinear filtering.
- Glowing materials use `KHR_materials_emissive_strength`, so their emission can exceed 1 and drive bloom.
- Street lamps are one mesh instanced across many nodes.
- Emission is set up for night. For a daytime scene, turn down the emission of signs, windows (all `Facade atlas` materials), shop glass, vending machines and billboards.

Regenerating into the same folder overwrites the generated files and rebuilds `textures/`. Save edited versions elsewhere.

## Blender

Use **File → Import → glTF 2.0** and pick `city.glb`. Everything arrives with its textures and emissive materials.

- For bloom, enable it in the compositor (a Glare node on the render result) or in the viewport's post-processing.
- For night, darken the world colour and turn the sun off or down; windows, signs and lamps then carry the scene.
- For day, lower the emission strength of the window, sign and vending materials.

Tested with Blender 5.2.1 LTS.

## Unreal Engine

Import `city.glb` with the editor's built-in glTF importer (Interchange). No plugin or script is needed. It was tested with Unreal Engine 5.8 on the Berlin example:

- no warnings on import
- units converted to centimetres
- emissive strength, the alpha-masked rooftop letters and the instanced lamp rotations came through correctly
- pixel textures were imported with Nearest filtering

For first-person walking, enable collision on the static meshes in the import settings, for example "use complex collision as simple". Walking and collision have not been checked in the editor yet.

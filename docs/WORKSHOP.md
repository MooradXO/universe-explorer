# Universe workshop

Open `/environments.html` on the development or preview server. This replaces the earlier single-recipe viewer with a composite scene editor. The interface, library labels and validation messages are in English. Existing project names are preserved when importing saved work.

## Workflow

1. Add an object from the library or import an existing game world as a starting point. The 32 supplied worlds are examples, not a limit on creating new scenes.
2. Select an object in the scene or object list. The inspector contains its settings; shortcuts jump to rings, moons, clouds and other layers.
3. Change position, rotation and uniform scale with the on-screen gizmo or numeric fields. Parenting attaches a ring, moon, nozzle or other object to another object. Removing a parent removes its branch; Undo restores it.
4. Generate a new reproducible variant. Planets can use 64 surface presets, 128 material treatments, Solar System maps, colours and detail settings. Select a procedural surface to change generated geography and colours rather than a baked map.
5. Save a named project in the current browser. An automatic draft restores the last scene. Export JSON stores the full document, including parents, parameters and environment. Import also accepts the earlier seed/preset format. Invalid imports leave the current scene intact.
6. Capture A to retain a view. A/B compares that image with the live scene; it is not two independently running simulations. PNG exports a view without editor axes.
7. Open Fly in scene for a separate local preview using the game's ShipController, ship model and weapon visuals.

Flight controls: W/S thrust, A/D strafe, mouse steering, Shift boost, V camera, 1/2/3 weapon, left mouse fire, Escape release pointer. On touch devices, use the left flight/steering stick and the right FIRE button. Flight requires landscape orientation.

## Content and integration

The 17 types are groups, planets, separate moons, stars, separate rings, natural objects, object fields, structures, phenomena, ship/base models, Epic FX, black holes, ISS/Voyager probes, projectiles, engine nozzles, lights and impact effects.

There are 47 planet parameters, 16 scene settings and 185 inspector fields across the types, including shared planet/moon fields. The underlying game libraries are reused directly: 64 surfaces, 128 materials, 32 clouds, 24 atmospheres, 16 auroras, 32 rings, 32 natural object families, 48 field layouts, 24 structures, 32 phenomena, 24 moon styles, 12 moon orbit patterns, 69 FX presets and four ship/base models.

Rings, clouds, atmosphere, aurora, generated moons and separate objects can coexist. Solar System moons import as separate objects with their original relative coordinates. Ship controls cover model, transform, hull tint and roughness. The player model supports its configured engines; individual nozzles can be added and parented to other models.

Scene settings include nebula background, artistic stars, lights, exposure and warp presentation. These do not change the astronomical catalogue. Preview flight tests appearance and controls; it does not include network bots, economy, authoritative combat or full server physics. It uses separate editor storage and does not publish projects to the shared universe.

## Limits and storage

- 64 scene objects; up to six detailed planet/moon objects, four Epic FX and four additional lights.
- Up to 12 generated moons per planet and 600 instances per field.
- HIGH/LOW adjusts geometry, detail maps and particle budgets.
- 12 named projects and 40 undo steps.
- JSON documents up to 512 KiB, validated for types, ranges, references and parent cycles.

These are interactive browser budgets, not limits on the number of possible designs. If browser storage is unavailable, use JSON export. Clearing browser storage removes local drafts and projects; exported JSON is portable.

## Code

`SceneDocument.ts` defines the format, library and validation. `SceneComposer.ts` integrates game renderers and resource disposal. `Editor.ts` and `Inspector.ts` implement editing. `SceneHistory.ts` provides undo/redo. `PlayMode.ts` implements isolated preview flight.

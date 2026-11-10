# Project guidance

For UI work, read BRAND_GUIDELINES.md and reuse the local Movavi Mobile SVG and Aeroport fonts. Keep mobile effectType, effectName, shaderPath, preset UID, resource references and pass graphs stable when editing imported collections. Mobile exports always use all_in_one.json plus Layers.zip; user media selected for preview must never be included in a preset export unless explicitly selected as an overlay/LUT resource.

Keep working files local in the browser. Clearly distinguish video review exports from the package consumed by the mobile app, and mark effects requiring app integration. Validate creation, import/export roundtrip, referenced assets and batch video export when changing those flows.

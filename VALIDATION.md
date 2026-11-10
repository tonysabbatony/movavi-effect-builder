# v0.13.1 — independent Posterize Time FPS — 2026-11-10

- Fixed framesPerSecond input (5–30, default 15), independent of linked cadence strength. Global 0% bypasses; 100% holds at the selected rate; intermediate values blend source/held frames.
- Actual Metal .ps/.vs compiled and rendered: 78 sequences / 9282 frames per compiler mode, fast math on and off. Includes old configs, independent 5/15/30 fps and strengths 0/50/100%, both RGBA8/BGRA8. Blend tolerance 1/255; no phone integration claim.
- JS: 10800 independent-rate decisions in addition to 3600 legacy decisions; range errors, upgrade/idempotence, stable paths/passes.
- Chrome UI: choose 5 fps at strength 100, exact zero-strength bypass, real MP4 decode, FPS persisted through ZIP/reopen, 30 fps edit. Existing collection creation/roundtrip and external resource collision checks pass.
- Legacy imports gain a fixed 15 fps input and updated shader source copies; names and pass graph remain stable. Developer handoff documents the appended uniform and required global shader replacement.

# v0.13 — flexible workspace and review export — 2026-11-10

- Real UI: new collection with two presets, all 12 catalog effects and repeated Sharpen, external MP4/CUBE, separate preview image. Exported/reopened nested ZIP; checked UID/group, 16-pass Bloom graph, resource names and exact external bytes; preview input excluded.
- Decoded ten actual Before/After MP4 exports from ten differently configured presets. Expected named folders, distinct After colors, original AAC audio tone and short source duration. Encoder warm-up prevents a cold first encode adding about 0.8 s of silence. Selection, disabled layer, paused position and playback settings restored; cancellation unlocks controls.
- Posterize Time through new collection/common catalog: 11 held frames over about 2.1 seconds at 5 fps; 100% bypass pixel-identical. Decoded MP4: 4.021 s, 960x270, 60 Before changes and 10 After changes over a 2-second sample. Export/reimport passes.
- Dreamy regression: ten originals, edited/reset controls, observed pixel change, preset switching, export/reimport, selected preset export; no browser runtime errors.
- Twelve isolated native config factories, stable paths, case-insensitive allocation, safe new IDs. Existing contract/ranges/import/ISF/schedule/launcher checks pass.
- Official Mobile SVG loads with unchanged proportions; Aeroport local fonts load; accent #89FE00. Sources in BRAND_GUIDELINES.md.

VHS, Soft Blur and Noise web rendering is approximate and labelled. Export uses existing mobile types. Posterize Time requires app integration; phone/Android playback not verified. Review videos are real-time SDR preview captures; heavy effects can reduce smoothness. Browser CI exercises creation/roundtrip and ten video decodes.

# v0.12 — mobile preview semantics and native stage verification — 2026-10-28

This section supersedes historical v0.11 statements about DEFAULT-only editing,
the approximate Adjust implementation and the unverified Bloom algorithm.

Implementation evidence is listed in MOBILE_RENDER_SOURCES.txt. Source checkout
is read-only at a45198aa5e9006a0dc9c18ca07208dbebae68eb1. The user confirmed
that the delivered New_Bloom_Metal_Package_v3 algorithm was integrated unchanged.
The corresponding Desktop/DUMP v3 Metal source and Builder Bloom JS match by SHA256.

Changes:
- Adjust: replaced the approximate CPU formula with the native five-stage chain,
  parameter ranges, HSL/Lab transforms, rational Kelvin coefficients, integer
  blackPoint-to-gamma mapping, display-referred Rec.709 linear conversion,
  RGBA8 stage boundaries and half-float conversion buffers.
- ISF: linked parameters resolve from MIN/MAX at the current global intensity.
  Original resource values are not modified on load. Main linked controls edit
  the 100% endpoint and DEFAULT together; fixed controls edit DEFAULT. Both
  endpoint fields, fixed/linked toggles and complete resource reset are supported.
- LUT: matches native normalized hardware 3D sampling, input*n - 0.5 with clamp.
  The app's actual Trilinear mode is shown read-only; JSON is preserved.
- Default workspace is now a byte-identical copy of the confirmed Dreamy rework
  reference (all 110 Layers files and all_in_one.json), not the older demo collection.
- Full mobile export contract remains all_in_one.json plus nested Layers.zip;
  canonical new_bloom_01/isf and complete shaderConfig are retained.

Native verification, Apple M4, runtime Metal compilation, Chrome 156:
- tests/extract-native-oracle.py extracts original engine kernel bodies,
  shared color functions, structs and temperature coefficients without editing
  the checkout. tests/native-oracle.mm independently constructs native settings.
  It uses iOS RGBA8 boundaries and RGBA16Float linear intermediates, with the
  source's default display-referred BT.1886 transfers. Compiler fast math is off.
- Two inputs: a 32x24 synthetic color pattern and the exact browser-decoded frame
  at 1.000 s of local IMG_4987.MOV, scaled to 180x320. No screenshot color sampling
  or per-preset tuning. Native and browser receive identical RGBA source bytes.
- All 10 presets at global intensity 0, 0.5 and 1: 60 Adjust-only comparisons,
  60 LUT-only comparisons and 60 Bloom-only comparisons: PASS.
- Adjust maximum error 4/255 at isolated synthetic pixels; worst mean error
  0.06934/255. Video-frame maximum is 3/255. Different floating-point arithmetic
  at quantized intermediate boundaries can be amplified by the final gamma.
  Assertion: maximum <=4/255 and mean <0.1/255 for every case.
- LUT maximum error 1/255; worst mean 0.02051/255. Assertion maximum <=1/255.
- Bloom v3 maximum error 1/255 for all 60 cases. Independent native v3 suite
  also passes its 9 synthetic cases, alpha, zero/opacity bypass, repeated sizes,
  concurrent slots and invalid-value rejection.
- Synthetic native golden fixtures (30 cases per stage) and source hashes are
  included in test-assets/native-mobile; personal source-video frames are not.
- tests/test-isf-mobile.cjs: PASS, 180 parameter values = 10 presets × 3 global
  intensities × 6 inputs; exact authored JSON preserved by preview calculations.
- tests/test-bloom-ui.cjs: PASS, all 10 original resources equal the source on
  import; 6 real controls; linked 0/50/100%; fixed toggle; exact full reset;
  edited MIN/MAX/DEFAULT retained through mobile export and reimport.
- test-mobile-e2e.cjs and verify-mobile-package.py: PASS. Import, controls, reset,
  threshold edit, preview pixel change, preset switching, nested export and
  reimport. 10 recipes, full pass graphs, 70 valid JSON, 40 byte-identical assets;
  only the intentional threshold.DEFAULT edit differs from the reference.
- test-migration-e2e.cjs: PASS for bloom and bloomRework. Migration now retains
  legacy linked curves or fixed values, instead of applying template MAX silently.
- 24 range checks, 14 contract/migration checks, package duplicate-import checks,
  actual launcher test: PASS. No caching and correct v0.12 served from an unrelated cwd.
- Full pipeline smoke test: all 10 reference presets render the captured source
  frame without errors. Existing seven renderer/workflow/UI HTML checks pass.
- 259 pre-existing v0.11 and Dreamy rework file hashes are unchanged.

Quick reproduction with included synthetic goldens (Node, Playwright, Chrome):
1. Start `python3 -m http.server 8766 --bind 127.0.0.1` in this folder.
2. `node tests/compare-native-browser.cjs http://127.0.0.1:8766 test-assets/native-mobile/adjust workspace/Dreamy_rework`
3. `node tests/compare-bloom-native.cjs http://127.0.0.1:8766 test-assets/native-mobile/bloom`
4. `node tests/test-isf-mobile.cjs`
5. `node tests/test-bloom-ui.cjs http://127.0.0.1:8766 /path/to/Dreamy\ rework`
6. `python3 test-launcher.py`

Native regeneration on macOS/Xcode: run tests/extract-native-oracle.py with
the checkout's multimedia/ext/mmc/src/Movavi/Proc directory and a scratch folder.
Compile tests/native-oracle.mm with clang++ -std=c++17 -fobjc-arc, scratch -I,
-framework Foundation -framework Metal. Pass scratch, reference, results and
optional frame.json. Bloom oracle compiles tests/bloom-oracle.mm with the
unchanged v3 NewBloomRenderer.mm and its native include directory. Keep outputs
in a scratch directory. No project or reference sources need modification.

Limits: verified against checked native host/kernel sources and the user-confirmed
delivered Bloom v3, on identical SDR Rec.709 pixel buffers. The running phone's
complete decoder/display pipeline, HDR/P3 and a synchronized full-chain phone
capture were not independently measured. Cross-GPU pixel identity is not claimed.

Historical validation records follow.

# v0.11 — mobile ISF Bloom2 package — 2026-10-28

Validated in installed Google Chrome 156, headless, on macOS.

Follow-up: actual launcher / reported unsupported preview (2026-10-28).
- Both already-running servers, ports 49467 and 62485, served v0.10. Their
  app.js bytes matched the untouched v0.10 source and had no BloomContract.
- Reproduced the exact reported error on port 62485 with an extracted copy of
  the working developer reference: new_bloom_01, unsupported preview, 0 controls.
  Same files on v0.11 launched by START_MAC.command: 6 controls, no render errors.
  Port collision was ruled out: launchers bind port 0 (OS-selected free port).
- Started the actual v0.11 START_MAC.command from outside its directory. It
  opened Chrome at port 62683 with version=0.11 and the correct project path.
  Server now emits no-store headers; the old static calibration banner is gone.
- `python3 test-launcher.py`: PASS. Actual starter, unrelated cwd, exact served
  JS bytes, version/path/URL checks, cache headers, updated banner. Test-owned
  subprocess is terminated; user-owned old servers remain untouched.
- Found and fixed a distinct import issue: Dreamy rework now contains both the
  ZIP and identical extracted Layers. Identical duplicates are accepted;
  differing duplicates are explicitly rejected to avoid choosing user data.
  `node test-package-import.cjs`: PASS for ZIP-only, duplicate-identical,
  duplicate-conflicting and unpacked-only cases.
- Repeated the full reference edit/export/reimport E2E through launcher port
  62683, including the folder with both ZIP and extracted files: PASS.
  Independent ZIP/CRC/JSON/asset-preservation validator: PASS again.
- Also imported DREAMY_NEW_EDITED_Metal_v3, Glow_Edit_Main_v2 and
  Glow_New_Collection_v1 through the launcher server, loaded a test image and
  rendered all stages: 10 presets each, no preview/runtime errors.
- Mac launcher was executed; Windows batch changes were statically checked
  (quoted absolute script path and error handling); Windows execution unavailable.

- `node --check` for app.js, bloom-contract.js and mobile-package.js: PASS.
- `node test-ranges.cjs`: PASS, 24 existing boundary checks, inputs unchanged.
- `node test-mobile-contract.cjs`: PASS, 14 checks covering migration,
  six DEFAULT edits, retained metadata, malformed resources and preview mapping.
- `node test-migration-e2e.cjs URL`: PASS for both bloom and bloomRework.
  Real folder input, UI parameter edit and nested ZIP export; canonical ISF
  recipe/resource, unchanged unrelated JSON and binary data, updated manifest.
  Authored intensity above the reference MAX is preserved without clamping.
- `node test-mobile-e2e.cjs URL REFERENCE_FOLDER OUTPUT_ZIP`: PASS.
  Copies reference to a temporary folder before import. Imports all_in_one.json
  plus compressed Layers.zip; exercises all six controls; changes threshold to
  0.321; observes changed preview pixels; switches presets; exports; unpacks the
  outer ZIP; reimports the actual exported Layers.zip and confirms the edit.
  Selected-preset export also uses the nested ZIP format and a matching manifest.
  No browser runtime errors. Packed imports cannot overwrite the original ZIP.
- `python3 verify-mobile-package.py REFERENCE_FOLDER OUTPUT_ZIP`: PASS.
  Outer ZIP contains exactly all_in_one.json and Layers.zip. Both ZIP CRC checks
  pass. Inner tree has all 110 original non-metadata files: 70 valid JSON and
  40 byte-identical binary assets. Manifest equals the reference. All 10 recipes
  use new_bloom_01 / isf, all Bloom2 resources retain full INPUTS and 16 PASSES.
  Only Glow_Preset_01 threshold.DEFAULT differs (0.321); all other JSON data
  equals the reference. No legacy bloom/bloomRework effect types or flat Bloom
  parameter resources are exported. Original DESCRIPTION strings are preserved,
  including historical text mentioning migration from bloomRework.
- Default bundled collection: PASS, load/migrate/export in Chrome. All 110
  files retained, other effect JSON and all binary assets unchanged. Bloom
  actualValue values transfer to ISF DEFAULT without changing authored values.
- Existing renderer checks: verify.html, verify-bloom.html, verify-rework.html:
  PASS (independent calculations, alpha preservation, neutral states, stability).
- Existing UI/workflow checks: integration-check.html, verify-workflow.html,
  verify-rework-ui.html, verify-radius.html: PASS. Old assertions/selectors were
  updated for current preset labels, fixed-parameter behavior, the import dialog
  class and Bloom2 controls; test iframes use ?empty to avoid bundled-load races.

Reproduction: run a local HTTP server in this folder, e.g.
`python3 -m http.server 8765 --bind 127.0.0.1`. URL above is
`http://127.0.0.1:8765`. Browser CLI tests require Node, Playwright and Google
Chrome. Python validator and Node contract/range tests use standard libraries.
Original v0.10 and developer reference were compared with pre-change SHA-256
hashes and remain unchanged. Actual installation in the mobile application was
not performed here; compatibility checks use the user-confirmed working package.
Browser New Bloom preview retains the existing renderer through an ISF adapter;
pixel identity with the application's Bloom2 implementation is not asserted.

The following records are historical; v0.11 supersedes flat Bloom export notes.

# v0.10 — review-video export and Metal v3 serialization — 2026-10-27

Chrome headless with SwiftShader on this Mac. Primary video checks use default
Chrome autoplay policy, an independently encoded H.264/AAC fixture with a known
color change halfway through, and decoded output frames/audio (not just a mocked
MediaRecorder or filename check).

- Before, After and side-by-side comparison export playable MP4 files. Filename
  contains preset ID, source basename, mode and timestamp. The whole 2.333 s input
  is recorded from zero regardless of the current preview position. Output duration
  is within .35 s of source in the assertion; observed drift was under .1 s.
- Before preserves the fixture's early/late colors within lossy codec tolerance;
  After contains a measurable New Bloom change and preserves the source transition.
  Source audio is detected after export; the audio-off case is silent. Labels add
  a header rather than cropping the image. Comparison output has both panels.
- Current source time, loop, mute and Play/Pause are restored after completion;
  playback resumes when it was originally running. Cancel discards partial output.
- Maximum comparison dimensions 1920x1040 are encoded and decoded as H.264 MP4.
  MP4 uses Baseline level 4 to allow these dimensions. A real WebM fallback was
  exercised by disabling MP4 capability detection. FFmpeg independently decoded
  the large MP4, WebM and recovery output without errors.
- Missing overlay prevents a misleading After export and reports the missing file;
  a later Before export succeeds. Export also runs under file:// with fetch blocked.
- Existing collection test: all ten complete stacks render; Sharpen reference,
  layer insertion/import, edited group/single ZIP and roundtrip checks still pass.

Metal v3 / DREAMY inspection:
- bloom-rework.js SHA-256 matches the reference extracted from the user-supplied
  Metal v3 ZIP exactly: 3313649548d4a1a8c0f975929e2aa99b999db5cab96fbfd34a44a0280ea8fd06.
- The user's DREAMY archive already uses bloomRework with six valid effective
  parameters. Renaming bloom_01 to new_bloom_01 is alignment with the example,
  not a proven requirement of its generic effectName resource lookup.
- Prepared a separate copy: fixed endpoints equal actualValue, canonical example
  resource names and matching manifest. 31 JSON paths differ/are renamed; every
  non-JSON byte is unchanged. No source Documents files were modified.
- All effective values match at master 0/.1/.25/.5/.75/1, and all ten Solo Glow
  preview frames are byte-identical before/after normalization. All ten full DREAMY
  stacks also render without errors. File-mode video export of the full DREAMY
  stack (including Noise and LUT) passed after awaiting actual overlay frames
  during startup/loop seeks. Original order,
  hardCoded flags, linked curves, actualValue values and other configs are retained.
- Builder normalizes only fixed New Bloom endpoints on load/save/ZIP; linked
  authored endpoints are retained. Range validation still blocks invalid used values.

Limits: no TestFlight/iPhone verification was possible and the previously working
archive was unavailable. The root cause of the skipped native Glow is NOT confirmed.
The local source checkout lacks bloomRework registration, but this does not establish
what code is in the user's installed TestFlight build. Correct JSON cannot install
or register a native shader. Developer must check the actual build and layer logs.
Video export records browser SDR preview (up to 960 px per panel), targets 30 fps
but can lose smoothness under load; it is not an offline frame-exact native render.
Long exports, hidden-tab interruption and Safari were not separately tested.

--- Earlier validation history ---

# v0.9: linked parameters and standard Reset — 2026-10-16

Chrome headless with SwiftShader, local HTTP server. All nested and top-level
numeric controls now edit actualValue when fixed and intensityMax when linked;
the latter also updates actualValue as the authored target. ISF uses equivalent
DEFAULT/MAX fields through adapters; the native recalculation is unchanged.

Verified Adjustment saturation slider at target .8 resolves to .5/.65/.8 at
master 0/50/100%; neutral Adjustment is an exact source-copy bypass. Fixed
saturation remains .65 at master zero, and unlinking creates a neutral .5
lower endpoint. Verified editable linked Bloom radius and threshold, Sharpen
amount and step size, Overlay and LUT. Endpoint controls and effective values
stay synchronized. Neutral-at-zero normalizes linked lower endpoints while
preserving fixed settings; explicit existing endpoints are not changed on load.

Reset restores standard settings for Adjustment (all eleven .5), New Bloom,
Sharpen, LUT, Overlay and Aberration. Reset from custom preset 10 restores radius
75 instead of its loaded 300 and resets warm/non-neutral adjustments to .5.
Exported production JSON and Sharpen ISF config contain the expected linked,
fixed, reset and neutral-endpoint values. No unexpected alerts or JS errors.
Numerical defaults for Aberration are from the checked native Settings header;
New Bloom defaults are the earlier native v3 contract. Other listed editor
defaults are documented in README_RU.txt. The application-level Overlay skip
at master zero is intentionally preserved to match ShaderBuilderImpl.kt.

# v0.8: LUT control, media switching, legacy Bloom migration — 2026-10-16

Layer removal: verified selected and solo layer removal, exported recipe omission,
valid manifests for all 10 presets, undo history scoped to each preset, restoration
of original order and configuration, deleting an entire stack then restoring it,
adding a new Sharpen after removal without filename collisions, and removing a
video-overlay layer without render errors. Resource files are retained; only the
recipe is changed. No dialogs or JavaScript errors in this workflow.

Chrome headless with SwiftShader, HTTP and normal file:// launch.
LUT control is enabled for both linked and fixed configurations. Verified
intensity zero copies the source, nonzero strength visibly changes pixels,
master 50% resolves .8 to .4 with zero lower endpoint, and switching to fixed
retains the current appearance. Fixed .25 remains unchanged at master zero.
Endpoint numeric fields stay synchronized with the slider. Both linked and
fixed settings export to their native JSON fields; test media is excluded.

Loaded five different H.264 MP4 files in one picker selection without a workspace.
Verified first-file autoplay, switching all five via dropdown, previous/next and
boundary buttons, fast repeated switching with stale-load cancellation, appending
an image, video/image transitions, and recovery after selecting a corrupt MP4.
Media selection persists when a workspace is opened. No unexpected dialogs or
JavaScript errors were observed in the completed LUT/media workflow.

Opened all 10 original presets from GLOW FOR EDIT. Verified legacy Bloom UI and
tabs are absent, each recipe exports bloomRework with six parameter objects,
threshold/intensity/radius objects remain identical to their source, and newly
added knee/scatter/opacity are fixed. No files in the source folder were written.
This migration changes the algorithm; visual equivalence to old Bloom is not claimed.

# v0.7.1: direct file launch — 2026-10-16

Reproduced the user's direct file:// launch in Chrome headless with SwiftShader,
without an allow-file-access browser flag. After initial script loading, replaced
window.fetch with a throwing function so any hidden resource-fetch dependency
would fail. Verified bundled-folder chooser, + Sharpen, pair import of .ps/.vs,
import of only .ps using the embedded matching .vs, visible pixel changes and
full group export. All passed without JavaScript errors or unexpected alerts.
Exported ZIP retained all added layers and source pairs, and its resources lists
matched the files. No Web Crypto dependency remains for source validation;
uploaded shader bytes are compared directly with the embedded trusted source.

# v0.7: New Bloom, Sharpen, group export — 2026-10-16

Chrome headless with SwiftShader, local HTTP server. Ten loaded profiles rendered
with New Bloom, supplied Sharpen, LUT, adjustment, aberration and video overlay.
No unexpected alerts or JavaScript errors in the completed workflow test.

Sharpen matches an independent CPU calculation of the supplied four-diagonal-tap
formula with bilinear clamp-to-edge sampling: maximum error 1/255 on opaque
64×64 input; 3613 RGB bytes changed. Zero strength bypass is byte-exact.
This verifies the browser reference against the formula, not full iPhone parity.

Verified: + Sharpen button; direct import of known Sharpen.ps/.vs; rejection of
different source code without creating a false preview; editing parameters;
reordering; fixed/linked ISF settings; full-group ZIP export and reopening that
ZIP; selected-preset export. Edited New Bloom radius and Sharpen DEFAULT /
intensityParamNames survive the round trip. Existing 24 range checks pass.

Archives: all_in_one.json is at ZIP root; recipes and assets retain Layers paths;
manifest resources match the files present in each preset; all ten recipes contain
bloomRework and ISF Sharpen with shaderPath v1/Sharpen/Sharpen. Every preset has
Sharpen.ps/.vs matching the source ZIP and the checked app bundle byte-for-byte.
No root-level Sharpen files, enclosing wrapper directory, or macOS metadata.

Source asset correction: lut_07.cube declares 33 but contains exactly 32^3 entries;
row 32 resets red and row 1024 resets green, confirming the 32-entry axes.
Only LUT_3D_SIZE was changed to 32. All colour table rows are unchanged. Other
LUT files and all MP4 assets are byte-identical to the supplied source ZIP.

User reports New Bloom and Sharpen are integrated in TestFlight. The local app
checkout confirms the Sharpen bundle path and byte-identical source pair, but
does not contain the user's newly integrated bloomRework. The JSON contract from
the previously delivered native v3 package is used. No app checkout was modified,
and no device/TestFlight import was performed in this iteration. Final visual
review of the new preset settings and full-pipeline parity remains on device.

## Historical checks from earlier versions

# v0.2.1: результаты проверки

Перенесён ChromaticAberrationMultiPass из локального EffectsCollection.metal (строка 1332): радиальное направление, 64 выборки, overlap, линейная интерполяция и clamp_to_edge.

Встроенный браузер: 10 GPU-тестов на двух размерах (31×23 и 24×32), strength 0/0.03/0.25/1, overlap 0/0.5/0.85/1. Максимальная ошибка против независимого CPU-расчёта: 1/255. Все тесты прошли.

Проверены сила 0/50/100%, fixed HC, обратный диапазон, неизменность исходной конфигурации при вычислении.

Интеграционные проверки прошли: загрузка пресета и SVG; правильное применяемое значение при несовпадающем actualValue; общая сила; Solo без правки JSON; работа шейдера; ZIP сохраняет значения и неизвестные поля; изменение Max; переключение HC.

Также загружен реальный Glow 01 из контейнера эмулятора только для чтения; интерфейс показал Bloom intensity=0.8 при actualValue=0.35 и силе 100%.

Не выполнены: сравнение с пикселями запущенного Movavi, проверка HDR/прозрачных источников, большой видеофайл и устойчивый fps. Preview ограничен 960 px и Canvas 8-bit. Adjust ещё приблизительный, LUT/Noise не откалиброваны. Эти ограничения отображаются в интерфейсе.

verify.html и integration-check.html позволяют повторить проверки через локальный сервер.

## Bloom

16 GPU-тестов: два размера, Threshold 0/0.3/0.8/0.99/0.9999, Intensity 0/0.8/1/2/3/10, Radius 0/7/7.9/75/95/4294967295. Все прошли; максимальная ошибка независимого CPU-расчёта против WebGL — 1/255.
Семь недопустимых/особых случаев обнаружены до запуска GPU, включая Threshold=1 и округление 0.99999999 до единицы в Float32. Проверены пять конечных порогов, включая 0.99999994.
Равномерный серый 128/255 перестаёт давать RGB-добавку примерно при Threshold 0.522876 (25/24 * 128/255); это пример, не универсальный предел.
В ~/Library/Logs/DiagnosticReports не найдены файлы с Movavi/PhotoEditor в названии. Это не доказательство отсутствия сбоев и не проверка логов iPhone. Нативное приложение не подвергалось краш-тесту.

Проверка интерфейса Bloom: в отдельном тестовом пресете Threshold изменён с 0.3 на 1. Редактор показал сообщение о делении на ноль и не применил слой. Рабочие JSON Movavi не изменялись.

## Интерфейс v0.2.1
В браузере при 1280×720 проверен полный кадр, видимый Before/After и нижняя заметка. У страницы overflow-y:auto; у canvas object-fit:contain. Попытка проверить 900×600 через инструмент изменения viewport сохранила фактический viewport 1280×720, поэтому этот размер отдельно не подтверждён.

## v0.3 — 2026-09-29
Browser integration-check.html: all 15 assertions passed. Added checks for 800px preview, resizing to 1000px, Noise slider 0–1 with author max .17, and editing Noise to 1. Existing export preservation, master interpolation, fixed mode, Solo and dirty state checks passed. Fullscreen button added; native fullscreen not independently tested. GPU rendering unchanged from v0.2.1. No new native Movavi parity or crash tests performed.

## v0.4 — 2026-09-30

Source audit: CompositeEffectUtils.kt, ShaderBuilderImpl.kt, ISFPathBuilder.kt,
VideoEffectInput.kt, AddOrReplaceCompositeEffectUseCase.kt, ResourceExt.kt,
OverlayFrameFilterExt.kt and native SettingsEffect classes in local multi_superapp.
Verified JSON semantics, overlay basename lookup (MP4/MOV), binding/blend enum strings,
ISF bundle lookup and native bounds. SoftBlur depth is 1–10, VHS blurAmount 0–5.

- test-ranges.cjs: 24 boundary/schema tests pass, including inactive author fields,
  descending endpoints, strict Boolean hardCoded and float32 threshold rounding.
- integration-check.html: existing 15 assertions pass.
- verify-workflow.html: 14 assertions pass with real production Noise_01.mp4:
  video autoplay before preset, continued playback on preset load, overlay pixel difference,
  top-level hardCoded false serialized, 50% interpolation, importing a second overlay,
  reordering exported recipe, asset bytes in ZIP, replacement while playing,
  basename serialization, invalid intensity blocked, new JSON/video direct-save flow.
  File System Access handles in direct-save test are in-memory substitutes; production
  directories are never written during tests. No real OS picker automation assertion.

Known limits: no all-pipeline Metal/browser pixel parity proof. Adjust remains approximate;
Canvas overlay colors/blends and non-center transforms require calibration. Additional
native/ISF types may be imported/exported but have explicitly unsupported browser preview.
ISF cannot be installed in Movavi by adding files to preset ZIP. Stress/crash limit on native
Movavi has not been measured. ZIP is one preset folder, not rebuilt all_in_one collection.

## v0.5 Bloom Rework
9 shader checks passed: nonidentity, difference vs legacy, alpha preservation, exact bypass at opacity/intensity zero, threshold1, resize/repeat stability, independent uniform-color reference, no added haze on dark uniform input. 6 integration assertions passed: toggle, dirty-state preservation, opacity zero, exact legacy restoration, no shader errors, experimental fields absent from production ZIP. Tested WebGL2 RGBA16F. 640x360 30 draws including output pixel readback: median 2.5–2.7ms, p95 2.8–4.3ms across observed runs. Not a native/mobile/full-video benchmark. RGBA8 fallback not separately exercised. Browser implementation only; no Metal deployment.

## v0.6
11 independent-control assertions passed: separate six controls, old/new state isolation in both directions, persistence while switching, isolated reset, production ZIP separation, error-free preview. Kernel unchanged from v0.5. See separate native Metal v2 package for native validation.

## v0.6.1 — LUT file selection fix

Проверено в браузере на реальной папке `Glow_Preset_02` из iOS Simulator. Исходный
`lut_02.cube` найден автоматически. Через кнопку слоя выбран другой production LUT
`lut_03.cube`: интерфейс подтвердил `33×33×33`, выбранный файл напрямую привязался
к слою, Solo LUT отрисовался без `renderErrors`. Замена отмечает изменённым сам
`.cube`, не JSON ресурса. Повторно прошли `integration-check.html` (15 проверок) и
`verify-workflow.html` (14 проверок). Системный выбор папки и файла проверен через
реальные browser file chooser events; production-файлы при проверке не изменялись.

## v0.6.2 — extended New Bloom reach

New Bloom сохраняет прежний результат в старых диапазонах. Радиус расширен с 150
до 300, а ширина ореола — с 1 до 2. Участок ширины 1–2 плавно переносит вес в самый
широкий уровень пирамиды без отрицательных весов. Радиус выше 150 увеличивает шаг
размытия с ограничением 4.5. Браузерный и Metal-вариант обновлены одним алгоритмом.

Проверено: оба новых максимума отображаются в интерфейсе, JavaScript проходит
синтаксическую проверку, Metal-вариант выполняет radius=300/scatter=2 на Apple M4 и
собирается для arm64 iOS. Headless Chrome в этой сессии не дал надёжных WebGL-пикселей;
финальное визуальное сравнение расширенного участка следует повторить в обычном Chrome.

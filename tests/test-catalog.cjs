const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ctx={};ctx.window=ctx;vm.createContext(ctx);
for(const name of ['bloom-contract.js','sharpen-assets.js','effect-catalog.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),ctx);
const C=ctx.EffectCatalog,posterize=JSON.parse(fs.readFileSync(path.join(root,'shaders/PosterizeTime/PosterizeTime.json'),'utf8'));
assert.equal(C.items.length,12);assert.equal(new Set(C.items.map(i=>i.id)).size,12);
for(const item of C.items){const cfg=C.config(item.id,{posterize});assert.ok(cfg&&typeof cfg==='object');const first=JSON.stringify(cfg);if(cfg.shaderConfig)assert.ok(Array.isArray(cfg.intensityParamNames));else if(item.type==='overlay'||item.type==='lut')assert.equal(typeof cfg.hardCoded,'boolean');cfg.extra='changed';assert.equal(JSON.stringify(C.config(item.id,{posterize})),first);}
assert.equal(C.config('bloom').shaderPath,'v1/Bloom2/Bloom2');assert.equal(C.config('sharpen').shaderPath,'v1/Sharpen/Sharpen');
assert.equal(C.unique('Noise_01',['noise_01','Noise_02']),'Noise_03');assert.equal(C.unique('my_adjust',['my_adjust']),'my_adjust_02');assert.equal(C.unique('Overlay',['Other']),'Overlay');
for(const invalid of ['../file','','a/b','a\\b',' Name','x:y','.hidden','а'])assert.throws(()=>C.identifier(invalid));
const manifest=C.manifest('custom','Glow_01');assert.equal(manifest.items[0].uid,'Glow_01');assert.equal(manifest.items[0].effect_type,'composite_effect');assert.equal(manifest.groups[0].group_id,'custom');
console.log('PASS 12 isolated mobile templates, canonical shader paths, case-insensitive names, identifiers and collection manifest');

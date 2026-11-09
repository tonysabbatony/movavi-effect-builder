/* node test-mobile-contract.cjs — no external dependencies */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/bloom-contract.js','utf8'),ctx);
const B=ctx.BloomContract,p=v=>({actualValue:v,intensityMin:0,intensityMax:v,hardCoded:false});
let count=0;
for(const type of ['bloom','bloomRework']) {
  const old={threshold:p(.432),intensity:p(1.7),radius:p(217),knee:p(.23),scatter:p(1.1),opacity:p(.7)};
  const before=JSON.stringify(old),cfg=B.migrate(old);
  assert.equal(JSON.stringify(old),before);
  assert.equal(cfg.shaderPath,'v1/Bloom2/Bloom2');assert.equal(cfg.shaderConfig.PASSES.length,16);
  assert.deepEqual(Array.from(cfg.intensityParamNames),Array.from(B.names));
  for(const name of B.names)assert.equal(cfg.shaderConfig.INPUTS.find(p=>p.NAME===name).DEFAULT,old[name].actualValue);
  assert.equal(B.issues(cfg).length,0);assert.equal(cfg.threshold,undefined);
  const copied=B.migrate(cfg);assert.equal(JSON.stringify(copied),JSON.stringify(cfg));
  for(const name of B.names) {
    const edited=JSON.parse(JSON.stringify(cfg)),input=edited.shaderConfig.INPUTS.find(p=>p.NAME===name);
    const original=JSON.parse(JSON.stringify(cfg));input.DEFAULT=.123;input.MAX=.123;
    const expected=original.shaderConfig.INPUTS.find(p=>p.NAME===name);expected.DEFAULT=.123;expected.MAX=.123;
    assert.equal(JSON.stringify(edited),JSON.stringify(original));
    const preview=B.preview(edited,1);assert.equal(preview[name].actualValue,.123);
    assert.equal(B.preview(edited,0).intensity.actualValue,0);count++;
  }
  const broken=JSON.parse(JSON.stringify(cfg));delete broken.shaderConfig.PASSES;
  assert.ok(B.issues(broken).length);count++;
}
const fixed={intensity:{...p(.29),hardCoded:true}},migrated=B.migrate(fixed);
assert.equal(migrated.intensityParamNames.length,0);assert.equal(B.preview(migrated,1).intensity.actualValue,.29);
console.log('PASS '+count+' Bloom2 migration, linked endpoint edit, fixed DEFAULT, metadata preservation and preview checks');

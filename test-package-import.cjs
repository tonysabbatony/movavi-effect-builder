/* Regression: a folder may contain both Layers.zip and identical unpacked files. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const ctx={Blob,File,TextEncoder,TextDecoder,Response,DecompressionStream,Uint8Array,DataView};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('  function buildZip('),source.indexOf('  function downloadBlob('))+';this.zip=buildZip;',ctx);
vm.runInContext(fs.readFileSync(__dirname+'/mobile-package.js','utf8'),ctx);
(async()=>{
  const name='Layers/video_effects/v1/composite_effect/Glow_Preset_01/resources/test.bin';
  const bytes=new Uint8Array([0,1,2,255]);
  const archive=ctx.zip([{name,bytes}]);
  const base=()=>new Map([['fixture/Layers.zip',{file:archive}]]);
  const files=base();assert.equal(await ctx.MobilePackage.expandLayers(files),true);
  assert.equal(files.has('fixture/Layers.zip'),false);
  assert.deepEqual(new Uint8Array(await files.get('fixture/'+name).file.arrayBuffer()),bytes);
  const duplicates=base(),existing={file:new File([bytes],'test.bin'),handle:{sentinel:true}};
  duplicates.set('fixture/'+name,existing);await ctx.MobilePackage.expandLayers(duplicates);
  assert.equal(duplicates.size,1);assert.equal(duplicates.get('fixture/'+name),existing);
  const conflict=base();conflict.set('fixture/'+name,{file:new File(['changed'],'test.bin')});
  await assert.rejects(()=>ctx.MobilePackage.expandLayers(conflict),/разные версии файла/);
  assert.equal(await ctx.MobilePackage.expandLayers(new Map()),false);
  console.log('PASS archive-only import; identical duplicates deduplicated without replacing loose files; differing duplicates explicitly rejected; loose-only import');
})().catch(e=>{console.error(e);process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..'),ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(base,'bloom-contract.js'),'utf8'),ctx);
const F=Math.fround;let count=0;
for(let i=1;i<=10;i++){
 const uid='Glow_Preset_'+String(i).padStart(2,'0'),cfg=JSON.parse(fs.readFileSync(path.join(base,'workspace/Dreamy_rework/Layers/video_effects/v1/composite_effect',uid,'resources/new_bloom_01.json'),'utf8')),original=JSON.stringify(cfg);
 for(const master of [0,.5,1]){
  const result=ctx.BloomContract.preview(cfg,master);
  for(const input of cfg.shaderConfig.INPUTS.filter(p=>p.TYPE==='float')){
   // Independent transcription of Kotlin Float MIN + target*(MAX-MIN).
   const expected=cfg.intensityParamNames.includes(input.NAME)?F(F(input.MIN)+F(F(master)*F(F(input.MAX)-F(input.MIN)))):F(input.DEFAULT);
   assert.ok(Math.abs(result[input.NAME].actualValue-expected)<1e-6,uid+' '+input.NAME+' @'+master);count++;
  }
 }
 assert.equal(JSON.stringify(cfg),original,'Preview never modifies authored JSON');
 const changed=JSON.parse(original),intensity=changed.shaderConfig.INPUTS.find(p=>p.NAME==='intensity');intensity.MAX=.37;intensity.DEFAULT=.37;
 assert.equal(ctx.BloomContract.preview(changed,1).intensity.actualValue,.37);
 assert.equal(ctx.BloomContract.preview(changed,.5).intensity.actualValue,.185);
}
console.log('PASS '+count+' ISF values: all 10 presets × 0/50/100% × 6 parameters; linked intensity edits; original resources unmodified');

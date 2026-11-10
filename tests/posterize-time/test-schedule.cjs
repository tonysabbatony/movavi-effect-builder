const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'posterize-time.js'),'utf8'),ctx);
const P=ctx.PosterizeTime,cfg=JSON.parse(fs.readFileSync(path.join(root,'shaders/PosterizeTime/PosterizeTime.json'),'utf8'));
assert.equal(P.configIssues(cfg).length,0);const original=JSON.stringify(cfg);let count=0;
for(const [master,expected] of [[0,5],[.25,10],[.5,15],[.75,20],[1,null]]){
 const c=P.resolve(cfg,master);assert.equal(P.targetFps(c),expected);
 for(const fps of [24,29.97,30,60]){
  const state={};let held=-1;
  for(let i=0;i<180;i++){
   const capture=P.update(state,i/fps,c,'source');if(capture)held=i;
   const independentBucket=t=>Math.floor(Math.fround(t)*(expected||30)+.0001);
   assert.equal(capture,i===0||expected===null||independentBucket(i/fps)!==independentBucket((i-1)/fps));
   assert.ok(held>=0&&held<=i);count++;
  }
 }
}
const state={};assert.equal(P.update(state,0,0,'a'),true);assert.equal(P.update(state,.03,0,'a'),false);assert.equal(P.update(state,.03,0,'a'),false);assert.equal(P.update(state,0,0,'a'),true);assert.equal(P.update(state,.01,0,'b'),true);assert.equal(P.update(state,.02,.5,'b'),true);
for(const [t,c] of [[NaN,0],[0,Infinity],[-1,0],[0,2]])assert.throws(()=>P.update({},t,c,'x'));
assert.equal(JSON.stringify(cfg),original);assert.equal(P.bucket(3600,0),18000);assert.equal(P.bucket(86400,0),432000);
const bad=JSON.parse(original);bad.shaderConfig.PASSES[0].PERSISTENT=false;assert.ok(P.configIssues(bad).length);
console.log('PASS '+count+' timestamp decisions, five anchor values, 100% bypass, backward seek, source and settings reset, invalid inputs, long timestamps and unchanged JSON');
for(const fps of [5,12,15,24,30])for(const strength of [0,.5,1]){
 const fixed=JSON.parse(original);fixed.shaderConfig.INPUTS.find(p=>p.NAME==='framesPerSecond').DEFAULT=fps;
 const c=P.resolve(fixed,strength);assert.equal(P.targetFps(c,P.fpsValue(fixed)),strength===0?null:fps);
 for(const source of [24,29.97,30,60]){const state={};let last=-1;for(let i=0;i<180;i++){const t=i/source,tick=Math.floor(Math.fround(Math.fround(t)*Math.fround(fps))+.0001);assert.equal(P.update(state,t,c,'x',fps),i===0||strength===0||tick!==last);last=tick;}}
}
console.log('PASS independent 5–30 fps at all strengths, zero bypass, 10800 fixed-rate frame decisions');
const legacy=JSON.parse(original);legacy.shaderConfig.INPUTS=legacy.shaderConfig.INPUTS.filter(p=>p.NAME!=='framesPerSecond');
const shaderPath=legacy.shaderPath,passes=JSON.stringify(legacy.shaderConfig.PASSES);
assert.equal(P.upgrade(legacy),true);assert.equal(P.upgrade(legacy),false);
assert.equal(P.fpsValue(legacy),15);assert.equal(P.resolve(legacy,0),0);assert.equal(P.resolve(legacy,1),1);
assert.equal(legacy.shaderPath,shaderPath);assert.equal(JSON.stringify(legacy.shaderConfig.PASSES),passes);
for(const fps of [0,4,31,NaN,Infinity])assert.throws(()=>P.update({},0,1,'x',fps));
console.log('PASS legacy upgrade, stable path/passes, idempotence and invalid FPS rejection');

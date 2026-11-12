const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'posterize-time.js'),'utf8'),ctx);
const P=ctx.PosterizeTime,cfg=JSON.parse(fs.readFileSync(path.join(root,'shaders/PosterizeTime/PosterizeTime.json'),'utf8')),original=JSON.stringify(cfg);
assert.deepEqual(Array.from(P.configIssues(cfg)),[]);let count=0;
for(const [master,expected]of [[0,null],[.25,23.75],[.5,17.5],[.75,11.25],[1,5]]){
 const c=P.resolve(cfg,master);assert.equal(P.targetFps(c),expected);
 for(const source of [24,29.97,30,60]){const state={};let previous=-1;
  for(let i=0;i<180;i++){const t=i/source,tick=Math.floor(Math.fround(Math.fround(t)*Math.fround(expected||30))+.0001);assert.equal(P.update(state,t,c,'a'),i===0||master===0||tick!==previous);previous=tick;count++;}
 }
}
const state={};assert.equal(P.update(state,0,1,'a'),true);assert.equal(P.update(state,.03,1,'a'),false);assert.equal(P.update(state,0,1,'a'),true);assert.equal(P.update(state,.01,1,'b'),true);assert.equal(P.update(state,.02,.5,'b'),true);
for(const [t,c]of [[NaN,1],[-1,1],[0,Infinity],[0,2]])assert.throws(()=>P.update({},t,c,'a'));
assert.equal(JSON.stringify(cfg),original);assert.equal(P.bucket(3600,1),18000);
const legacy=JSON.parse(original);legacy.shaderConfig.DESCRIPTION='old independent FPS';legacy.shaderConfig.INPUTS.push({NAME:'framesPerSecond',TYPE:'float',DEFAULT:15,MIN:5,MAX:30});const passes=JSON.stringify(legacy.shaderConfig.PASSES);
assert.equal(P.upgrade(legacy),true);assert.equal(P.upgrade(legacy),false);assert.equal(P.fpsValue(legacy),undefined);assert.equal(JSON.stringify(legacy.shaderConfig.PASSES),passes);assert.equal(P.resolve(legacy,0),0);assert.equal(P.resolve(legacy,1),1);
console.log('PASS '+count+' intensity-driven timestamp decisions, 0% source bypass including 60 fps, 100%=5 fps, settings/source/seek resets, migration and unchanged config');

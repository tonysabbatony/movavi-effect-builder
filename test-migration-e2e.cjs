/* Requires Playwright + Chrome and a local HTTP server. */
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const type of ['bloom','bloomRework']) {
      const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
      await page.goto((process.argv[2]||'http://127.0.0.1:8765')+'/index.html?empty');
      await page.evaluate(type=>{
        const root='fixture/Layers/video_effects/v1/composite_effect/Glow_Preset_01/';
        const p=v=>({actualValue:v,intensityMin:-1,intensityMax:v,hardCoded:true});
        const entries=[['fixture/all_in_one.json',{items:[{uid:'Glow_Preset_01',group_id:'test',resources:['bloom_01.json','other.json','keep.bin']}],groups:[{group_id:'test'}]}],
          [root+'Glow_Preset_01.json',{effects:[{effectName:'bloom_01',effectType:type},{effectName:'other',effectType:'customEffect'}],unknown:'keep'}],
          [root+'resources/bloom_01.json',{threshold:p(.3),intensity:p(1.7),radius:p(217),...(type==='bloomRework'?{knee:p(.23),scatter:p(1.1),opacity:p(.7)}:{})}],
          [root+'resources/other.json',{unknown:['preserve',42]}],[root+'resources/keep.bin','unchanged binary']];
        const dt=new DataTransfer();
        for(const [path,obj] of entries) {const file=new File([typeof obj==='string'?obj:JSON.stringify(obj)],path.split('/').pop());Object.defineProperty(file,'webkitRelativePath',{value:path});dt.items.add(file);}
        const input=document.querySelector('#fallbackFolderInput');input.files=dt.files;input.dispatchEvent(new Event('change'));
      },type);
      await page.waitForFunction(()=>document.querySelectorAll('.param-row[data-parameter-name]').length===6);
      assert.equal(await page.locator('[data-parameter-name="intensity"] .param-number').inputValue(),'1.7','Authored value is not clamped to template MAX');
      await page.locator('[data-parameter-name="radius"] .param-number').fill('123');
      // Capture in-memory ZIP to validate the real UI export without downloading.
      await page.evaluate(()=>{const original=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{if(b.type==='application/zip')window.exported=b;return original(b);};HTMLAnchorElement.prototype.click=function(){};});
      await page.locator('#exportGroupBtn').click();await page.waitForFunction(()=>window.exported);
      const result=await page.evaluate(async()=>{
        const outer=await MobilePackage.unzip(window.exported);
        const inner=await MobilePackage.unzip(new Blob([outer.find(e=>e.name==='Layers.zip').bytes]));
        return {outer:outer.map(e=>e.name),files:Object.fromEntries(inner.map(e=>[e.name,new TextDecoder().decode(e.bytes)])),manifest:JSON.parse(new TextDecoder().decode(outer.find(e=>e.name==='all_in_one.json').bytes))};
      });
      assert.deepEqual(result.outer,['all_in_one.json','Layers.zip']);
      const root='Layers/video_effects/v1/composite_effect/Glow_Preset_01/';
      assert.equal(Object.keys(result.files).some(n=>n.endsWith('/bloom_01.json')),false);
      const recipe=JSON.parse(result.files[root+'Glow_Preset_01.json']);assert.equal(recipe.unknown,'keep');
      assert.deepEqual(recipe.effects[0],{effectName:'new_bloom_01',effectType:'isf'});
      assert.deepEqual(JSON.parse(result.files[root+'resources/other.json']),{unknown:['preserve',42]});
      assert.equal(result.files[root+'resources/keep.bin'],'unchanged binary');
      const cfg=JSON.parse(result.files[root+'resources/new_bloom_01.json']);
      assert.equal(cfg.shaderPath,'v1/Bloom2/Bloom2');assert.equal(cfg.shaderConfig.PASSES.length,16);
      assert.equal(cfg.shaderConfig.INPUTS.find(p=>p.NAME==='radius').DEFAULT,123);
      assert.equal(cfg.shaderConfig.INPUTS.find(p=>p.NAME==='intensity').DEFAULT,1.7);
      assert.ok(result.manifest.items[0].resources.includes('new_bloom_01.json'));
      assert.ok(!result.manifest.items[0].resources.includes('bloom_01.json'));
      assert.deepEqual(errors,[]);await page.close();console.log('PASS Chrome '+type+': import, migration, edit, nested ZIP and unrelated files');
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* All ten presets, real controls, reset and mobile package round trip. */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const [url,reference]=process.argv.slice(2),browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
  await page.route('**/app.js',async route=>{const r=await route.fetch(),s=await r.text(),end=s.lastIndexOf('})();');await route.fulfill({response:r,body:s.slice(0,end)+'window.__D={state};\n'+s.slice(end)});});
  await page.goto(url+'/index.html?empty');await page.locator('#fallbackFolderInput').setInputFiles(reference);await page.waitForFunction(()=>document.querySelector('#presetSelect').options.length===10,null,{timeout:60000});
  const config=()=>page.evaluate(()=>{const s=__D.state,p=s.presets.get(s.activePresetName);return p.resources.get('isf:new_bloom_01').config;});
  const master=async value=>page.locator('#masterIntensity').evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input'))},value);
  const expected={threshold:.321,intensity:.37,radius:123,knee:.43,scatter:1.13,opacity:.91};
  for(let i=1;i<=10;i++){
   const uid='Glow_Preset_'+String(i).padStart(2,'0');await page.locator('#presetSelect').selectOption(uid);await page.locator('.effect-item[data-key="isf:new_bloom_01"] .effect-meta').click();
   const original=JSON.parse(await fs.readFile(path.join(reference,'Layers/video_effects/v1/composite_effect',uid,'resources/new_bloom_01.json'),'utf8'));assert.deepEqual(await config(),original,'Import must preserve every artist value');
   assert.equal(await page.locator('[data-parameter-name="intensity"] .param-number').inputValue(),String(original.shaderConfig.INPUTS.find(p=>p.NAME==='intensity').MAX));
   await page.locator('[data-parameter-name="intensity"] .param-number').fill('.37');
   for(const v of [0,50,100]){await master(v);const actual=await page.evaluate(()=>{const s=__D.state,c=s.presets.get(s.activePresetName).resources.get('isf:new_bloom_01').config;return BloomContract.preview(c,s.userIntensity).intensity.actualValue});assert.ok(Math.abs(actual-v/100*.37)<1e-8);}
   await master(50);await page.locator('[data-parameter-name="intensity"] .nested-hardcoded').check();
   assert.ok(!(await config()).intensityParamNames.includes('intensity'));assert.ok(Math.abs((await config()).shaderConfig.INPUTS.find(p=>p.NAME==='intensity').DEFAULT-.185)<1e-8);
   await page.locator('[data-parameter-name="intensity"] .nested-hardcoded').uncheck();await page.locator('#resetEffectBtn').click();assert.deepEqual(await config(),original,'Reset restores MIN/MAX/DEFAULT, fixed flags and pass graph');
   await master(100);for(const [name,value] of Object.entries(expected))await page.locator(`[data-parameter-name="${name}"] .param-number`).fill(String(value));
   const edited=await config();for(const input of edited.shaderConfig.INPUTS.filter(p=>p.TYPE==='float'))assert.equal(input.DEFAULT,expected[input.NAME]);assert.equal(edited.shaderConfig.INPUTS.find(p=>p.NAME==='intensity').MAX,.37);assert.deepEqual(edited.shaderConfig.PASSES,original.shaderConfig.PASSES);
  }
  await page.evaluate(()=>{const old=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{if(b.type==='application/zip')window.__zip=b;return old(b)};HTMLAnchorElement.prototype.click=function(){}});await page.locator('#exportGroupBtn').click();await page.waitForFunction(()=>window.__zip,null,{timeout:60000});
  const exported=await page.evaluate(async()=>{const outer=await MobilePackage.unzip(__zip),inner=await MobilePackage.unzip(new Blob([outer.find(e=>e.name==='Layers.zip').bytes])),d=new TextDecoder();return inner.filter(e=>e.name.endsWith('/new_bloom_01.json')).map(e=>JSON.parse(d.decode(e.bytes)))});assert.equal(exported.length,10);for(const cfg of exported){assert.equal(cfg.shaderConfig.INPUTS.find(p=>p.NAME==='intensity').MAX,.37);for(const input of cfg.shaderConfig.INPUTS.filter(p=>p.TYPE==='float'))assert.equal(input.DEFAULT,expected[input.NAME]);}
  await page.evaluate(async()=>{const outer=await MobilePackage.unzip(__zip),inner=await MobilePackage.unzip(new Blob([outer.find(e=>e.name==='Layers.zip').bytes])),files=[outer.find(e=>e.name==='all_in_one.json'),...inner],dt=new DataTransfer();for(const e of files){const f=new File([e.bytes],e.name.split('/').pop());Object.defineProperty(f,'webkitRelativePath',{value:'roundtrip/'+e.name});dt.items.add(f);}const el=document.querySelector('#fallbackFolderInput');el.files=dt.files;el.dispatchEvent(new Event('change'));});await page.waitForFunction(()=>__D.state.workspaceName==='roundtrip'&&document.querySelector('#dirtyStatus').textContent==='no changes');
  for(let i=1;i<=10;i++){await page.locator('#presetSelect').selectOption('Glow_Preset_'+String(i).padStart(2,'0'));const c=await config();assert.equal(c.shaderConfig.INPUTS.find(p=>p.NAME==='intensity').MAX,.37);for(const input of c.shaderConfig.INPUTS.filter(p=>p.TYPE==='float'))assert.equal(input.DEFAULT,expected[input.NAME]);}
  assert.deepEqual(errors,[]);console.log('PASS all ten: initial JSON intact; six UI controls; linked 0/50/100%; fixed toggle; exact reset; export/reimport keeps edited MIN/MAX/DEFAULT');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

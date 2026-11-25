/* Fixed cadence, multi-selection, immutable clipboard, assets, numbering and atomic failure. */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
(async()=>{
 const [url,out]=process.argv.slice(2);assert.ok(url&&out);await fs.mkdir(out,{recursive:true});const root=path.resolve(__dirname,'..'),browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1500,height:1000}}),errors=[],alerts=[];let expectedAlert=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(expectedAlert&&/другая версия ресурса/.test(d.message()))alerts.push(d.message());else errors.push(d.message());await d.dismiss();});
  await page.goto(url+'/index.html');await page.click('#newCollectionBtn');await page.locator('[name=name]').fill('Clipboard_Test');await page.locator('[name=uid]').fill('TX_01');await page.getByRole('button',{name:'Создать',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#presetSelect').value==='TX_01');
  async function add(id,file){const count=await page.locator('.effect-item').count();await page.selectOption('#effectCatalog',id);if(file){const promise=page.waitForEvent('filechooser');await page.click('#addEffectBtn');await(await promise).setFiles(file);}else await page.click('#addEffectBtn');await page.waitForFunction(n=>document.querySelectorAll('.effect-item').length===n,count+1);}
  const overlay=path.join(root,'test-assets/Posterize_Time_motion.mp4'),cube=path.join(root,'workspace/Dreamy_rework/Layers/video_effects/v1/composite_effect/Glow_Preset_01/resources/lut_01.cube');
  await add('posterize');await page.locator('#posterizeFps').fill('6');await page.locator('#posterizeFps').dispatchEvent('change');await page.locator('#posterizeFixed').check();
  for(const master of ['0','40','100']){await page.locator('#masterIntensity').fill(master);await page.locator('#masterIntensity').dispatchEvent('input');assert.equal(await page.locator('#posterizeRate').textContent(),'6 кадров/с');}
  assert.equal(await page.locator('#posterizeIntensity').isDisabled(),true);
  await page.locator('#posterizeFixed').uncheck();await page.locator('#masterIntensity').fill('0');await page.locator('#masterIntensity').dispatchEvent('input');assert.match(await page.locator('#posterizeRate').textContent(),/Исходная/);await page.locator('#posterizeFixed').check();
  await add('adjust');await page.locator('[data-parameter-name="brightness"] .param-number').fill('0.73');
  await add('lut',cube);await add('overlay',overlay);await add('sharpen');
  await page.locator('.effect-item .effect-meta').first().click();await page.locator('.effect-item .effect-meta').last().click({modifiers:['Shift']});assert.equal(await page.locator('.effect-item.selected').count(),5);await page.click('#copyLayersBtn');
  await page.locator('.effect-item .effect-meta').first().click();await page.locator('#posterizeFps').fill('9');await page.locator('#posterizeFps').dispatchEvent('change');
  await page.click('#newPresetBtn');await page.waitForFunction(()=>document.querySelector('#presetSelect').value==='TX_02');assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('.effect-item').count(),0);
  const different=Buffer.concat([await fs.readFile(overlay),Buffer.from([0,0,0,0])]);
  await add('sharpen');await add('overlay',{name:'Posterize_Time_motion.mp4',mimeType:'video/mp4',buffer:different});await add('lut',cube);
  await page.click('#pasteLayersBtn');await page.waitForFunction(()=>document.querySelectorAll('.effect-item').length===8);assert.equal(await page.locator('.effect-item.selected').count(),5);
  let pt=page.locator('.effect-item').filter({hasText:'isf · posterize_time'}).first();await pt.locator('.effect-meta').click();assert.equal(await page.locator('#posterizeFps').inputValue(),'6');assert.equal(await page.locator('#posterizeFixed').isChecked(),true);
  for(const master of ['0','50','100']){await page.locator('#masterIntensity').fill(master);await page.locator('#masterIntensity').dispatchEvent('input');assert.equal(await page.locator('#posterizeRate').textContent(),'6 кадров/с');}
  await page.locator('#posterizeFps').fill('7');await page.locator('#posterizeFps').dispatchEvent('change');await page.click('#pasteLayersBtn');await page.waitForFunction(()=>document.querySelectorAll('.effect-item').length===13);
  await page.click('#newPresetBtn');await page.waitForFunction(()=>document.querySelector('#presetSelect').value==='TX_03');await page.selectOption('#presetSelect','TX_01');await page.click('#newPresetBtn');await page.waitForFunction(()=>document.querySelector('#presetSelect').value==='TX_04');
  const grab=page.waitForEvent('download');await page.click('#exportGroupBtn');const zip=path.join(out,'Clipboard_Test.zip');await(await grab).saveAs(zip);
  execFileSync('python3',['-c',`import zipfile,io,json,sys,pathlib
z=zipfile.ZipFile(sys.argv[1]);assert sorted(z.namelist())==['Layers.zip','all_in_one.json'];assert z.testzip() is None
m=json.loads(z.read('all_in_one.json'));assert [i['uid'] for i in m['items']]==['TX_01','TX_02','TX_03','TX_04']
inner=zipfile.ZipFile(io.BytesIO(z.read('Layers.zip')));assert inner.testzip() is None
prefix='Layers/video_effects/v1/composite_effect/'
def cfg(uid,name):return json.loads(inner.read(prefix+uid+'/resources/'+name+'.json'))
def fps(c):return next(p['DEFAULT']for p in c['shaderConfig']['INPUTS']if p['NAME']=='framesPerSecond')
assert fps(cfg('TX_01','posterize_time'))==9
a=cfg('TX_02','posterize_time');b=cfg('TX_02','posterize_time_02');assert fps(a)==7 and fps(b)==6
assert a['intensityParamNames']==b['intensityParamNames']==[]
assert next(p['DEFAULT']for p in b['shaderConfig']['INPUTS']if p['NAME']=='cadence')==1
effects=json.loads(inner.read(prefix+'TX_02/TX_02.json'))['effects']
assert [e['effectName']for e in effects[:8]]==['sharpen_01','Noise_01','lut_01','posterize_time','my_adjust','lut_02','Noise_02','sharpen_02']
assert len(effects)==13
assert cfg('TX_02','my_adjust')==cfg('TX_01','my_adjust')
assert cfg('TX_02','sharpen_02')==cfg('TX_01','sharpen_01')
for name in ['lut_01','lut_02','lut_03']:assert inner.read(prefix+'TX_02/resources/'+name+'.cube')==pathlib.Path(sys.argv[2]).read_bytes()
source=pathlib.Path(sys.argv[3]).read_bytes()
for name in ['Noise_02','Noise_03']:
 c=cfg('TX_02',name);assert c['filename']!='Posterize_Time_motion';assert inner.read(prefix+'TX_02/resources/'+c['filename']+'.mp4')==source
assert inner.read(prefix+'TX_02/resources/Posterize_Time_motion.mp4')==source+bytes(4)
assert len([n for n in inner.namelist()if n.startswith(prefix+'TX_02/resources/')and n.endswith('.mp4')])==2
for name in ['Sharpen.ps','Sharpen.vs']:assert inner.read(prefix+'TX_01/resources/'+name)==inner.read(prefix+'TX_02/resources/'+name)
assert all('test-pattern.svg'not in n for n in inner.namelist())
# Add a conflicting target shader to verify all-or-nothing Paste.
data={n:inner.read(n)for n in inner.namelist()};data[prefix+'TX_03/resources/Sharpen.ps']=b'different shader'
next(i for i in m['items']if i['uid']=='TX_03')['resources']=['Sharpen.ps']
buf=io.BytesIO()
with zipfile.ZipFile(buf,'w')as w:
 for n,b in data.items():w.writestr(n,b)
with zipfile.ZipFile(sys.argv[4],'w')as w:w.writestr('all_in_one.json',json.dumps(m));w.writestr('Layers.zip',buf.getvalue())
`,zip,cube,overlay,path.join(out,'Conflict.zip')]);
  await page.locator('#openZipInput').setInputFiles(path.join(out,'Conflict.zip'));await page.waitForFunction(()=>document.querySelector('#presetSelect').options.length===4&&document.querySelector('#footerStatus').textContent.includes('Загружено'));await page.selectOption('#presetSelect','TX_02');await page.locator('.effect-item').filter({hasText:'isf · posterize_time'}).first().locator('.effect-meta').click();assert.equal(await page.locator('#posterizeFixed').isChecked(),true);assert.equal(await page.locator('#posterizeFps').inputValue(),'7');
  await page.selectOption('#presetSelect','TX_03');expectedAlert=true;await page.click('#pasteLayersBtn');await page.waitForFunction(()=>!document.querySelector('#pasteLayersBtn').disabled);assert.equal(alerts.length,1);assert.equal(await page.locator('.effect-item').count(),0);
  const failedGrab=page.waitForEvent('download');await page.click('#exportGroupBtn');const failedZip=path.join(out,'After_failed_paste.zip');await(await failedGrab).saveAs(failedZip);
  execFileSync('python3',['-c',`import zipfile,io,sys
z=zipfile.ZipFile(sys.argv[1]);i=zipfile.ZipFile(io.BytesIO(z.read('Layers.zip')));p='Layers/video_effects/v1/composite_effect/TX_03/'
assert sorted(n[len(p):]for n in i.namelist()if n.startswith(p))==['TX_03.json','resources/Sharpen.ps']
assert i.read(p+'resources/Sharpen.ps')==b'different shader'
`,failedZip]);assert.deepEqual(errors,[]);
  console.log('PASS fixed FPS at master 0/50/100, unfix, Shift selection, immutable Copy/Paste, repeated paste, LUT/overlay/shader resources, collision names, automatic TX numbering, ZIP reopen and atomic conflict rejection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


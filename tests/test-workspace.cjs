/* New collection -> catalog/assets -> multiple presets -> ZIP -> reopen. */
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const [url,out]=process.argv.slice(2);assert.ok(url&&out);await fs.mkdir(out,{recursive:true});const root=path.resolve(__dirname,'..');const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(d.type()==='confirm')await d.accept();else{errors.push(d.message());await d.dismiss();}});
  await page.goto(url+'/index.html');assert.equal(await page.locator('.effect-item').count(),0);assert.equal(await page.locator('#openPosterizeBtn').isVisible(),false);
  await page.click('#newCollectionBtn');await page.locator('[name=name]').fill('Catalog_Test');await page.locator('[name=group]').fill('temporal_test');await page.locator('[name=uid]').fill('Glow_01');await page.getByRole('button',{name:'Создать',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#presetSelect').value==='Glow_01');
  async function add(id,file){await page.selectOption('#effectCatalog',id);if(file){const chooser=page.waitForEvent('filechooser');await page.click('#addEffectBtn');await (await chooser).setFiles(file);}else await page.click('#addEffectBtn');}
  const ids=['adjust','bloom','sharpen','aberration','vhs','softBlur','noise','duotone','falseColor','posterize'];
  for(let i=0;i<ids.length;i++){await add(ids[i]);await page.waitForFunction(n=>document.querySelectorAll('.effect-item').length===n,i+1);}
  const overlay=path.join(root,'test-assets/Posterize_Time_motion.mp4'),cube=path.join(root,'workspace/Dreamy_rework/Layers/video_effects/v1/composite_effect/Glow_Preset_01/resources/lut_01.cube');
  await add('overlay',overlay);await page.waitForFunction(()=>document.querySelectorAll('.effect-item').length===11);
  await add('lut',cube);await page.waitForFunction(()=>document.querySelectorAll('.effect-item').length===12);
  await add('sharpen');await page.waitForFunction(()=>document.querySelectorAll('.effect-item').length===13);
  assert.match(await page.locator('#effectStack').textContent(),/sharpen_02/);
  await page.locator('#mediaInput').setInputFiles(path.join(root,'test-pattern.svg'));await page.waitForFunction(()=>document.querySelector('#afterCanvas').width>0&&!document.querySelector('#emptyPreview').offsetParent);
  await page.waitForTimeout(600);assert.equal(await page.locator('#renderErrors').textContent(),'');
  await page.click('#newPresetBtn');await page.locator('[name=uid]').fill('Glow_02');await page.getByRole('button',{name:'Создать',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#presetSelect').value==='Glow_02');
  await add('overlay',overlay);await page.waitForFunction(()=>document.querySelectorAll('.effect-item').length===1);
  const grab=page.waitForEvent('download');await page.click('#exportGroupBtn');const download=await grab;const zip=path.join(out,'Catalog_Test.zip');await download.saveAs(zip);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'collection-verify-'));
  require('node:child_process').execFileSync('python3',['-c',`import sys,zipfile,io,json,pathlib
z=zipfile.ZipFile(sys.argv[1]);assert sorted(z.namelist())==['Layers.zip','all_in_one.json'];assert z.testzip() is None
m=json.loads(z.read('all_in_one.json'));assert [i['uid'] for i in m['items']]==['Glow_01','Glow_02'];assert m['groups'][0]['group_id']=='temporal_test'
inner=zipfile.ZipFile(io.BytesIO(z.read('Layers.zip')));assert inner.testzip() is None
for item in m['items']:
 p='Layers/video_effects/v1/composite_effect/'+item['uid']+'/';r=p+'resources/'
 recipe=json.loads(inner.read(p+item['uid']+'.json'))
 for e in recipe['effects']:assert e['effectName']+'.json' in item['resources'];json.loads(inner.read(r+e['effectName']+'.json'))
 assert inner.read(r+'Posterize_Time_motion.mp4')==pathlib.Path(sys.argv[2]).read_bytes()
 assert all('test-pattern.svg' not in n for n in inner.namelist())
r='Layers/video_effects/v1/composite_effect/Glow_01/resources/'
assert inner.read(r+'lut_01.cube')==pathlib.Path(sys.argv[3]).read_bytes()
cfg=json.loads(inner.read(r+'new_bloom_01.json'));assert cfg['shaderPath']=='v1/Bloom2/Bloom2' and len(cfg['shaderConfig']['PASSES'])==16
assert len(json.loads(inner.read('Layers/video_effects/v1/composite_effect/Glow_01/Glow_01.json'))['effects'])==13
z.extractall(sys.argv[4])`,zip,overlay,cube,temp]);
  await page.locator('#openZipInput').setInputFiles(zip);await page.waitForFunction(()=>document.querySelector('#presetSelect').options.length===2);await page.selectOption('#presetSelect','Glow_01');await page.waitForFunction(()=>document.querySelectorAll('.effect-item').length===13);
  assert.equal(await page.locator('#renderErrors').textContent(),'');assert.deepEqual(errors,[]);
  // Equal basename/different bytes must allocate a resource, never replace it.
  const changed=Buffer.concat([await fs.readFile(overlay),Buffer.from([0,0,0,0])]);
  await add('overlay',{name:'Posterize_Time_motion.mp4',mimeType:'video/mp4',buffer:changed});await page.waitForFunction(()=>document.querySelectorAll('.effect-item').length===14);
  const collisionDownload=page.waitForEvent('download');await page.click('#exportGroupBtn');const collisionZip=path.join(out,'Asset_collision.zip');await (await collisionDownload).saveAs(collisionZip);
  const collision=await page.evaluate(async bytes=>{const outer=await MobilePackage.unzip(new Blob([new Uint8Array(bytes)])),inner=await MobilePackage.unzip(new Blob([outer.find(e=>e.name==='Layers.zip').bytes]));const prefix='Layers/video_effects/v1/composite_effect/Glow_01/resources/';const find=n=>inner.find(e=>e.name===prefix+n);return {original:Array.from(find('Posterize_Time_motion.mp4').bytes),changed:Array.from(find('Posterize_Time_motion_02.mp4').bytes),config:JSON.parse(new TextDecoder().decode(find('Noise_03.json').bytes))};},Array.from(await fs.readFile(collisionZip)));
  assert.deepEqual(Buffer.from(collision.original),await fs.readFile(overlay));assert.deepEqual(Buffer.from(collision.changed),changed);assert.equal(collision.config.filename,'Posterize_Time_motion_02');
  // Legacy loose preset has no manifest or Layers root; export creates both.
  const loose=await fs.mkdtemp(path.join(os.tmpdir(),'legacy-preset-')),legacyId='Glow_Preset_01';
  await fs.cp(path.join(root,'workspace/Dreamy_rework/Layers/video_effects/v1/composite_effect',legacyId),path.join(loose,legacyId),{recursive:true});
  await page.locator('#fallbackFolderInput').setInputFiles(loose);await page.waitForFunction(()=>document.querySelector('#presetSelect').value==='Glow_Preset_01'&&document.querySelector('#presetSelect').options.length===1);
  const legacyDownload=page.waitForEvent('download');await page.click('#exportGroupBtn');const legacyZip=path.join(out,'Legacy_repacked.zip');await (await legacyDownload).saveAs(legacyZip);
  const legacy=await page.evaluate(async bytes=>{const outer=await MobilePackage.unzip(new Blob([new Uint8Array(bytes)])),inner=await MobilePackage.unzip(new Blob([outer.find(e=>e.name==='Layers.zip').bytes]));return {manifest:JSON.parse(new TextDecoder().decode(outer.find(e=>e.name==='all_in_one.json').bytes)),paths:inner.map(e=>e.name)};},Array.from(await fs.readFile(legacyZip)));
  assert.equal(legacy.manifest.items[0].uid,legacyId);assert.ok(legacy.paths.length>5);assert.ok(legacy.paths.every(p=>p.startsWith('Layers/video_effects/v1/composite_effect/'+legacyId+'/')));assert.deepEqual(errors,[]);
  const style=await page.evaluate(async()=>{await document.fonts.ready;const logo=document.querySelector('.brand-mark img');return {font:document.fonts.check('14px Aeroport'),green:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),logoWidth:logo.getBoundingClientRect().width,logoLoaded:logo.complete&&logo.naturalWidth>0};});
  assert.equal(style.font,true);assert.equal(style.green,'#89fe00');assert.equal(style.logoLoaded,true);assert.ok(Math.abs(style.logoWidth-44)<.01);
  console.log('PASS collection creation, 12 effects, repeated Sharpen, external assets, two presets, ZIP reopen, same-name overlay collision, legacy canonical repack, local font and official logo');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Real UI playback, export, decode, and nested mobile-package roundtrip. */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os');
const {chromium}=require('playwright');
(async()=>{
 const [url,out]=process.argv.slice(2);assert.ok(url&&out,'URL OUTPUT_DIRECTORY');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
  await page.route('**/app.js',async route=>{
   const r=await route.fetch(),text=await r.text();
   const probe=`copyCanvas(input, ui.afterCanvas); if(window.__ptFrames){const hash=c=>{const b=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let v=2166136261;for(let i=0;i<b.length;i+=17)v=Math.imul(v^b[i],16777619);return v>>>0;};window.__ptFrames.push({t:ui.sourceVideo.currentTime,b:hash(ui.beforeCanvas),a:hash(ui.afterCanvas)});}`;
   await route.fulfill({response:r,body:text.replace('copyCanvas(input, ui.afterCanvas);',probe)});
  });
  await page.goto(url+'/index.html?empty');await page.click('#newCollectionBtn');
  await page.locator('[name=name]').fill('Posterize_Time');await page.locator('[name=group]').fill('temporal');await page.locator('[name=uid]').fill('Posterize_Time_Prototype');await page.getByRole('button',{name:'Создать',exact:true}).click();
  await page.selectOption('#effectCatalog','posterize');await page.click('#addEffectBtn');await page.waitForFunction(()=>document.querySelectorAll('.effect-item').length===1);
  await page.locator('#mediaInput').setInputFiles(path.resolve(__dirname,'../../test-assets/Posterize_Time_motion.mp4'));
  await page.waitForFunction(()=>document.querySelector('#sourceVideo').readyState>=2&&!document.querySelector('#playPauseBtn').disabled);
  await page.waitForFunction(()=>!document.querySelector('#openPosterizeBtn').disabled);
  if((await page.locator('#playPauseBtn').textContent())==='Pause')await page.locator('#playPauseBtn').click();
  await page.evaluate(async()=>{const v=document.querySelector('#sourceVideo');if(v.currentTime!==0){const done=new Promise(ok=>v.addEventListener('seeked',ok,{once:true}));v.currentTime=0;await done;}});
  await page.locator('.effect-item').filter({hasText:'Posterize Time'}).locator('.effect-meta').click();
  assert.match(await page.locator('#selectedEffectTitle').textContent(),/Posterize Time/);
  await page.locator('#posterizeFps').fill('5');await page.locator('#posterizeFps').dispatchEvent('change');
  await page.locator('#masterIntensity').fill('100');await page.locator('#masterIntensity').dispatchEvent('input');
  await page.waitForFunction(()=>document.querySelector('#posterizeRate').textContent.includes('5'));
  await page.evaluate(()=>{window.__ptFrames=[];document.querySelector('#sourceVideo').loop=false;});
  await page.locator('#playPauseBtn').click();await page.waitForFunction(()=>document.querySelector('#sourceVideo').currentTime>=2.1);await page.locator('#playPauseBtn').click();
  const held=await page.evaluate(()=>window.__ptFrames);
  const changes=(frames,key)=>frames.reduce((sum,row,i)=>sum+(i===0||row[key]!==frames[i-1][key]?1:0),0);
  const beforeChanges=changes(held,'b'),heldChanges=changes(held,'a');
  assert.ok(beforeChanges>35&&heldChanges>=9&&heldChanges<=13,JSON.stringify({beforeChanges,heldChanges}));
  await page.locator('#masterIntensity').fill('0');await page.locator('#masterIntensity').dispatchEvent('input');
  await page.waitForFunction(()=>document.querySelector('#posterizeRate').textContent.includes('Исходная'));
  await page.evaluate(()=>window.__ptFrames=[]);await page.locator('#playPauseBtn').click();await page.waitForFunction(()=>document.querySelector('#sourceVideo').currentTime>=3.6);await page.locator('#playPauseBtn').click();
  const bypass=await page.evaluate(()=>window.__ptFrames);assert.ok(bypass.length>20);assert.ok(bypass.every(r=>r.b===r.a),'0% is pixel-identical to original preview');
  await page.locator('#masterIntensity').fill('100');await page.locator('#masterIntensity').dispatchEvent('input');
  await page.evaluate(()=>window.__ptFrames=[]);
  await page.locator('#exportVideoBtn').click();await page.locator('#videoExportMode').selectOption('Before_After');await page.locator('#videoExportLabels').uncheck();await page.locator('#videoExportAudio').uncheck();await page.locator('#videoExportStart').click();
  await page.waitForSelector('#videoExportResult a[download]',{timeout:30000});
  const recorded=await page.evaluate(()=>window.__ptFrames);assert.ok(changes(recorded,'b')>80);assert.ok(changes(recorded,'a')>=19&&changes(recorded,'a')<=25,'held export frames, including final restored position');
  const downloadPromise=page.waitForEvent('download');await page.locator('#videoExportResult a[download]').click();const download=await downloadPromise;
  const videoPath=path.join(out,'Posterize_Time_5fps_comparison.mp4');await download.saveAs(videoPath);
  const encoded=await fs.readFile(videoPath);
  const decoded=await page.evaluate(async bytes=>{
   const v=document.createElement('video');v.muted=true;v.src=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'video/mp4'}));
   await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=no;});const duration=v.duration;
   const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;const ctx=canvas.getContext('2d');
   // Track the fixture's moving turquoise circle. H.264 may change texture
   // coefficients in held frames without moving the object (especially on Linux).
   const center=rgba=>{let sx=0,sy=0,n=0,w=canvas.width/2;for(let y=16;y<canvas.height-16;y++)for(let x=16;x<w-16;x++){const k=(y*w+x)*4;if(rgba[k]<140&&rgba[k+1]>150&&rgba[k+2]>120){sx+=x;sy+=y;n++;}}if(n<200)throw Error('Motion fixture circle not found');return [sx/n,sy/n];};
   let before=null,after=null,beforeChanges=0,afterChanges=0;
   for(let i=0;i<61;i++){
    const t=.4+i/30;const done=new Promise(ok=>v.addEventListener('seeked',ok,{once:true}));v.currentTime=t;await done;ctx.drawImage(v,0,0);
    const b=ctx.getImageData(0,0,canvas.width/2,canvas.height).data,a=ctx.getImageData(canvas.width/2,0,canvas.width/2,canvas.height).data;
    const bc=center(b),ac=center(a),moved=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])>1;
    if(before&&moved(bc,before))beforeChanges++;if(after&&moved(ac,after))afterChanges++;before=bc;after=ac;
   }
   URL.revokeObjectURL(v.src);return {duration,width:canvas.width,height:canvas.height,beforeChanges,afterChanges,sampledSeconds:2};
  },Array.from(encoded));
  assert.ok(decoded.duration>3.7&&decoded.duration<4.5,JSON.stringify(decoded));assert.equal(decoded.width,960);assert.equal(decoded.height,270);
  assert.ok(decoded.beforeChanges>40&&decoded.afterChanges>=8&&decoded.afterChanges<=12,JSON.stringify(decoded));
  await page.locator('#videoExportClose').click();
  await page.locator('.toolbar-menu summary').click();const packageDownload=page.waitForEvent('download');await page.locator('#exportBtn').click();const pkg=await packageDownload;const zip=path.join(out,'Posterize_Time_export_roundtrip.zip');await pkg.saveAs(zip);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'posterize-roundtrip-'));
  require('node:child_process').execFileSync('python3',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert sorted(z.namelist())==["Layers.zip","all_in_one.json"]; assert z.testzip() is None; z.extractall(sys.argv[2])',zip,temp]);
  await page.locator('#fallbackFolderInput').setInputFiles(temp);
  await page.locator('.effect-item').filter({hasText:'Posterize Time'}).locator('.effect-meta').click();
  await page.waitForFunction(()=>document.querySelector('#selectedEffectTitle').textContent==='Posterize Time');
  assert.equal(await page.locator('#posterizeFps').inputValue(),'5');
  await page.locator('#posterizeFps').fill('30');await page.locator('#posterizeFps').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#posterizeRate').textContent.includes('30'));
  assert.equal(await page.locator('#renderErrors').textContent(),'');assert.deepEqual(errors,[]);
  const legacyDir=await fs.mkdtemp(path.join(os.tmpdir(),'posterize-legacy-'));await fs.cp(path.resolve(__dirname,'../../prototypes/posterize-time/preset'),legacyDir,{recursive:true});
  const legacyResource=path.join(legacyDir,'Layers/video_effects/v1/composite_effect/Posterize_Time_01/resources'),legacyCfg=JSON.parse(await fs.readFile(path.join(legacyResource,'posterize_time.json'),'utf8'));
  legacyCfg.shaderConfig.INPUTS=legacyCfg.shaderConfig.INPUTS.filter(p=>p.NAME!=='framesPerSecond');await fs.writeFile(path.join(legacyResource,'posterize_time.json'),JSON.stringify(legacyCfg));
  for(const name of ['PosterizeTime.ps','PosterizeTime.vs'])await fs.writeFile(path.join(legacyResource,name),'old shader copy');
  await page.locator('#fallbackFolderInput').setInputFiles(legacyDir);await page.waitForFunction(()=>document.querySelector('#presetSelect').value==='Posterize_Time_01'&&document.querySelector('#posterizeFps')?.value==='15');
  const legacyDownload=page.waitForEvent('download');await page.click('#exportGroupBtn');const legacyZip=path.join(out,'Legacy_updated.zip');await (await legacyDownload).saveAs(legacyZip);
  const migrated=await page.evaluate(async bytes=>{const outer=await MobilePackage.unzip(new Blob([new Uint8Array(bytes)])),inner=await MobilePackage.unzip(new Blob([outer.find(e=>e.name==='Layers.zip').bytes]));return Object.fromEntries(inner.filter(e=>/posterize_time.json|PosterizeTime.ps|PosterizeTime.vs/.test(e.name)).map(e=>[e.name.split('/').pop(),new TextDecoder().decode(e.bytes)]));},Array.from(await fs.readFile(legacyZip)));
  assert.equal(JSON.parse(migrated['posterize_time.json']).shaderConfig.INPUTS.find(p=>p.NAME==='framesPerSecond').DEFAULT,15);
  for(const name of ['PosterizeTime.ps','PosterizeTime.vs'])assert.equal(migrated[name],await fs.readFile(path.resolve(__dirname,'../../shaders/PosterizeTime',name),'utf8'));assert.deepEqual(errors,[]);
  const report={beforeChanges,heldChanges,bypassFrames:bypass.length,decoded};await fs.writeFile(path.join(out,'browser-validation.json'),JSON.stringify(report,null,2));console.log('PASS 5 fps at 100%, exact 0% bypass, MP4 decode, saved FPS, 30 fps edit, legacy upgrade and actual shader bytes:',JSON.stringify(report));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Ten real video encodes, independently decoded picture + audio, and cancel. */
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const [url,out]=process.argv.slice(2);assert.ok(url&&out);await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
  await page.goto(url+'/index.html');await page.click('#newCollectionBtn');await page.locator('[name=name]').fill('Batch_Review');await page.locator('[name=uid]').fill('Glow_01');await page.getByRole('button',{name:'Создать',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#presetSelect').value==='Glow_01');
  for(let i=1;i<=10;i++){
   if(i>1){await page.click('#newPresetBtn');await page.locator('[name=uid]').fill('Glow_'+String(i).padStart(2,'0'));await page.getByRole('button',{name:'Создать',exact:true}).click();await page.waitForFunction(id=>document.querySelector('#presetSelect').value===id,'Glow_'+String(i).padStart(2,'0'));}
   await page.selectOption('#effectCatalog','duotone');await page.click('#addEffectBtn');await page.waitForSelector('[data-parameter-name="color.red"] .param-number');await page.locator('[data-parameter-name="color.red"] .param-number').fill(String(i/10));
  }
  const fixture=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const ctx=canvas.getContext('2d');ctx.fillStyle='rgb(25,55,180)';ctx.fillRect(0,0,160,90);
   const ac=new AudioContext();await ac.resume();const dest=ac.createMediaStreamDestination(),osc=ac.createOscillator(),gain=ac.createGain();osc.frequency.value=440;gain.gain.value=.2;osc.connect(gain).connect(dest);osc.start();
   const stream=canvas.captureStream(30);stream.addTrack(dest.stream.getAudioTracks()[0]);const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'}),chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(ok=>recorder.onstop=ok);
   let n=0;const timer=setInterval(()=>{ctx.fillStyle=n++<14?'rgb(25,55,180)':'rgb(200,100,30)';ctx.fillRect(0,0,160,90);},30);recorder.start();await new Promise(ok=>setTimeout(ok,900));recorder.stop();await stopped;clearInterval(timer);osc.stop();stream.getTracks().forEach(t=>t.stop());await ac.close();return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  const source=path.join(out,'Synthetic_tone.webm');await fs.writeFile(source,Buffer.from(fixture));await page.locator('#mediaInput').setInputFiles(source);await page.waitForFunction(()=>document.querySelector('#sourceVideo').readyState>=2&&!document.querySelector('#playPauseBtn').disabled);
  if((await page.locator('#playPauseBtn').textContent())==='Pause')await page.click('#playPauseBtn');await page.selectOption('#presetSelect','Glow_04');await page.locator('.effect-item .eye').click();
  await page.evaluate(async()=>{const v=document.querySelector('#sourceVideo');const done=new Promise(ok=>v.addEventListener('seeked',ok,{once:true}));v.currentTime=.25;await done;});
  const snapshot=await page.locator('#sourceVideo').evaluate(v=>({time:v.currentTime,loop:v.loop,muted:v.muted,paused:v.paused}));
  await page.click('#exportVideoBtn');await page.selectOption('#videoExportScope','all');await page.selectOption('#videoExportMode','Before_After');await page.locator('#videoExportLabels').uncheck();
  const downloadPromise=page.waitForEvent('download',{timeout:120000});await page.click('#videoExportStart');const download=await downloadPromise,zip=path.join(out,'All_10_Before_After.zip');await download.saveAs(zip);await page.waitForFunction(()=>!document.querySelector('#videoExportStart').disabled);
  assert.equal(await page.locator('#presetSelect').inputValue(),'Glow_04');assert.equal(await page.locator('.effect-item .eye.off').count(),1);
  const restored=await page.locator('#sourceVideo').evaluate(v=>({time:v.currentTime,loop:v.loop,muted:v.muted,paused:v.paused}));assert.ok(Math.abs(restored.time-snapshot.time)<.06,JSON.stringify({restored,snapshot}));for(const key of ['loop','muted','paused'])assert.equal(restored[key],snapshot[key]);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'batch-decode-'));
  require('node:child_process').execFileSync('python3',['-c',`import sys,zipfile
z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None
assert sorted(z.namelist())==[f'Glow_{i:02}/Glow_{i:02}_Before_After.mp4' for i in range(1,11)],z.namelist()
z.extractall(sys.argv[2])`,zip,temp]);
  const results=[];
  for(let i=1;i<=10;i++){
   const name='Glow_'+String(i).padStart(2,'0'),bytes=Array.from(await fs.readFile(path.join(temp,name,name+'_Before_After.mp4')));
   const result=await page.evaluate(async bytes=>{
    const data=new Uint8Array(bytes),v=document.createElement('video');v.muted=true;v.src=URL.createObjectURL(new Blob([data],{type:'video/mp4'}));await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=no;});
    const done=new Promise(ok=>v.addEventListener('seeked',ok,{once:true}));v.currentTime=.25;await done;const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0);const rgba=ctx.getImageData(canvas.width*.75,canvas.height/2,1,1).data;
    const ac=new AudioContext(),audio=await ac.decodeAudioData(data.buffer.slice(0)),samples=audio.getChannelData(0);let sum=0,crossings=0;for(let n=1;n<samples.length;n++){sum+=samples[n]*samples[n];if(samples[n-1]<0&&samples[n]>=0)crossings++;}
    const result={duration:v.duration,width:canvas.width,height:canvas.height,rgb:Array.from(rgba).slice(0,3),audioRms:Math.sqrt(sum/samples.length),audioFrequency:crossings/audio.duration};await ac.close();URL.revokeObjectURL(v.src);return result;
   },bytes);
   assert.ok(result.duration>.7&&result.duration<1.5,JSON.stringify(result));assert.equal(result.width,320);assert.equal(result.height,90);assert.ok(result.audioRms>.02&&result.audioFrequency>350&&result.audioFrequency<500,JSON.stringify(result));results.push({name,...result});
  }
  for(let i=1;i<results.length;i++)assert.ok(results[i].rgb[0]>results[i-1].rgb[0]+1,JSON.stringify(results));
  // A cancelled second batch must not leave controls locked or change selection.
  await page.click('#videoExportStart');await page.waitForTimeout(150);await page.click('#videoExportClose');await page.waitForFunction(()=>!document.querySelector('#videoExportStart').disabled);assert.match(await page.locator('#videoExportStatus').textContent(),/отменён/);assert.equal(await page.locator('#presetSelect').inputValue(),'Glow_04');assert.equal(await page.locator('.toolbar').evaluate(e=>e.inert),false);
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'batch-validation.json'),JSON.stringify(results,null,2));console.log('PASS all 10 named preset videos, distinct decoded After colors, original AAC tone in every file, duration, restore and cancellation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

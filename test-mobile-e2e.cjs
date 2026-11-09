/* Requires Playwright + Chrome. Start a local HTTP server in this folder.
 * node test-mobile-e2e.cjs http://127.0.0.1:8765 /path/to/reference /path/to/output.zip
 * The reference folder is copied before import and never modified. */
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const [url,reference,output]=process.argv.slice(2);
  if(!url||!reference||!output)throw Error('Provide URL, reference folder and output ZIP');
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'builder-e2e-'));
  const copy=path.join(scratch,'reference');await fs.cp(reference,copy,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
    await page.goto(url+'/index.html?empty');
    await page.locator('#fallbackFolderInput').setInputFiles(copy);
    console.log('Import submitted');
    try {
      await page.waitForFunction(()=>document.querySelector('#presetSelect').options.length===10,null,{timeout:60000});
    } catch(error) {
      console.error('Import diagnostics:',errors,await page.locator('#footerStatus').textContent());throw error;
    }
    await page.waitForFunction(()=>document.querySelector('#footerStatus').textContent.includes('Загружено'));
    console.log('Reference loaded');
    assert.equal(await page.locator('#saveBtn').isDisabled(),true,'Packed import uses export and cannot overwrite original ZIP');
    await page.locator('.effect-item').filter({hasText:'New Bloom'}).locator('.effect-meta').click();
    assert.equal(await page.locator('.param-row[data-parameter-name]').count(),6);
    for(const name of ['intensity','radius','knee','scatter','opacity']) {
      const number=page.locator(`[data-parameter-name="${name}"] .param-number`),original=await number.inputValue();
      await number.fill('0.123');assert.equal(await number.inputValue(),'0.123');await number.fill(original);
    }
    await page.locator('#resetEffectBtn').click();
    await page.locator('#mediaInput').setInputFiles(path.join(__dirname,'test-pattern.svg'));
    await page.waitForFunction(()=>!document.querySelector('#emptyPreview').offsetParent);
    const pixels=()=>page.evaluate(()=>{
      const c=document.querySelector('#afterCanvas');return Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);
    });
    await page.waitForTimeout(1500);const before=await pixels();
    await page.locator('[data-parameter-name="threshold"] .param-number').fill('0.321');
    await page.waitForTimeout(1500);const after=await pixels();
    assert.ok(before.some((v,i)=>v!==after[i]),'Changing ISF DEFAULT changes preview');
    assert.equal(await page.locator('#renderErrors').textContent(),'');
    await page.locator('#presetSelect').selectOption('Glow_Preset_02');
    await page.locator('#presetSelect').selectOption('Glow_Preset_01');
    await page.locator('.effect-item').filter({hasText:'New Bloom'}).locator('.effect-meta').click();
    assert.equal(await page.locator('[data-parameter-name="threshold"] .param-number').inputValue(),'0.321');
    const downloadPromise=page.waitForEvent('download',{timeout:60000});
    await page.locator('#exportGroupBtn').click();const download=await downloadPromise;
    await download.saveAs(output);
    console.log('Export saved');
    // Reimport the actual exported nested ZIP via the same parser and folder UI.
    const roundtrip=path.join(scratch,'roundtrip');await fs.mkdir(roundtrip);
    require('node:child_process').execFileSync('python3',['-c',
      'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert sorted(z.namelist())==["Layers.zip","all_in_one.json"]; z.extractall(sys.argv[2])',output,roundtrip]);
    await page.locator('#fallbackFolderInput').setInputFiles(roundtrip);
    await page.waitForFunction(()=>document.querySelector('#footerStatus').textContent.includes('Загружено'));
    await page.locator('.effect-item').filter({hasText:'New Bloom'}).locator('.effect-meta').click();
    assert.equal(await page.locator('[data-parameter-name="threshold"] .param-number').inputValue(),'0.321');
    assert.deepEqual(errors,[]);
    await page.evaluate(()=>{const original=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{if(b.type==='application/zip')window.selectedExport=b;return original(b);};HTMLAnchorElement.prototype.click=function(){};});
    await page.locator('#exportBtn').click();await page.waitForFunction(()=>window.selectedExport);
    const selected=await page.evaluate(async()=>{
      const outer=await MobilePackage.unzip(window.selectedExport),inner=await MobilePackage.unzip(new Blob([outer.find(e=>e.name==='Layers.zip').bytes]));
      return {manifest:JSON.parse(new TextDecoder().decode(outer.find(e=>e.name==='all_in_one.json').bytes)),paths:inner.map(e=>e.name)};
    });
    assert.equal(selected.manifest.items.length,1);assert.equal(selected.manifest.items[0].uid,'Glow_Preset_01');
    assert.ok(selected.paths.every(p=>p.startsWith('Layers/video_effects/v1/composite_effect/Glow_Preset_01/')));
    console.log('PASS Chrome: reference import → linked intensity and five DEFAULT controls → reset → preview change → preset switch → nested ZIP export → reimport; no runtime errors');
    console.log('PASS selected preset: same nested ZIP contract and one matching manifest item');
    console.log('Export: '+output);
  } finally {await browser.close();await fs.rm(scratch,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

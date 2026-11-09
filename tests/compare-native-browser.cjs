/* Requires Playwright + Chrome. Oracle cases are produced by native-oracle.mm. */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const [url,oracle,reference]=process.argv.slice(2);assert.ok(url&&oracle&&reference,'URL ORACLE_RESULTS REFERENCE_FOLDER');
 const cases=JSON.parse(await fs.readFile(path.join(oracle,'cases.json'),'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();
  await page.route('**/app.js',async route=>{const r=await route.fetch(),text=await r.text(),end=text.lastIndexOf('})();');await route.fulfill({response:r,body:text.slice(0,end)+'window.__LUT={parseCube,applyLut};\n'+text.slice(end)});});
  await page.goto(url+'/index.html?empty');const results=[];
  for(const c of cases){
   const input=Array.from(await fs.readFile(path.resolve(oracle,c.input))),lutName='lut_'+c.uid.slice(-2),cube=await fs.readFile(path.join(reference,'Layers/video_effects/v1/composite_effect',c.uid,'resources',lutName+'.cube'),'utf8');
   const actual=await page.evaluate(({c,input,cube})=>{
    const source=document.createElement('canvas'),adjust=document.createElement('canvas'),lutOut=document.createElement('canvas');
    for(const canvas of [source,adjust,lutOut]){canvas.width=c.width;canvas.height=c.height;}
    source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(input),c.width,c.height),0,0);
    AdjustMobile.render(source,adjust,MovaviRender.resolve(c.config,c.master));
    __LUT.applyLut(source,lutOut,MovaviRender.resolve(c.lutConfig,c.master),__LUT.parseCube(cube));
    const bytes=canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,c.width,c.height).data);
    return {adjust:bytes(adjust),lut:bytes(lutOut)};
   },{c,input,cube});
   for(const stage of ['adjust','lut']){
    const expected=await fs.readFile(path.join(oracle,c[stage]));let max=0,sum=0;for(let i=0;i<expected.length;i++){const diff=Math.abs(expected[i]-actual[stage][i]);max=Math.max(max,diff);sum+=diff;}
    const result={uid:c.uid,master:c.master,frame:path.basename(c.input),stage,max,mean:sum/expected.length};results.push(result);
    // Isolated rounding at RGBA8/half-float boundaries can be amplified by gamma.
    assert.ok(max<=(stage==='adjust'?4:1) && result.mean<.1,JSON.stringify(result));
    if(path.basename(c.input)!=='pattern.rgba'&&c.uid==='Glow_Preset_03'&&c.master===1)await fs.writeFile(path.join(oracle,'browser-'+stage+'.rgba'),Buffer.from(actual[stage]));
   }
  }
  await fs.writeFile(path.join(oracle,'comparison.json'),JSON.stringify(results,null,2));
  console.log('PASS '+results.length+' stage comparisons against actual Metal kernels; max delta '+Math.max(...results.map(r=>r.max))+'/255');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

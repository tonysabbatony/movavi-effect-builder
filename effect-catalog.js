/* Mobile effect types and resource names. No display labels are serialized. */
(() => {
  'use strict';
  const parameter=(value,min=value,fixed=true)=>({actualValue:value,intensityMin:min,intensityMax:value,hardCoded:fixed});
  const color=(r,g,b)=>({red:parameter(r),green:parameter(g),blue:parameter(b)});
  const items=[
    {id:'adjust',label:'Adjust · цвет и свет',type:'adjust',name:'my_adjust'},
    {id:'bloom',label:'New Bloom · свечение',type:'isf',name:'new_bloom_01'},
    {id:'sharpen',label:'Sharpen · резкость',type:'isf',name:'sharpen_01'},
    {id:'aberration',label:'Chromatic Aberration',type:'chromaticAberration',name:'abberation_01'},
    {id:'lut',label:'LUT · файл .cube',type:'lut',name:'lut_01',asset:'lut'},
    {id:'overlay',label:'Overlay · видеооверлей',type:'overlay',name:'Noise_01',asset:'overlay'},
    {id:'vhs',label:'VHS Distortion',type:'vhsDistortion',name:'vhs_01',approximate:true},
    {id:'softBlur',label:'Soft Blur',type:'softBlur',name:'soft_blur_01',approximate:true},
    {id:'noise',label:'Noise · Lee Cranston',type:'noiseLeeCranston',name:'noise_01',approximate:true},
    {id:'duotone',label:'Color Duotone',type:'colorDuotone',name:'duotone_01'},
    {id:'falseColor',label:'False Color',type:'falseColor',name:'false_color_01'},
    {id:'posterize',label:'Posterize Time',type:'isf',name:'posterize_time',integration:true}
  ];
  function config(id,refs={}) {
    const fixed=v=>parameter(v),linked=(v,min=0)=>parameter(v,min,false);
    let result;
    if(id==='adjust')result=Object.fromEntries(['saturation','temperature','hue','colorTone','brightness','exposure','contrast','highlights','shadows','whitePoint','blackPoint'].map(n=>[n,fixed(.5)]));
    if(id==='bloom')result=globalThis.BloomContract.migrate({threshold:fixed(.3),intensity:linked(.8),radius:fixed(75),knee:fixed(.5),scatter:fixed(.65),opacity:fixed(1)});
    if(id==='sharpen')result=refs.sharpen||globalThis.SharpenAssets?.config;
    if(id==='posterize')result=refs.posterize;
    if(id==='aberration')result={strength:linked(.015),overlap:fixed(.3)};
    if(id==='lut')result={...linked(1),templateID:'lut_01',interpolateMode:'Trilinear'};
    if(id==='overlay')result={...linked(.25),filename:'',binding:'center',blendMode:'screen'};
    if(id==='vhs')result={intensity:linked(.35),blurAmount:linked(1)};
    if(id==='softBlur')result={softness:linked(.25),depth:fixed(3)};
    if(id==='noise')result={ditherAmount:linked(.05),animated:true,monochrome:true};
    if(id==='duotone')result={intensity:linked(.6),color:color(.95,.35,.15)};
    if(id==='falseColor')result={brightColor:color(1,.85,.35),darkColor:color(.03,.08,.22)};
    if(!result)throw Error('Нет шаблона эффекта: '+id);
    return JSON.parse(JSON.stringify(result));
  }
  function identifier(value) {
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value))throw Error('ID: от 1 до 80 латинских букв, цифр, _ или -.');
    return value;
  }
  function unique(base,occupied) {
    const used=new Set([...occupied].map(v=>v.toLowerCase()));
    if(!used.has(base.toLowerCase()))return base;
    const m=base.match(/^(.*?)(\d+)$/),prefix=m?m[1]:base+'_',start=m?Number(m[2])+1:2,width=m?m[2].length:2;
    for(let n=start;n<100000;n++){const next=prefix+String(n).padStart(width,'0');if(!used.has(next.toLowerCase()))return next;}
    throw Error('Не удалось подобрать свободное имя.');
  }
  function manifestItem(uid,group,priority=1) {
    return {is_premium:false,uid,group_id:group,resources:[],lut:'',version:'v1',effect_type:'composite_effect',priority,is_rewardable:false,overlays:[]};
  }
  function manifest(group,uid) {
    return {groups:[{cover_version:'v1',group_priority:0,plug_colors:['01805A','E43745','FDED96'],group_id:identifier(group)}],items:[manifestItem(identifier(uid),group)]};
  }
  globalThis.EffectCatalog={items,config,identifier,unique,manifest,manifestItem};
})();

/* Mobile Bloom2 resource contract, copied from the developer's working package.
 * UI edits DEFAULT only; shader metadata and pass graph remain intact. */
(() => {
  'use strict';
  const template={
  "shaderPath": "v1/Bloom2/Bloom2",
  "intensityParamNames": [
    "intensity"
  ],
  "shaderConfig": {
    "ISFVSN": "2",
    "CATEGORIES": [
      "Glow"
    ],
    "INPUTS": [
      {
        "NAME": "inputImage",
        "TYPE": "image"
      },
      {
        "NAME": "threshold",
        "TYPE": "float",
        "MIN": 0.0,
        "MAX": 1.0,
        "DEFAULT": 0.3
      },
      {
        "NAME": "intensity",
        "TYPE": "float",
        "MIN": 0.0,
        "MAX": 0.8,
        "DEFAULT": 0.8
      },
      {
        "NAME": "radius",
        "TYPE": "float",
        "MIN": 0.0,
        "MAX": 300.0,
        "DEFAULT": 75
      },
      {
        "NAME": "knee",
        "TYPE": "float",
        "MIN": 0.0,
        "MAX": 1.0,
        "DEFAULT": 0.5
      },
      {
        "NAME": "scatter",
        "TYPE": "float",
        "MIN": 0.0,
        "MAX": 2.0,
        "DEFAULT": 0.65
      },
      {
        "NAME": "opacity",
        "TYPE": "float",
        "MIN": 0.0,
        "MAX": 1.0,
        "DEFAULT": 1
      }
    ],
    "PASSES": [
      {
        "TARGET": "L0",
        "WIDTH": "(ceil($WIDTH/2)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/2)+0.5)/0.77"
      },
      {
        "TARGET": "H0",
        "WIDTH": "(ceil($WIDTH/2)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/2)+0.5)/0.77"
      },
      {
        "TARGET": "V0",
        "WIDTH": "(ceil($WIDTH/2)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/2)+0.5)/0.77"
      },
      {
        "TARGET": "L1",
        "WIDTH": "(ceil($WIDTH/4)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/4)+0.5)/0.77"
      },
      {
        "TARGET": "H1",
        "WIDTH": "(ceil($WIDTH/4)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/4)+0.5)/0.77"
      },
      {
        "TARGET": "V1",
        "WIDTH": "(ceil($WIDTH/4)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/4)+0.5)/0.77"
      },
      {
        "TARGET": "L2",
        "WIDTH": "(ceil($WIDTH/8)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/8)+0.5)/0.77"
      },
      {
        "TARGET": "H2",
        "WIDTH": "(ceil($WIDTH/8)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/8)+0.5)/0.77"
      },
      {
        "TARGET": "V2",
        "WIDTH": "(ceil($WIDTH/8)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/8)+0.5)/0.77"
      },
      {
        "TARGET": "L3",
        "WIDTH": "(ceil($WIDTH/16)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/16)+0.5)/0.77"
      },
      {
        "TARGET": "H3",
        "WIDTH": "(ceil($WIDTH/16)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/16)+0.5)/0.77"
      },
      {
        "TARGET": "V3",
        "WIDTH": "(ceil($WIDTH/16)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/16)+0.5)/0.77"
      },
      {
        "TARGET": "L4",
        "WIDTH": "(ceil($WIDTH/32)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/32)+0.5)/0.77"
      },
      {
        "TARGET": "H4",
        "WIDTH": "(ceil($WIDTH/32)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/32)+0.5)/0.77"
      },
      {
        "TARGET": "V4",
        "WIDTH": "(ceil($WIDTH/32)+0.5)/0.77",
        "HEIGHT": "(ceil($HEIGHT/32)+0.5)/0.77"
      },
      {}
    ],
    "DESCRIPTION": "Bloom2"
  }
};
  const names=['threshold','intensity','radius','knee','scatter','opacity'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const isSupported=cfg=>cfg?.shaderPath==='v1/Bloom2/Bloom2';
  function migrate(legacy) {
    if(isSupported(legacy))return clone(legacy);
    const cfg=clone(template);
    cfg.intensityParamNames=[];
    for(const input of cfg.shaderConfig.INPUTS) {
      const old=legacy[input.NAME];
      if(old && typeof old==='object' && Number.isFinite(old.actualValue)) {
        input.DEFAULT=old.actualValue;
        if(old.hardCoded===false && Number.isFinite(old.intensityMin) && Number.isFinite(old.intensityMax)) {
          input.MIN=old.intensityMin;input.MAX=old.intensityMax;cfg.intensityParamNames.push(input.NAME);
        }
      }
    }
    return cfg;
  }
  function issues(cfg) {
    const errors=[];
    if(!Array.isArray(cfg.shaderConfig?.INPUTS) || !Array.isArray(cfg.shaderConfig?.PASSES) || !cfg.shaderConfig.PASSES.length || !Array.isArray(cfg.intensityParamNames))return ['Bloom2: нужны INPUTS, PASSES и intensityParamNames.'];
    for(const name of names) {
      const inputs=cfg.shaderConfig.INPUTS.filter(p=>p.NAME===name);
      if(inputs.length!==1 || inputs[0].TYPE!=='float' || !['MIN','MAX','DEFAULT'].every(k=>Number.isFinite(inputs[0][k])))errors.push('Bloom2: некорректный INPUT '+name);
      else if(inputs[0].DEFAULT<0)errors.push('Bloom2: '+name+' должен быть неотрицательным.');
      if(inputs.length===1 && cfg.intensityParamNames.includes(name) && [inputs[0].MIN,inputs[0].MAX].some(v=>!Number.isFinite(Math.fround(v)) || v<0))errors.push('Bloom2: некорректный диапазон общей силы для '+name);
    }
    return errors;
  }
  function preview(cfg,master=1) {
    const errors=issues(cfg);if(errors.length)throw Error(errors.join(' '));
    return Object.fromEntries(names.map(name=>{
      const input=cfg.shaderConfig.INPUTS.find(p=>p.NAME===name);
      // ISFIntensityCalculator.kt overwrites linked DEFAULT with MIN + t*(MAX-MIN).
      const value=cfg.intensityParamNames.includes(name)?input.MIN+master*(input.MAX-input.MIN):input.DEFAULT;
      return [name,{actualValue:value,hardCoded:true,intensityMin:value,intensityMax:value}];
    }));
  }
  globalThis.BloomContract={names,isSupported,migrate,issues,preview};
})();

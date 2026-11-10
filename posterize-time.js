/* Posterize Time prototype: media timestamps, never wall-clock render counts. */
(() => {
  'use strict';
  const F = Math.fround;
  const isSupported = cfg => cfg?.shaderPath === 'v1/PosterizeTime/PosterizeTime';
  function configIssues(cfg) {
    const p = cfg?.shaderConfig?.INPUTS?.filter(x => x.NAME === 'cadence') || [];
    const errors = [];
    if (p.length !== 1 || p[0].TYPE !== 'float' || !['MIN','MAX','DEFAULT'].every(k => Number.isFinite(p[0]?.[k]) && p[0][k] >= 0 && p[0][k] <= 1)) errors.push('Posterize Time: cadence должна быть в диапазоне 0…1.');
    if (!Array.isArray(cfg?.intensityParamNames) || cfg.intensityParamNames.some(x => x !== 'cadence')) errors.push('Posterize Time: допустим только связанный параметр cadence.');
    if (JSON.stringify(cfg?.shaderConfig?.PASSES) !== JSON.stringify([
      {TARGET:'HoldFrame',PERSISTENT:true},
      {TARGET:'HoldClock',PERSISTENT:true,WIDTH:'2.5/0.77',HEIGHT:'1.5/0.77'},
      {}
    ])) errors.push('Posterize Time: нужен исходный граф persistent-проходов.');
    return errors;
  }
  function resolve(cfg, master) {
    const errors = configIssues(cfg);
    if (errors.length) throw Error(errors.join(' '));
    if (!Number.isFinite(master) || master < 0 || master > 1) throw Error('Общая сила должна быть 0…1.');
    const p = cfg.shaderConfig.INPUTS.find(x => x.NAME === 'cadence');
    return cfg.intensityParamNames.includes('cadence') ? F(F(p.MIN) + F(F(master) * F(F(p.MAX) - F(p.MIN)))) : F(p.DEFAULT);
  }
  function rate(c) { return F(F(5 + F(20 * F(c))) + F(20 * Math.max(F(F(c) - .75), 0))); }
  function targetFps(c) { return c >= .999999 ? null : rate(c); }
  function bucket(time, c) { return Math.floor(F(F(F(Math.max(0, time)) * rate(c)) + F(.0001))) % 16777215; }
  function update(state, time, c, token) {
    if (!Number.isFinite(time) || time < 0 || !Number.isFinite(c) || c < 0 || c > 1) throw Error('Некорректное время или cadence.');
    const tick = bucket(time, c), setting = Math.floor(c * 65535 + .5);
    const capture = !state.valid || state.token !== token || time < state.time || state.setting !== setting || state.tick !== tick || c >= .999999;
    Object.assign(state, {valid:true, token, time, setting, tick});
    return capture;
  }
  let caches = new WeakMap();
  function reset() { caches = new WeakMap(); }
  function render(input, output, cfg, master, {time=0, token=input}={}) {
    const c = resolve(cfg, master);
    let state = caches.get(cfg);
    if (!state || state.width !== input.width || state.height !== input.height) {
      const canvas = document.createElement('canvas'); canvas.width=input.width; canvas.height=input.height;
      state = {canvas, width:input.width, height:input.height}; caches.set(cfg,state);
    }
    if (update(state,time,c,token)) {
      const ctx=state.canvas.getContext('2d'); ctx.clearRect(0,0,input.width,input.height); ctx.drawImage(input,0,0);
    }
    const ctx=output.getContext('2d');ctx.clearRect(0,0,output.width,output.height);ctx.drawImage(state.canvas,0,0);
  }
  globalThis.PosterizeTime = {isSupported,configIssues,resolve,targetFps,bucket,update,render,reset};
})();

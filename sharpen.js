/* Browser reference for the supplied Sharpen.ps; shader code is never evaluated
 * from imported files. Only the known Sharpen ISF contract is supported. */
(() => {
  'use strict';
  let engine;
  const isSupported=cfg=>/^(?:v1\/Sharpen\/)?Sharpen$/i.test(cfg?.shaderPath||'');
  function configIssues(cfg) {
    const issues=[];
    if (!isSupported(cfg)) return ['Поддерживается shaderPath: v1/Sharpen/Sharpen.'];
    if (!Array.isArray(cfg.shaderConfig?.INPUTS) || !Array.isArray(cfg.intensityParamNames)) return ['Sharpen: нужны shaderConfig.INPUTS и intensityParamNames.'];
    const inputs=cfg.shaderConfig.INPUTS;
    for (const name of ['sharpenAmount','stepSize']) {
      const fields=inputs.filter(p=>p.NAME===name);
      if (fields.length!==1) {issues.push(`Sharpen: нужен один INPUT ${name}.`);continue;}
      const p=fields[0], max=name==='sharpenAmount'?2:.02;
      const used=cfg.intensityParamNames.includes(name)?[p.MIN,p.MAX]:[p.DEFAULT];
      if (![p.DEFAULT,p.MIN,p.MAX].every(Number.isFinite) || used.some(v=>v<0||v>max)) issues.push(`${name}: рабочий диапазон этой подборки 0…${max}. Это предел редактора, не установленный предел движка.`);
    }
    if (cfg.intensityParamNames.some(name=>!['sharpenAmount','stepSize'].includes(name))) issues.push('Sharpen: неизвестное имя в intensityParamNames.');
    if (new Set(cfg.intensityParamNames).size!==cfg.intensityParamNames.length) issues.push('Sharpen: повтор имени в intensityParamNames.');
    return issues;
  }
  function resolve(cfg,master) {
    const issues=configIssues(cfg);
    if (issues.length) throw Error(issues.join(' '));
    return Object.fromEntries(cfg.shaderConfig.INPUTS.filter(p=>['sharpenAmount','stepSize'].includes(p.NAME)).map(p=>[p.NAME,
      cfg.intensityParamNames.includes(p.NAME)?p.MIN+master*(p.MAX-p.MIN):p.DEFAULT]));
  }
  function create() {
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
    if (!gl) throw Error('Sharpen требует WebGL 2.');
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
    const program=gl.createProgram();
    const shaders=[compile(gl.VERTEX_SHADER,`#version 300 es
      void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0,1);}`),
      compile(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;
      uniform sampler2D source;uniform vec2 size;uniform float sharpenAmount,stepSize;
      out vec4 result;
      void main(){
        vec2 uv=vec2(gl_FragCoord.x/size.x,1.-gl_FragCoord.y/size.y);
        vec2 d=vec2(stepSize*1.5);
        vec3 a=texture(source,uv+vec2(-d.x,-d.y)).rgb;
        vec3 b=texture(source,uv+vec2(d.x,-d.y)).rgb;
        vec3 c=texture(source,uv+vec2(-d.x,d.y)).rgb;
        vec3 e=texture(source,uv+d).rgb;
        vec4 center=texture(source,uv);
        result=vec4(center.rgb+(center.rgb-(a+b+c+e)*.25)*sharpenAmount,center.a);
      }`)];
    for(const shader of shaders){gl.attachShader(program,shader);gl.deleteShader(shader);}
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
    for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
    const u=Object.fromEntries(['source','size','sharpenAmount','stepSize'].map(name=>[name,gl.getUniformLocation(program,name)]));
    return {canvas,gl,program,texture,u};
  }
  function render(input,output,cfg,master=1) {
    const values=resolve(cfg,master),ctx=output.getContext('2d',{willReadFrequently:true});
    if(values.sharpenAmount===0||values.stepSize===0){ctx.clearRect(0,0,output.width,output.height);ctx.drawImage(input,0,0);return;}
    engine ||= create();
    const {canvas,gl,program,texture,u}=engine;
    if(gl.isContextLost()){engine=null;throw Error('Sharpen: видеоускорение временно недоступно.');}
    if(canvas.width!==input.width)canvas.width=input.width;
    if(canvas.height!==input.height)canvas.height=input.height;
    gl.disable(gl.DITHER);gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,input);
    gl.uniform1i(u.source,0);gl.uniform2f(u.size,canvas.width,canvas.height);
    gl.uniform1f(u.sharpenAmount,values.sharpenAmount);gl.uniform1f(u.stepSize,values.stepSize);
    gl.drawArrays(gl.TRIANGLES,0,3);ctx.clearRect(0,0,output.width,output.height);ctx.drawImage(canvas,0,0);
  }
  window.SharpenRender={render,resolve,configIssues,isSupported};
})();

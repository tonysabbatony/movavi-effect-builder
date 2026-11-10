/* SDR review renderer. VHS/Soft Blur/Noise are explicitly approximate previews;
 * mobile exports retain the native effect types and authored parameter values. */
(() => {
  'use strict';
  const types=['colorDuotone','falseColor','noiseLeeCranston','vhsDistortion','softBlur'];let engine;
  const supports=type=>types.includes(type);
  function create(){
    const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw Error('Для предпросмотра нужен WebGL 2.');
    const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,`#version 300 es
      void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0,1);}`));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;uniform sampler2D source;uniform vec2 size;uniform int mode;uniform float a,b,time,mono;uniform vec3 bright,dark;out vec4 result;
      float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      vec3 blur(vec2 uv,vec2 d){vec3 sum=vec3(0);for(int i=-4;i<=4;i++)sum+=texture(source,uv+d*float(i)).rgb;return sum/9.;}
      void main(){vec2 uv=vec2(gl_FragCoord.x/size.x,1.-gl_FragCoord.y/size.y);vec4 src=texture(source,uv);vec3 rgb=src.rgb;float l=dot(rgb,vec3(.2126,.7152,.0722));
        if(mode==0){vec3 tone=l>=.5?mix(bright,vec3(1),(l-.5)*2.):mix(vec3(0),bright,l*2.);rgb=mix(rgb,tone,a);}
        if(mode==1)rgb=mix(dark,bright,l);
        if(mode==2){vec2 seed=floor(uv*size)+time;float n=hash(seed)-.5;vec3 noise=mono>.5?vec3(n):vec3(n,hash(seed+17.)-.5,hash(seed+93.)-.5);rgb+=noise*a;}
        if(mode==3){float line=floor(uv.y*size.y);float jitter=(hash(vec2(line,floor(time*15.)))-.5)*a*.025;vec2 p=uv+vec2(jitter,0);vec2 d=vec2(b*2./size.x,0);rgb=vec3(blur(p+vec2(.006*a,0),d).r,blur(p,d).g,blur(p-vec2(.006*a,0),d).b);rgb*=1.-.12*a*(.5+.5*sin(uv.y*size.y*3.14159265));rgb+=vec3(hash(uv*size+time)-.5)*a*.06;}
        if(mode==4){vec3 sum=vec3(0);for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++)sum+=texture(source,uv+vec2(x,y)*max(1.,b*2.)/size).rgb;rgb=mix(rgb,sum/25.,a);}
        result=vec4(clamp(rgb,0.,1.),src.a);
      }`));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);for(const n of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,n,gl.LINEAR);for(const n of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,n,gl.CLAMP_TO_EDGE);
    const u=Object.fromEntries(['source','size','mode','a','b','time','mono','bright','dark'].map(n=>[n,gl.getUniformLocation(program,n)]));return {canvas,gl,program,texture,u};
  }
  function render(input,output,type,cfg,time=0){
    if(!supports(type))throw Error('Неизвестный эффект.');engine ||= create();const {canvas,gl,program,texture,u}=engine;
    if(gl.isContextLost()){engine=null;throw Error('Видеоускорение временно недоступно.');}
    if(canvas.width!==input.width)canvas.width=input.width;if(canvas.height!==input.height)canvas.height=input.height;
    const value=p=>typeof p==='object'?Number(p.actualValue):Number(p),color=c=>[value(c?.red)||0,value(c?.green)||0,value(c?.blue)||0];
    gl.viewport(0,0,canvas.width,canvas.height);gl.disable(gl.DITHER);gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,input);
    gl.uniform1i(u.source,0);gl.uniform2f(u.size,input.width,input.height);gl.uniform1i(u.mode,types.indexOf(type));
    gl.uniform1f(u.a,value(cfg.intensity??cfg.ditherAmount??cfg.softness) || 0);gl.uniform1f(u.b,value(cfg.blurAmount??cfg.depth)||0);gl.uniform1f(u.time,type==='noiseLeeCranston'&&!cfg.animated?0:time);gl.uniform1f(u.mono,cfg.monochrome?1:0);gl.uniform3fv(u.bright,color(cfg.color??cfg.brightColor));gl.uniform3fv(u.dark,color(cfg.darkColor));
    gl.drawArrays(gl.TRIANGLES,0,3);const ctx=output.getContext('2d');ctx.clearRect(0,0,output.width,output.height);ctx.drawImage(canvas,0,0);
  }
  globalThis.ExtraEffects={supports,render};
})();

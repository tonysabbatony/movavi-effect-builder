/* Experimental linear-light, multiscale GPU bloom. Independent implementation;
 * not a port of Deep Glow. All intermediate targets are reused between frames. */
(() => {
'use strict';
let engine;
const vertex=`#version 300 es
out vec2 uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
const header=`#version 300 es
precision highp float;
in vec2 uv;out vec4 color;uniform sampler2D src;
vec3 linearize(vec3 v){return mix(v/12.92,pow((v+.055)/1.055,vec3(2.4)),step(vec3(.04045),v));}
vec3 encode(vec3 v){return mix(v*12.92,1.055*pow(max(v,vec3(0)),vec3(1./2.4))-.055,step(vec3(.0031308),v));}
`;
function create(){
 const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
 if(!gl)throw Error('Bloom Rework требует WebGL 2.');
 const half=!!gl.getExtension('EXT_color_buffer_float');
 const program=body=>{const p=gl.createProgram();for(const [type,code]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,header+body]]){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;};
 const pre=program(`uniform float threshold,knee;uniform vec2 texel;
 vec3 pick(vec2 p){vec4 s=texture(src,p);vec3 c=linearize(s.rgb)*s.a;float b=max(c.r,max(c.g,c.b));float t=linearize(vec3(threshold)).r;float k=max(t*knee,.00001);float soft=clamp(b-t+k,0.,2.*k);soft=soft*soft/(4.*k);return c*(max(b-t,soft)/max(b,.00001));}
 void main(){color=vec4((pick(uv+texel*vec2(-.5,-.5))+pick(uv+texel*vec2(.5,-.5))+pick(uv+texel*vec2(-.5,.5))+pick(uv+texel*vec2(.5,.5)))*.25,1);}`);
 const blur=program(`uniform vec2 direction;void main(){color=texture(src,uv)*.227027027; color+=(texture(src,uv+direction*1.384615385)+texture(src,uv-direction*1.384615385))*.316216216; color+=(texture(src,uv+direction*3.230769231)+texture(src,uv-direction*3.230769231))*.070270270;}`);
 const down=program(`uniform vec2 texel;void main(){color=(texture(src,uv+texel*vec2(-.5,-.5))+texture(src,uv+texel*vec2(.5,-.5))+texture(src,uv+texel*vec2(-.5,.5))+texture(src,uv+texel*vec2(.5,.5)))*.25;}`);
 const composite=program(`uniform sampler2D b0,b1,b2,b3,b4;uniform float intensity,opacity,scatter;
 void main(){vec2 p=vec2(uv.x,1.-uv.y);vec4 original=texture(src,p);vec3 base=linearize(original.rgb);float s=clamp(scatter,0.,2.),wide=min(s,1.),extra=max(s-1.,0.);float a=mix(mix(.65,.08,wide),.02,extra),b=mix(mix(.2,.12,wide),.04,extra),c=mix(mix(.1,.2,wide),.1,extra),d=mix(mix(.04,.27,wide),.24,extra),e=mix(mix(.01,.33,wide),.6,extra);vec3 glow=texture(b0,p).rgb*a+texture(b1,p).rgb*b+texture(b2,p).rgb*c+texture(b3,p).rgb*d+texture(b4,p).rgb*e;vec3 screen=base+(1.-base)*(1.-exp(-glow*intensity*3.));color=vec4(encode(mix(base,screen,opacity)),original.a);}`);
 const texture=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
 const source=texture(),fb=gl.createFramebuffer();let levels=[],dimensions='';
 function resize(w,h){const size=w+'x'+h;if(size===dimensions)return;dimensions=size;canvas.width=w;canvas.height=h;for(const l of levels)for(const t of l.textures)gl.deleteTexture(t);levels=[];for(let i=0;i<5;i++){const width=Math.max(1,Math.ceil(w/2**(i+1))),height=Math.max(1,Math.ceil(h/2**(i+1)));const textures=[texture(),texture()];for(const t of textures){gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,half?gl.RGBA16F:gl.RGBA8,width,height,0,gl.RGBA,half?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);}levels.push({width,height,textures});}}
 function draw(p,input,target,w,h,uniforms={}){gl.bindFramebuffer(gl.FRAMEBUFFER,target?fb:null);if(target){gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Bloom Rework: недоступен промежуточный буфер GPU.');}gl.viewport(0,0,w,h);gl.useProgram(p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,input);gl.uniform1i(gl.getUniformLocation(p,'src'),0);for(const [name,value]of Object.entries(uniforms)){const u=gl.getUniformLocation(p,name);if(Array.isArray(value))gl.uniform2f(u,...value);else gl.uniform1f(u,value);}gl.drawArrays(gl.TRIANGLES,0,3);}
 return {canvas,gl,half,render(input,output,cfg,options){
  if(gl.isContextLost()){engine=null;throw Error('Bloom Rework: видеоускорение временно недоступно.');}
  const threshold=Number(cfg.threshold.actualValue),intensity=Number(cfg.intensity.actualValue),radius=Number(cfg.radius.actualValue);
  const {knee,scatter,opacity}=options;
  if(![threshold,intensity,radius,knee,scatter,opacity].every(Number.isFinite)||threshold<0||threshold>1||intensity<0||radius<0||radius>300||knee<0||knee>1||scatter<0||scatter>2||opacity<0||opacity>1)throw Error('Bloom Rework: недопустимое значение параметра.');
  const ctx=output.getContext('2d',{willReadFrequently:true});
  if(intensity===0 || opacity===0){ctx.clearRect(0,0,output.width,output.height);ctx.drawImage(input,0,0);return;}
  resize(input.width,input.height);gl.disable(gl.DITHER);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,input);
  const spread=Math.max(.25,Math.min(4.5,radius/50));
  for(let i=0;i<levels.length;i++){const l=levels[i],prev=levels[i-1];draw(i===0?pre:down,i===0?source:prev.textures[0],l.textures[0],l.width,l.height,i===0?{threshold,knee,texel:[1/input.width,1/input.height]}:{texel:[1/prev.width,1/prev.height]});draw(blur,l.textures[0],l.textures[1],l.width,l.height,{direction:[spread/l.width,0]});draw(blur,l.textures[1],l.textures[0],l.width,l.height,{direction:[0,spread/l.height]});}
  gl.useProgram(composite);for(let i=0;i<5;i++){gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,levels[i].textures[0]);gl.uniform1i(gl.getUniformLocation(composite,'b'+i),i+1);}
  draw(composite,source,null,input.width,input.height,{intensity,opacity,scatter});ctx.clearRect(0,0,output.width,output.height);ctx.drawImage(canvas,0,0);
 },info:()=>({precision:half?'RGBA16F':'RGBA8',levels:5,passes:16})};
}
window.BloomRework={render(input,output,cfg,options={knee:.5,scatter:.65,opacity:1}){engine ||= create();return engine.render(input,output,cfg,options);},info:()=>engine?.info()};
})();

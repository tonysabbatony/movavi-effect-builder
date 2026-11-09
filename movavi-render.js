/* Port of Movavi EffectsCollection.metal: ChromaticAberrationMultiPass and Bloom.
 * The host still uses 8-bit Canvas surfaces; full-pipeline parity is not claimed.
 */
(() => {
  'use strict';
  function parameter(config, intensity) {
    return config.hardCoded ? Number(config.actualValue)
      : Number(config.intensityMin) + intensity * (Number(config.intensityMax) - Number(config.intensityMin));
  }
  function resolve(config, intensity) {
    if (!config || typeof config !== 'object') return config;
    if (Array.isArray(config)) return config.map(v => resolve(v, intensity));
    const result = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, resolve(v, intensity)]));
    if ('actualValue' in config && 'hardCoded' in config) result.actualValue = parameter(config, intensity);
    return result;
  }
  const fragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D source;
uniform vec2 size;
uniform float strength;
uniform float overlap;
out vec4 result;
void main() {
  // Canvas uploads store the top row at texture y=0; framebuffer y runs upward.
  vec2 tid = vec2(floor(gl_FragCoord.x), size.y - 1.0 - floor(gl_FragCoord.y));
  vec2 uv = tid / size;
  vec2 diff = (uv - vec2(0.5)) * strength;
  float offset = 1.0 - overlap;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 64; ++i) {
    float t = float(64 - i) / 64.0 - 0.5;
    sum.r += texture(source, uv - diff * (-offset + t)).r;
    sum.g += texture(source, uv - diff * t).g;
    sum.b += texture(source, uv - diff * (offset + t)).b;
  }
  result = vec4(sum / 64.0, texture(source, uv).a);
}`;
  const bloomFragment = `#version 300 es
precision highp float;
uniform sampler2D source;
uniform vec2 size;
uniform float threshold;
uniform float intensity;
uniform float radius;
out vec4 result;
void main() {
  vec2 tid = vec2(floor(gl_FragCoord.x), size.y - 1.0 - floor(gl_FragCoord.y));
  vec2 uv = tid / size;
  vec4 color = texture(source, uv);
  vec4 blurred = color;
  for (int i = 1; i <= 6; ++i) {
    vec2 d = vec2(radius) / size / float(i);
    blurred += texture(source, uv + vec2(d.x, d.y));
    blurred += texture(source, uv + vec2(-d.x, d.y));
    blurred += texture(source, uv + vec2(d.x, -d.y));
    blurred += texture(source, uv + vec2(-d.x, -d.y));
  }
  // Deliberately 24, not 25: matches the production Metal implementation.
  blurred /= 24.0;
  vec4 highlight = clamp(blurred - threshold, 0.0, 1.0) / (1.0 - threshold);
  result = 1.0 - (1.0 - color) * (1.0 - highlight * intensity);
}`;
  function bloomValues(config) {
    return {
      threshold: Math.fround(Number(config.threshold?.actualValue)),
      intensity: Math.fround(Number(config.intensity?.actualValue)),
      radius: Number(config.radius?.actualValue)
    };
  }
  function bloomDiagnostics(config) {
    const {threshold:t, intensity:i, radius:r} = bloomValues(config);
    const errors = [], notes = [];
    if (![t,i,r].every(Number.isFinite)) errors.push('Bloom: нужно конечное числовое значение; число может переполнять Float32.');
    if (t < 0 || t > 1) errors.push('Bloom: движок отклоняет Threshold вне 0…1.');
    if (t === 1) errors.push('Bloom: Threshold округляется до 1 в Float32 — деление на ноль. Preview этого слоя остановлен; вылет Movavi не подтверждён.');
    if (i < 0) errors.push('Bloom: движок отклоняет Intensity < 0.');
    if (r < 0 || r > 4294967295) errors.push('Bloom: Radius вне представимого диапазона UInt32. Не используйте такое значение для сравнения.');
    if (t >= 0.99 && t < 1) notes.push('Threshold близок к 1: деление на малое число может усилить остаточные блики. Это не надёжный способ выключения.');
    if (i === 0 && t >= 0 && t < 1) notes.push('Intensity = 0: добавка свечения выключена. Сам проход сохраняет выборку изображения как в Metal.');
    if (i > 1) notes.push('Intensity > 1 движок допускает; возможен пересвет. Верхний порог вылета в исходниках не задан.');
    if (Number.isFinite(r) && r >= 0 && r !== Math.trunc(r)) notes.push(`Radius ${r} передаётся как целое ${Math.trunc(r)}.`);
    if (r === 0) notes.push('Radius = 0 не выключает Bloom: остаётся порог и смешивание.');
    return {errors, notes};
  }
  let renderer, bloomRenderer;

  function createRenderer(code = fragment, names = ['strength', 'overlap']) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true});
    if (!gl) throw new Error('Для Bloom и Aberration нужен WebGL 2. Открой редактор в Chrome с аппаратным ускорением.');
    function compile(type, text) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, code));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.disable(gl.DITHER);
    const locations = Object.fromEntries(['source', 'size', ...names].map(n => [n, gl.getUniformLocation(program, n)]));
    return {canvas, gl, program, texture, locations};
  }
  function aberration(input, output, config) {
    const strength = Number(config.strength.actualValue), overlap = Number(config.overlap.actualValue);
    if (![strength, overlap].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) {
      throw new Error('Movavi допускает Strength и Overlap только от 0 до 1. Исходный JSON не изменён.');
    }
    renderer ||= createRenderer();
    draw(input, output, renderer, {strength, overlap});
  }
  function bloom(input, output, config) {
    const diagnostic = bloomDiagnostics(config);
    if (diagnostic.errors.length) throw new Error(diagnostic.errors.join(' '));
    const values = bloomValues(config);
    values.radius = Math.trunc(values.radius);
    bloomRenderer ||= createRenderer(bloomFragment, ['threshold', 'intensity', 'radius']);
    draw(input, output, bloomRenderer, values);
  }
  function draw(input, output, renderState, values) {
    const {canvas, gl, program, texture, locations: u} = renderState;
    if (gl.isContextLost()) { renderer = bloomRenderer = null; throw new Error('Видеоускорение временно недоступно. Повтори просмотр.'); }
    if (canvas.width !== input.width) canvas.width = input.width;
    if (canvas.height !== input.height) canvas.height = input.height;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input);
    gl.uniform1i(u.source, 0); gl.uniform2f(u.size, canvas.width, canvas.height);
    for (const [name, value] of Object.entries(values)) gl.uniform1f(u[name], value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const ctx = output.getContext('2d', {willReadFrequently: true});
    ctx.clearRect(0, 0, output.width, output.height);
    ctx.drawImage(canvas, 0, 0);
  }
  window.MovaviRender = {parameter, resolve, aberration, bloom, bloomDiagnostics};
})();

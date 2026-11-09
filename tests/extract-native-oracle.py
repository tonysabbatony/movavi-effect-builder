"""Extract the actual checkout kernels for independent Metal reference tests.
Usage: python3 tests/extract-native-oracle.py ENGINE_PROC_DIR SCRATCH_DIR
Does not modify the engine checkout or the reference package.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

engine, out = map(Path, sys.argv[1:3])
out.mkdir(parents=True, exist_ok=True)
paths = {
    'effects': engine / 'Effects/EffectsMetal/Shaders/EffectsCollection.metal',
    'common': engine / 'Metal/Shaders/CommonKernels.metal',
    'types': engine / 'Effects/EffectsMetal/Shaders/EffectsKernelTypes.h',
    'temperature': engine / 'Effects/EffectsMetal/EffectGIMPColorTemperature.cpp',
    'colors': engine / 'Metal/Shaders/ColorSpaces.metal',
}
s = {k: p.read_text() for k, p in paths.items()}

def block(text, start):
    a = text.index(start)
    b = text.index('{', a)
    level = 1
    end = b + 1
    while level:
        level += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[a:end]

names = ['ColorCorrectionParams', 'ColorBalanceParams', 'GIMPHueSaturationParams',
         'GIMPColorTemperatureParams', 'GIMPShadowsHightlightsParams', 'LutEffectParams']
types = block(s['types'], 'enum class InterpolateMode') + ';\n'
types += '\n'.join(block(s['types'], 'struct ' + name) + ';' for name in names)
(out / 'NativeTypes.h').write_text('#include <simd/simd.h>\nusing namespace simd;\n' + types)
common = s['common'][s['common'].index('float4 movavi_mixRGBA_'):s['common'].index('float3 movavi_RGB2YIQ_')]
functions = '\n'.join(block(s['effects'], 'namespace ' + name) for name in ['HueSaturation', 'ShadowsHightlights', 'LUT'])
kernels = '\n'.join(block(s['effects'], 'kernel void ' + name) for name in [
    'ColorCorrection', 'GIMPHueSaturation', 'GIMPShadowsHightlights', 'GIMPColorTemperature', 'ColorBalance', 'ApplyCubeToImage'])
transfers = s['colors'][s['colors'].index('constant float BT1886_GAMMA'):s['colors'].index('// **************************************************************************** //', s['colors'].index('constant float BT1886_GAMMA'))]
metal = '#include <metal_stdlib>\nusing namespace metal;\n' + types + '\nconstant float3 g_YpPbPrBias{0,.5,.5};\nconstexpr sampler sNorm(coord::normalized, min_filter::linear, mag_filter::linear, mip_filter::linear);\n'
metal += common + functions + transfers + kernels
metal += '''
kernel void Linear(texture2d<float, access::read> src [[texture(0)]], texture2d<float, access::write> dst [[texture(1)]], uint2 p [[thread_position_in_grid]]){
 if(p.x<dst.get_width()&&p.y<dst.get_height()){float4 c=src.read(p);c.rgb=rec709_to_display_linear(c.rgb);dst.write(c,p);}}
kernel void Encode709(texture2d<float, access::read> src [[texture(0)]], texture2d<float, access::write> dst [[texture(1)]], uint2 p [[thread_position_in_grid]]){
 if(p.x<dst.get_width()&&p.y<dst.get_height()){float4 c=src.read(p);c.rgb=display_linear_to_rec709(c.rgb);dst.write(c,p);}}
'''
(out / 'NativeOracle.metal').write_text(metal.replace('simd::', ''))
temperature = s['temperature'][s['temperature'].index('constexpr float rgb_r55'):s['temperature'].index('} // namespace')]
(out / 'NativeTemperature.h').write_text('constexpr float LOWEST_TEMPERATURE=1000.f, HIGHEST_TEMPERATURE=12000.f;\n' + temperature)
(out / 'source-hashes.json').write_text(json.dumps({str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths.values()}, indent=2))
print('Extracted unchanged kernel bodies and temperature coefficients from local engine')

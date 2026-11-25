#include <metal_stdlib>
#include <simd/simd.h>
using namespace metal;

// Layout follows the mobile ISF parser: defaults, images, named passes, floats.
struct VVISF_UNIFORMS {
    int PASSINDEX; float TIME; float2 RENDERSIZE; float4 DATE;
    float TIMEDELTA; int FRAMEINDEX; float2 PADDING_INFO;
    float4 _inputImage_imgRect; float2 _inputImage_imgSize; uint _inputImage_flip; int _inputImage_padding;
    float4 _HoldFrame_imgRect; float2 _HoldFrame_imgSize; uint _HoldFrame_flip; int _HoldFrame_padding;
    float4 _HoldClock_imgRect; float2 _HoldClock_imgSize; uint _HoldClock_flip; int _HoldClock_padding;
    float cadence; float framesPerSecond;
};
struct VVPosterizeTimeVertFunc_out {
    float2 isf_FragNormCoord [[user(locn0)]];
    float4 position [[position]];
};
struct VVPosterizeTimeVertFunc_in { float4 VERTEXDATA [[attribute(0)]]; };
vertex VVPosterizeTimeVertFunc_out VVPosterizeTimeVertFunc(VVPosterizeTimeVertFunc_in in [[stage_in]], constant VVISF_UNIFORMS& u [[buffer(0)]]) {
    VVPosterizeTimeVertFunc_out out;
    out.position=float4(2.0*in.VERTEXDATA.x/u.RENDERSIZE.x-1.0,1.0-2.0*in.VERTEXDATA.y/u.RENDERSIZE.y,0,1);
    out.isf_FragNormCoord=(out.position.xy+1.0)*0.5;
    return out;
}

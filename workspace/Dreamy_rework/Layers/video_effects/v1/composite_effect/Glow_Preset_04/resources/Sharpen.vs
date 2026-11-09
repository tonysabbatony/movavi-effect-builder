
#include <metal_stdlib>
#include <simd/simd.h>

using namespace metal;

struct VVISF_UNIFORMS
{
    int PASSINDEX;
    float TIME;
    float2 RENDERSIZE;
    float4 DATE;
    float TIMEDELTA;
    int FRAMEINDEX;
    float2 PADDING_INFO;
    float4 _inputImage_imgRect;
    float2 _inputImage_imgSize;
    uint _inputImage_flip;
    int _inputImage_padding;
    float sharpenAmount;
    float stepSize;
};

struct VVSharpenVertFunc_out
{
    float2 isf_FragNormCoord [[user(locn0)]];
    float2 isf_FragCoord [[user(locn1)]];
    float4 gl_Position [[position]];
};

struct VVSharpenVertFunc_in
{
    float4 VERTEXDATA [[attribute(0)]];
};

static inline __attribute__((always_inline))
void isf_vertShaderInit(constant VVISF_UNIFORMS& _20, thread float4& gl_Position, thread float4& VERTEXDATA, thread float2& isf_FragNormCoord, thread float2& isf_FragCoord)
{
    float4x4 projectionMatrix = float4x4(float4(2.0 / _20.RENDERSIZE.x, 0.0, 0.0, -1.0), float4(0.0, (-2.0) / _20.RENDERSIZE.y, 0.0, 1.0), float4(0.0, 0.0, -1.0, 0.0), float4(0.0, 0.0, 0.0, 1.0));
    gl_Position = VERTEXDATA * projectionMatrix;
    isf_FragNormCoord = float2((gl_Position.x + 1.0) / 2.0, (gl_Position.y + 1.0) / 2.0);
    isf_FragCoord = floor(isf_FragNormCoord * _20.RENDERSIZE);
}

vertex VVSharpenVertFunc_out VVSharpenVertFunc(VVSharpenVertFunc_in in [[stage_in]], constant VVISF_UNIFORMS& _20 [[buffer(0)]])
{
    VVSharpenVertFunc_out out = {};
    isf_vertShaderInit(_20, out.gl_Position, in.VERTEXDATA, out.isf_FragNormCoord, out.isf_FragCoord);
    return out;
}
#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <simd/simd.h>
#include <vector>
#include <cmath>
#include <cstdio>
#include <cstddef>
using namespace simd;
static void require(bool value,NSString *why){if(!value){fprintf(stderr,"FAIL %s\n",why.UTF8String);exit(1);}}
struct Uniforms {
 int pass;float time;float2 size;float4 date;float delta;int index;float2 padding;
 float4 imageRect;float2 imageSize;unsigned imageFlip;int p0;
 float4 heldRect;float2 heldSize;unsigned heldFlip;int p1;
 float4 clockRect;float2 clockSize;unsigned clockFlip;int p2;
 float cadence;
};
static_assert(offsetof(Uniforms,cadence)==144);
static_assert(sizeof(Uniforms)==160);
struct Renderer {
 id<MTLDevice> device;id<MTLCommandQueue> queue;id<MTLRenderPipelineState> pipeline;id<MTLSamplerState> sampler;
 id<MTLTexture> held,clock;int w=0,h=0;
 Renderer(id<MTLDevice> d,id<MTLLibrary> library,MTLPixelFormat format):device(d) {
  queue=[device newCommandQueue];MTLRenderPipelineDescriptor *p=[MTLRenderPipelineDescriptor new];
  p.vertexFunction=[library newFunctionWithName:@"VVPosterizeTimeVertFunc"];
  p.fragmentFunction=[library newFunctionWithName:@"VVPosterizeTimeFragFunc"];
  p.colorAttachments[0].pixelFormat=format;
  MTLVertexDescriptor *v=[MTLVertexDescriptor vertexDescriptor];v.attributes[0].format=MTLVertexFormatFloat4;v.attributes[0].bufferIndex=1;v.layouts[1].stride=sizeof(float4);p.vertexDescriptor=v;
  NSError *e=nil;pipeline=[device newRenderPipelineStateWithDescriptor:p error:&e];require(pipeline!=nil,e.localizedDescription);
  MTLSamplerDescriptor *s=[MTLSamplerDescriptor new];s.minFilter=MTLSamplerMinMagFilterLinear;s.magFilter=MTLSamplerMinMagFilterLinear;s.sAddressMode=MTLSamplerAddressModeClampToEdge;s.tAddressMode=MTLSamplerAddressModeClampToEdge;sampler=[device newSamplerStateWithDescriptor:s];
 }
 id<MTLTexture> texture(int width,int height,MTLPixelFormat format) {
  auto d=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:format width:width height:height mipmapped:NO];d.storageMode=MTLStorageModeShared;d.usage=MTLTextureUsageShaderRead|MTLTextureUsageRenderTarget;
  auto t=[device newTextureWithDescriptor:d];std::vector<unsigned char> zero(width*height*4,0);[t replaceRegion:MTLRegionMake2D(0,0,width,height) mipmapLevel:0 withBytes:zero.data() bytesPerRow:width*4];return t;
 }
 std::vector<unsigned char> render(const std::vector<unsigned char>& bytes,int width,int height,float time,float delta,float cadence,MTLPixelFormat format) {
  if(w!=width||h!=height){w=width;h=height;held=texture(w,h,format);clock=texture(2,1,format);}
  auto src=texture(w,h,format);[src replaceRegion:MTLRegionMake2D(0,0,w,h) mipmapLevel:0 withBytes:bytes.data() bytesPerRow:w*4];
  Uniforms u={};u.time=time;u.delta=delta;u.size=(float2){float(w),float(h)};u.cadence=cadence;u.imageRect=u.heldRect=u.clockRect=(float4){0,0,1,1};u.imageSize=u.heldSize=u.size;u.clockSize=(float2){2,1};u.imageFlip=u.heldFlip=u.clockFlip=1;
  float4 vertices[]={(float4){0,0,0,1},(float4){0,float(h),0,1},(float4){float(w),0,0,1},(float4){float(w),float(h),0,1}};
  auto command=[queue commandBuffer];id<MTLTexture> dst=nil;
  for(int pass=0;pass<3;pass++){
   dst=texture(pass==1?2:w,pass==1?1:h,format);u.pass=pass;
   auto d=[MTLRenderPassDescriptor renderPassDescriptor];d.colorAttachments[0].texture=dst;d.colorAttachments[0].loadAction=MTLLoadActionClear;d.colorAttachments[0].storeAction=MTLStoreActionStore;
   auto enc=[command renderCommandEncoderWithDescriptor:d];[enc setRenderPipelineState:pipeline];[enc setVertexBytes:&u length:sizeof(u) atIndex:0];[enc setFragmentBytes:&u length:sizeof(u) atIndex:0];[enc setVertexBytes:vertices length:sizeof(vertices) atIndex:1];
   [enc setFragmentTexture:src atIndex:0];[enc setFragmentTexture:held atIndex:1];[enc setFragmentTexture:clock atIndex:2];[enc setFragmentSamplerState:sampler atIndex:0];[enc drawPrimitives:MTLPrimitiveTypeTriangleStrip vertexStart:0 vertexCount:4];[enc endEncoding];
   if(pass==0)held=dst;if(pass==1)clock=dst;
  }
  [command commit];[command waitUntilCompleted];require(command.status==MTLCommandBufferStatusCompleted,command.error.localizedDescription);
  std::vector<unsigned char> out(w*h*4);[dst getBytes:out.data() bytesPerRow:w*4 fromRegion:MTLRegionMake2D(0,0,w,h) mipmapLevel:0];return out;
 }
};
static std::vector<unsigned char> pattern(int frame,int w,int h) {
 std::vector<unsigned char> b(w*h*4);for(int y=0;y<h;y++)for(int x=0;x<w;x++){int n=(y*w+x)*4;b[n]=(frame*13+x*7)%256;b[n+1]=(frame*17+y*19)%256;b[n+2]=(x*11+y*31)%256;b[n+3]=(x+y)%3==0?0:255;}return b;
}
int main(int argc,char **argv){@autoreleasepool{
 require(argc==2||argc==3,@"usage: metal-oracle SHADER_DIRECTORY [fast]");NSString *root=@(argv[1]);
 NSString *vs=[NSString stringWithContentsOfFile:[root stringByAppendingPathComponent:@"PosterizeTime.vs"] encoding:NSUTF8StringEncoding error:nil];
 NSMutableString *ps=[[NSString stringWithContentsOfFile:[root stringByAppendingPathComponent:@"PosterizeTime.ps"] encoding:NSUTF8StringEncoding error:nil] mutableCopy];
 NSRange a=[ps rangeOfString:@"struct VVISF_UNIFORMS"],b=[ps rangeOfString:@"};" options:0 range:NSMakeRange(a.location,ps.length-a.location)];[ps deleteCharactersInRange:NSMakeRange(a.location,b.location+2-a.location)];
 [ps replaceOccurrencesOfString:@"#include <metal_stdlib>" withString:@"" options:0 range:NSMakeRange(0,ps.length)];[ps replaceOccurrencesOfString:@"#include <simd/simd.h>" withString:@"" options:0 range:NSMakeRange(0,ps.length)];
 auto device=MTLCreateSystemDefaultDevice();require(device!=nil,@"Metal device unavailable");NSError *error=nil;MTLCompileOptions *options=[MTLCompileOptions new];options.fastMathEnabled=argc==3;
 auto library=[device newLibraryWithSource:[vs stringByAppendingString:ps] options:options error:&error];require(library!=nil,error.localizedDescription);
 int count=0,cases=0;
 for(auto format:{MTLPixelFormatRGBA8Unorm,MTLPixelFormatBGRA8Unorm})for(float sourceFps:{24.f,29.97f,30.f,60.f})for(float c:{0.f,.25f,.5f,.75f,1.f}){
  Renderer r(device,library,format);std::vector<unsigned char> expected;long previousTick=-1;float previousTime=0;
  for(int i=0;i<150;i++){
   float time=i/sourceFps;double rate=c<=.75?5+20*c:20+40*(c-.75);long tick=long(std::floor(double(time)*rate+.0001));
   auto input=pattern(i,16,8);if(previousTick!=tick||c==1)expected=input;
   auto actual=r.render(input,16,8,time,i?time-previousTime:0,c,format);require(actual==expected,[NSString stringWithFormat:@"cadence %.2f / %.2f fps / frame %d",c,sourceFps,i]);previousTick=tick;previousTime=time;count++;
  }cases++;
 }
 // Non-sequential timestamps, repeated calls, setting changes, and independent instances.
 for(auto format:{MTLPixelFormatRGBA8Unorm,MTLPixelFormatBGRA8Unorm}){
  Renderer r(device,library,format),other(device,library,format);
  std::vector<float> times={0,.033333f,.033333f,.2f,.233333f,1.8f,.1f,.133333f,0,.033333f};
  std::vector<unsigned char> expected;long previousTick=-1;float last=-1,previousC=-1;
  for(size_t i=0;i<times.size();i++){
   float t=times[i],c=i==7?.5f:0.f;double rate=5+20*c;long tick=std::floor(double(t)*rate+.0001);auto input=pattern(int(i),16,8);
   if(i==0||tick!=previousTick||t<last||c!=previousC)expected=input;
   require(r.render(input,16,8,t,i?t-last:0,c,format)==expected,@"seek / repeated frame / changed cadence");
   auto otherInput=pattern(190+int(i),16,8);require(other.render(otherInput,16,8,t,0,1,format)==otherInput,@"independent bypass instance");
   previousTick=tick;last=t;previousC=c;count+=2;
  }
  auto resized=pattern(9,8,4);require(r.render(resized,8,4,0,-last,0,format)==resized,@"resized history must start with current frame");count++;cases++;
 }
 printf("PASS Metal .ps/.vs: %d sequences, %d frames; RGBA8/BGRA8, 24/29.97/30/60 fps, all five controls, exact alpha/colors, loops, seeks, setting changes, resize and independent histories\n",cases,count);
}return 0;}

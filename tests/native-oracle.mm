#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <simd/simd.h>
#include <algorithm>
#include <cmath>
#include <fstream>
#include <sstream>
#include <vector>
#include "NativeTypes.h"
#include "NativeTemperature.h"

static void check(bool ok, NSString *message){if(!ok){fprintf(stderr,"FAIL %s\n",message.UTF8String);exit(1);}}
static float value(NSDictionary *cfg, NSString *name, float master){NSDictionary *p=cfg[name];return [p[@"hardCoded"] boolValue]?[p[@"actualValue"] floatValue]:[p[@"intensityMin"] floatValue]+master*([p[@"intensityMax"] floatValue]-[p[@"intensityMin"] floatValue]);}
static NSDictionary *readJSON(NSString *path){return [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:path] options:0 error:nil];}
int main(int argc,char **argv){@autoreleasepool{
 check(argc>=4,@"usage: native-oracle SCRATCH REFERENCE_FOLDER OUTPUT [frame.json]");
 NSString *scratch=@(argv[1]),*reference=@(argv[2]),*out=@(argv[3]);
 [[NSFileManager defaultManager] createDirectoryAtPath:out withIntermediateDirectories:YES attributes:nil error:nil];
 NSError *error=nil;id<MTLDevice> device=MTLCreateSystemDefaultDevice();check(device!=nil,@"Metal device");
 NSString *source=[NSString stringWithContentsOfFile:[scratch stringByAppendingPathComponent:@"NativeOracle.metal"] encoding:NSUTF8StringEncoding error:&error];
 MTLCompileOptions *options=[MTLCompileOptions new];options.fastMathEnabled=NO;
 id<MTLLibrary> library=[device newLibraryWithSource:source options:options error:&error];check(library!=nil,error.localizedDescription);
 id<MTLCommandQueue> queue=[device newCommandQueue];NSMutableDictionary *pipelines=[NSMutableDictionary dictionary];
 for(NSString *name in @[@"ColorCorrection",@"GIMPHueSaturation",@"Linear",@"GIMPShadowsHightlights",@"GIMPColorTemperature",@"Encode709",@"ColorBalance",@"ApplyCubeToImage"]){id<MTLComputePipelineState> p=[device newComputePipelineStateWithFunction:[library newFunctionWithName:name] error:&error];check(p!=nil,error.localizedDescription);pipelines[name]=p;}
 NSMutableArray *inputs=[NSMutableArray array];int width=32,height=24;std::vector<unsigned char> pattern(width*height*4);
 for(int y=0;y<height;y++)for(int x=0;x<width;x++){int i=(y*width+x)*4;pattern[i]=(x*23+y*7)%256;pattern[i+1]=(x*3+y*19)%256;pattern[i+2]=((x^y)*29)%256;pattern[i+3]=255;}
 NSString *patternPath=[out stringByAppendingPathComponent:@"pattern.rgba"];[[NSData dataWithBytes:pattern.data() length:pattern.size()] writeToFile:patternPath atomically:YES];
 [inputs addObject:@{@"name":@"pattern",@"width":@(width),@"height":@(height),@"path":patternPath}];
 if(argc>4)[inputs addObject:readJSON(@(argv[4]))];
 NSMutableArray *cases=[NSMutableArray array];
 for(NSDictionary *input in inputs){int w=[input[@"width"] intValue],h=[input[@"height"] intValue];NSData *raw=[NSData dataWithContentsOfFile:input[@"path"]];check(raw.length==w*h*4,@"input bytes");const unsigned char *bytes=(const unsigned char*)raw.bytes;std::vector<float> pixels(w*h*4);for(int i=0;i<w*h*4;i++)pixels[i]=bytes[i]/255.f;
 auto texture=[&](MTLPixelFormat format=MTLPixelFormatRGBA8Unorm){MTLTextureDescriptor *d=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:format width:w height:h mipmapped:NO];d.storageMode=MTLStorageModeShared;d.usage=MTLTextureUsageShaderRead|MTLTextureUsageShaderWrite;return [device newTextureWithDescriptor:d];};
 for(int preset=1;preset<=10;preset++)for(float master:{0.f,.5f,1.f}){
 NSString *uid=[NSString stringWithFormat:@"Glow_Preset_%02d",preset],*folder=[reference stringByAppendingPathComponent:[NSString stringWithFormat:@"Layers/video_effects/v1/composite_effect/%@/resources",uid]];
 NSDictionary *cfg=readJSON([folder stringByAppendingPathComponent:@"my_adjust.json"]);check(cfg!=nil,@"Adjust config");
 auto norm=[](float x,float lo,float hi){return lo+x*(hi-lo);};
 ColorCorrectionParams cc={norm(value(cfg,@"brightness",master),-1,1)/2.f, norm(value(cfg,@"exposure",master),-1,1), (float)tan((norm(value(cfg,@"contrast",master),-.7f,.7f)+1.f)*M_PI_4),0,1};
 GIMPHueSaturationParams hs={};hs.hue[0]=norm(value(cfg,@"hue",master),-180,180)/180.f;hs.saturation[0]=norm(value(cfg,@"saturation",master),-100,100)/100.f;hs.intensity=1;
 float sh=(-80.f+160.f*value(cfg,@"shadows",master))/50.f,hi=(-100.f+200.f*value(cfg,@"highlights",master))/50.f;
 GIMPShadowsHightlightsParams shadow={sh,sh<0?0.f:1.f,copysignf(1,sh),hi,.5f,copysignf(1,-hi),1.f-(-10.f+20.f*value(cfg,@"whitePoint",master))/100.f,.5f,1};
 GIMPColorTemperatureParams temp={PrepareCoefficients(1300.f+10400.f*value(cfg,@"temperature",master),2000.f+9000.f*value(cfg,@"colorTone",master)),1};
 int gamma=(int)(-75.f+(1.f-value(cfg,@"blackPoint",master))*150.f);float ffGamma=gamma<0?1.f+gamma*.009f:1.f+gamma*.09f;
 simd::float3x3 yuvToRGB={simd::float3{1,0,1.5748},simd::float3{1,-.187324273f,-.468124273f},simd::float3{1,1.8556,0}};
 ColorBalanceParams balance={1,0,1,ffGamma,1,1,1,1,0,yuvToRGB,simd::inverse(yuvToRGB)};
 id<MTLTexture> a=texture(),b=texture();[a replaceRegion:MTLRegionMake2D(0,0,w,h) mipmapLevel:0 withBytes:bytes bytesPerRow:w*4];
 id<MTLCommandBuffer> cb=[queue commandBuffer];
 auto dispatch=[&](NSString *name,void *params,size_t size,MTLPixelFormat format=MTLPixelFormatRGBA8Unorm){b=texture(format);id<MTLComputeCommandEncoder> e=[cb computeCommandEncoder];[e setComputePipelineState:pipelines[name]];[e setTexture:a atIndex:0];[e setTexture:b atIndex:1];if(size)[e setBytes:params length:size atIndex:0];[e dispatchThreads:MTLSizeMake(w,h,1) threadsPerThreadgroup:MTLSizeMake(8,8,1)];[e endEncoding];a=b;};
 dispatch(@"ColorCorrection",&cc,sizeof(cc));dispatch(@"GIMPHueSaturation",&hs,sizeof(hs));dispatch(@"Linear",nullptr,0,MTLPixelFormatRGBA16Float);dispatch(@"GIMPShadowsHightlights",&shadow,sizeof(shadow),MTLPixelFormatRGBA16Float);dispatch(@"Encode709",nullptr,0);dispatch(@"Linear",nullptr,0,MTLPixelFormatRGBA16Float);dispatch(@"GIMPColorTemperature",&temp,sizeof(temp),MTLPixelFormatRGBA16Float);dispatch(@"Encode709",nullptr,0);dispatch(@"ColorBalance",&balance,sizeof(balance));[cb commit];[cb waitUntilCompleted];check(cb.status==MTLCommandBufferStatusCompleted,cb.error.localizedDescription);
 auto write=[&](id<MTLTexture> tex,NSString *suffix){std::vector<unsigned char> result(w*h*4);[tex getBytes:result.data() bytesPerRow:w*4 fromRegion:MTLRegionMake2D(0,0,w,h) mipmapLevel:0];NSString *name=[NSString stringWithFormat:@"%@-%@-%.1f-%@.rgba",input[@"name"],uid,master,suffix];[[NSData dataWithBytes:result.data() length:result.size()] writeToFile:[out stringByAppendingPathComponent:name] atomically:YES];return name;};
 NSString *adjust=write(a,@"adjust");
 // Independent LUT-only reference: the actual hardware-filtered half-float 3D texture.
 NSString *lutName=[NSString stringWithFormat:@"lut_%02d",preset];NSDictionary *lutCfg=readJSON([folder stringByAppendingPathComponent:[lutName stringByAppendingString:@".json"]]);
 std::ifstream file([[folder stringByAppendingPathComponent:[lutName stringByAppendingString:@".cube"]] UTF8String]);std::string line;int side=0;std::vector<_Float16> table;while(std::getline(file,line)){if(line.rfind("LUT_3D_SIZE",0)==0)side=std::stoi(line.substr(11));float r,g,bl;if(sscanf(line.c_str(),"%f %f %f",&r,&g,&bl)==3){table.push_back(r);table.push_back(g);table.push_back(bl);table.push_back(1);}}check(side>1&&table.size()==side*side*side*4,@"cube size");
 MTLTextureDescriptor *td=[MTLTextureDescriptor new];td.textureType=MTLTextureType3D;td.pixelFormat=MTLPixelFormatRGBA16Float;td.width=side;td.height=side;td.depth=side;td.storageMode=MTLStorageModeShared;td.usage=MTLTextureUsageShaderRead;id<MTLTexture> cube=[device newTextureWithDescriptor:td];[cube replaceRegion:MTLRegionMake3D(0,0,0,side,side,side) mipmapLevel:0 slice:0 withBytes:table.data() bytesPerRow:side*8 bytesPerImage:side*side*8];
 [a replaceRegion:MTLRegionMake2D(0,0,w,h) mipmapLevel:0 withBytes:bytes bytesPerRow:w*4];b=texture();LutEffectParams lut={InterpolateMode::Trilinear,1,value(@{@"intensity":lutCfg},@"intensity",master)};cb=[queue commandBuffer];id<MTLComputeCommandEncoder> enc=[cb computeCommandEncoder];[enc setComputePipelineState:pipelines[@"ApplyCubeToImage"]];[enc setTexture:a atIndex:0];[enc setTexture:cube atIndex:1];[enc setTexture:b atIndex:2];[enc setBytes:&lut length:sizeof(lut) atIndex:0];[enc dispatchThreads:MTLSizeMake(w,h,1) threadsPerThreadgroup:MTLSizeMake(8,8,1)];[enc endEncoding];[cb commit];[cb waitUntilCompleted];check(cb.status==MTLCommandBufferStatusCompleted,cb.error.localizedDescription);NSString *lutOutput=write(b,@"lut");
 [cases addObject:@{@"uid":uid,@"master":@(master),@"width":@(w),@"height":@(h),@"input":input[@"path"],@"adjust":adjust,@"lut":lutOutput,@"config":cfg,@"lutConfig":lutCfg}];
 }}
 [[NSJSONSerialization dataWithJSONObject:cases options:NSJSONWritingPrettyPrinted error:nil] writeToFile:[out stringByAppendingPathComponent:@"cases.json"] atomically:YES];printf("PASS native Metal oracle: %lu cases, actual Adjust and LUT kernels\n",cases.count);
}return 0;}

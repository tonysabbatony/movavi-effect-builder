#import "NewBloomRenderer.h"
#include <cstdio>
#include <vector>
static void check(bool ok,NSString *message){if(!ok){fprintf(stderr,"FAIL %s\n",message.UTF8String);exit(1);}}
static NSDictionary *json(NSString *path){return [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:path] options:0 error:nil];}
int main(int argc,char **argv){@autoreleasepool{
 check(argc==6,@"usage: bloom-oracle V3_NATIVE REFERENCE ADJUST_RESULTS FRAME_JSON OUTPUT");
 NSString *native=@(argv[1]),*reference=@(argv[2]),*results=@(argv[3]),*out=@(argv[5]);
 [[NSFileManager defaultManager] createDirectoryAtPath:out withIntermediateDirectories:YES attributes:nil error:nil];
 NSError *error=nil;id<MTLDevice> device=MTLCreateSystemDefaultDevice();check(device!=nil,@"Metal");
 NSString *source=[NSString stringWithContentsOfFile:[native stringByAppendingPathComponent:@"NewBloom.metal"] encoding:NSUTF8StringEncoding error:nil],*header=[NSString stringWithContentsOfFile:[native stringByAppendingPathComponent:@"NewBloomParams.h"] encoding:NSUTF8StringEncoding error:nil];source=[source stringByReplacingOccurrencesOfString:@"#include \"NewBloomParams.h\"" withString:header];
 MTLCompileOptions *options=[MTLCompileOptions new];options.fastMathEnabled=NO;id<MTLLibrary> library=[device newLibraryWithSource:source options:options error:&error];check(library!=nil,error.localizedDescription);
 NewBloomRenderer *renderer=[[NewBloomRenderer alloc] initWithDevice:device library:library error:&error];check(renderer!=nil,error.localizedDescription);id<MTLCommandQueue> queue=[device newCommandQueue];
 NSArray *inputs=@[@{@"name":@"pattern",@"width":@32,@"height":@24,@"path":[results stringByAppendingPathComponent:@"pattern.rgba"]},json(@(argv[4]))];NSMutableArray *cases=[NSMutableArray array];
 for(NSDictionary *input in inputs){int w=[input[@"width"] intValue],h=[input[@"height"] intValue];NSData *data=[NSData dataWithContentsOfFile:input[@"path"]];
 for(int i=1;i<=10;i++)for(float master:{0.f,.5f,1.f}){
 NSString *uid=[NSString stringWithFormat:@"Glow_Preset_%02d",i],*resource=[reference stringByAppendingPathComponent:[NSString stringWithFormat:@"Layers/video_effects/v1/composite_effect/%@/resources/new_bloom_01.json",uid]];NSDictionary *cfg=json(resource);NSMutableDictionary *values=[NSMutableDictionary dictionary];
 for(NSDictionary *p in cfg[@"shaderConfig"][@"INPUTS"]){NSString *name=p[@"NAME"];if([p[@"TYPE"] isEqual:@"float"]){float v=[p[@"DEFAULT"] floatValue];if([cfg[@"intensityParamNames"] containsObject:name])v=[p[@"MIN"] floatValue]+master*([p[@"MAX"] floatValue]-[p[@"MIN"] floatValue]);values[name]=@(v);}}
 NewBloomParams p={[values[@"threshold"] floatValue],[values[@"intensity"] floatValue],[values[@"radius"] floatValue],[values[@"knee"] floatValue],[values[@"scatter"] floatValue],[values[@"opacity"] floatValue],0,0};
 MTLTextureDescriptor *desc=[MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA8Unorm width:w height:h mipmapped:NO];desc.storageMode=MTLStorageModeShared;desc.usage=MTLTextureUsageShaderRead|MTLTextureUsageShaderWrite;id<MTLTexture> src=[device newTextureWithDescriptor:desc],dst=[device newTextureWithDescriptor:desc];[src replaceRegion:MTLRegionMake2D(0,0,w,h) mipmapLevel:0 withBytes:data.bytes bytesPerRow:w*4];
 id<MTLCommandBuffer> command=[queue commandBuffer];check([renderer encode:command source:src destination:dst parameters:p error:&error],error.localizedDescription);[command commit];[command waitUntilCompleted];check(command.status==MTLCommandBufferStatusCompleted,command.error.localizedDescription);
 std::vector<unsigned char> bytes(w*h*4);[dst getBytes:bytes.data() bytesPerRow:w*4 fromRegion:MTLRegionMake2D(0,0,w,h) mipmapLevel:0];NSString *file=[NSString stringWithFormat:@"%@-%@-%.1f-bloom.rgba",input[@"name"],uid,master];[[NSData dataWithBytes:bytes.data() length:bytes.size()] writeToFile:[out stringByAppendingPathComponent:file] atomically:YES];[cases addObject:@{@"uid":uid,@"master":@(master),@"width":@(w),@"height":@(h),@"input":input[@"path"],@"metal":file,@"values":values,@"config":cfg}];
 }}
 [[NSJSONSerialization dataWithJSONObject:cases options:NSJSONWritingPrettyPrinted error:nil] writeToFile:[out stringByAppendingPathComponent:@"cases.json"] atomically:YES];printf("PASS native v3 Bloom oracle: %lu cases\n",cases.count);
}return 0;}

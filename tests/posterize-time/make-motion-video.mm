#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#include <cmath>
#include <unistd.h>
int main(int argc,char **argv){@autoreleasepool{
 if(argc!=2)return 2;NSURL *url=[NSURL fileURLWithPath:@(argv[1])];NSError *error=nil;
 AVAssetWriter *writer=[[AVAssetWriter alloc] initWithURL:url fileType:AVFileTypeMPEG4 error:&error];
 if(!writer){fprintf(stderr,"%s\n",error.localizedDescription.UTF8String);return 1;}
 const int w=480,h=270;
 auto input=[AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:@{AVVideoCodecKey:AVVideoCodecTypeH264,AVVideoWidthKey:@(w),AVVideoHeightKey:@(h),AVVideoCompressionPropertiesKey:@{AVVideoAverageBitRateKey:@1800000,AVVideoExpectedSourceFrameRateKey:@30}}];
 auto adaptor=[AVAssetWriterInputPixelBufferAdaptor assetWriterInputPixelBufferAdaptorWithAssetWriterInput:input sourcePixelBufferAttributes:@{(id)kCVPixelBufferPixelFormatTypeKey:@(kCVPixelFormatType_32BGRA),(id)kCVPixelBufferWidthKey:@(w),(id)kCVPixelBufferHeightKey:@(h)}];
 [writer addInput:input];[writer startWriting];[writer startSessionAtSourceTime:kCMTimeZero];
 for(int frame=0;frame<120;frame++){
  while(!input.readyForMoreMediaData){if(writer.status==AVAssetWriterStatusFailed)return 1;usleep(1000);}
  CVPixelBufferRef buffer=nil;CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault,adaptor.pixelBufferPool,&buffer);if(!buffer)return 1;
  CVPixelBufferLockBaseAddress(buffer,0);auto bytes=(unsigned char*)CVPixelBufferGetBaseAddress(buffer);size_t stride=CVPixelBufferGetBytesPerRow(buffer);
  float cx=35+float(frame%100)*4.1f,cy=135+70*std::sin(frame*.09f);
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
   bool grid=x%40==0||y%40==0,circle=(x-cx)*(x-cx)+(y-cy)*(y-cy)<22*22;
   auto p=bytes+y*stride+x*4;p[0]=circle?192:(grid?60:32);p[1]=circle?220:(grid?48:24);p[2]=circle?80:(grid?37:18);p[3]=255;
   if(y>h-14&&x<(frame%30+1)*16){p[0]=70;p[1]=170;p[2]=245;}
  }
  CVPixelBufferUnlockBaseAddress(buffer,0);if(![adaptor appendPixelBuffer:buffer withPresentationTime:CMTimeMake(frame,30)])return 1;CVPixelBufferRelease(buffer);
 }
 [input markAsFinished];dispatch_semaphore_t done=dispatch_semaphore_create(0);[writer finishWritingWithCompletionHandler:^{dispatch_semaphore_signal(done);}];dispatch_semaphore_wait(done,DISPATCH_TIME_FOREVER);
 if(writer.status!=AVAssetWriterStatusCompleted){fprintf(stderr,"%s\n",writer.error.localizedDescription.UTF8String);return 1;}
 printf("Created synthetic 4-second H.264 motion fixture: 30 fps, 480x270\n");
}return 0;}

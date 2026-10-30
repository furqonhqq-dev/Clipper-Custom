// C3B: persistent native FFmpeg libavformat/libavcodec two-source seek benchmark.
// This is an experimental CPU compositor, not the finished Engine A preview.
#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/error.h>
#include <libavutil/avutil.h>
#include <libswscale/swscale.h>
}
#include "seek_common.h"

static std::string fferr(int code){
  char buf[AV_ERROR_MAX_STRING_SIZE]={0};
  av_strerror(code,buf,sizeof(buf));
  return std::string(buf);
}
static void check(int code,const std::string& action){
  if(code<0)throw std::runtime_error(action+": "+fferr(code));
}
struct Decoder {
  AVFormatContext* fmt=nullptr;
  AVCodecContext* codec=nullptr;
  AVFrame* frame=nullptr;
  AVPacket* packet=nullptr;
  SwsContext* sws=nullptr;
  int stream_index=-1;
  int width=0,height=0;
  AVRational timebase{1,30};
  explicit Decoder(const char* filename,int w,int h):width(w),height(h) {
    try{
      check(avformat_open_input(&fmt,filename,nullptr,nullptr),"Open input");
      check(avformat_find_stream_info(fmt,nullptr),"Find streams");
      stream_index=av_find_best_stream(fmt,AVMEDIA_TYPE_VIDEO,-1,-1,nullptr,0);
      check(stream_index,"Find video stream");
      AVStream* stream=fmt->streams[stream_index];
      timebase=stream->time_base;
      const AVCodec* decoder=avcodec_find_decoder(stream->codecpar->codec_id);
      if(!decoder)throw std::runtime_error("No video decoder");
      codec=avcodec_alloc_context3(decoder);
      if(!codec)throw std::runtime_error("Allocate codec");
      check(avcodec_parameters_to_context(codec,stream->codecpar),"Codec params");
      check(avcodec_open2(codec,decoder,nullptr),"Open codec");
      frame=av_frame_alloc();packet=av_packet_alloc();
      if(!frame||!packet)throw std::runtime_error("Allocate AV frame/packet");
    }catch(...){release();throw;}
  }
  void release(){
    if(sws)sws_freeContext(sws);
    if(packet)av_packet_free(&packet);
    if(frame)av_frame_free(&frame);
    if(codec)avcodec_free_context(&codec);
    if(fmt)avformat_close_input(&fmt);
  }
  ~Decoder(){release();}
  Decoder(const Decoder&)=delete;
  Decoder& operator=(const Decoder&)=delete;

  std::pair<std::vector<unsigned char>,double> seek(int n) {
    const int64_t target=av_rescale_q(n-1,AVRational{1,30},timebase);
    check(av_seek_frame(fmt,stream_index,target,AVSEEK_FLAG_BACKWARD),"Seek");
    avcodec_flush_buffers(codec);
    const double requested_ms=(n-1)*1000.0/30.0;
    while(true){
      int ret=av_read_frame(fmt,packet);
      if(ret<0)throw std::runtime_error("EOF before requested frame "+std::to_string(n));
      if(packet->stream_index!=stream_index){av_packet_unref(packet);continue;}
      ret=avcodec_send_packet(codec,packet);
      av_packet_unref(packet);
      if(ret==AVERROR(EAGAIN))throw std::runtime_error("Unexpected send EAGAIN");
      check(ret,"Send packet");
      while(true){
        ret=avcodec_receive_frame(codec,frame);
        if(ret==AVERROR(EAGAIN)||ret==AVERROR_EOF)break;
        check(ret,"Receive frame");
        int64_t pts=frame->best_effort_timestamp;
        if(pts==AV_NOPTS_VALUE)throw std::runtime_error("Frame without PTS");
        // Accept a frame at or after requested timestamp, allowing one tick rounding.
        if(pts+1<target){av_frame_unref(frame);continue;}
        if(frame->width!=width||frame->height!=height)
          throw std::runtime_error("Unexpected input resolution");
        sws=sws_getCachedContext(sws,frame->width,frame->height,
          static_cast<AVPixelFormat>(frame->format),width,height,AV_PIX_FMT_RGB24,
          SWS_BILINEAR,nullptr,nullptr,nullptr);
        if(!sws)throw std::runtime_error("Cannot initialize swscale");
        std::vector<unsigned char> rgb(static_cast<size_t>(width)*height*3);
        uint8_t* out[]={rgb.data(),nullptr,nullptr,nullptr};
        int stride[]={width*3,0,0,0};
        if(sws_scale(sws,frame->data,frame->linesize,0,height,out,stride)!=height)
          throw std::runtime_error("Cannot scale frame");
        double actual_ms=av_q2d(timebase)*pts*1000.0;
        av_frame_unref(frame);
        return {std::move(rgb),std::abs(actual_ms-requested_ms)};
      }
    }
  }
};
int main(int argc,char**argv){
  if(argc!=6){
    std::cerr<<"Usage: seek_ffmpeg background.mp4 overlay.mp4 width height out-dir\n";
    return 2;
  }
  try{
    const int w=std::stoi(argv[3]),h=std::stoi(argv[4]);
    if(w<64||h<64)throw std::invalid_argument("Invalid dimensions");
    const std::filesystem::path dir(argv[5]);
    std::filesystem::create_directories(dir);
    Decoder bg(argv[1],w,h),ov(argv[2],w,h);
    std::vector<c3b::Measurement> measurements;
    for(int pass=0;pass<2;++pass){
      for(int n:c3b::script()){
        auto start=c3b::Clock::now();
        auto a=bg.seek(n);
        auto b=ov.seek(n);
        if(a.first.size()!=b.first.size())throw std::runtime_error("Different frame sizes");
        std::vector<unsigned char> mixed(a.first.size());
        for(size_t i=0;i<mixed.size();++i)
          mixed[i]=static_cast<unsigned char>((int(a.first[i])+int(b.first[i])+1)/2);
        auto hash=c3b::hash_pixels(mixed);
        auto end=c3b::Clock::now();
        measurements.push_back({n,c3b::ms(start,end),hash,std::max(a.second,b.second)});
        if(pass==0)c3b::ppm(dir/("frame_"+std::to_string(n)+".ppm"),w,h,mixed);
      }
    }
    c3b::report(dir/"a.json","FFmpeg-native-libavcodec-sws",w,h,measurements,
      "Persistent format/codec contexts; av_seek_frame+flush+decode+RGB conversion+50pct CPU blend+sampled hash");
    std::cout<<"C3B_FFMPEG_NATIVE_SEEK_COMPLETE "<<w<<"x"<<h<<"\n";
    return 0;
  }catch(const std::exception&e){
    std::cerr<<"C3B FFmpeg error: "<<e.what()<<"\n";return 1;
  }
}

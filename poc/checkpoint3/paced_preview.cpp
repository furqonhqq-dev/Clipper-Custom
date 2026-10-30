// C3A headless paced libopenshot two-layer frame delivery. NOT interactive preview.
#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#include "Clip.h"
#include "Frame.h"
#include "Settings.h"
#include "Timeline.h"
using Clock=std::chrono::steady_clock;
static double ms(Clock::time_point a,Clock::time_point b){return std::chrono::duration<double,std::milli>(b-a).count();}
static double pct(std::vector<double> v,double p){
  std::sort(v.begin(),v.end());double x=(v.size()-1)*p/100;
  auto lo=(size_t)std::floor(x),hi=(size_t)std::ceil(x);
  return v[lo]+(v[hi]-v[lo])*(x-lo);
}
int main(int argc,char**argv){
  if(argc!=7){std::cerr<<"Usage: paced_preview bg.mp4 overlay.mp4 width height frames report.json\n";return 2;}
  try{
    int w=std::stoi(argv[3]),h=std::stoi(argv[4]),count=std::stoi(argv[5]);
    if(w<64||h<64||count<2||count>900)throw std::invalid_argument("Invalid dimensions/frame count");
    const double period=1000.0/30.0;
    openshot::Settings::Instance()->HARDWARE_DECODER=0;
    openshot::Clip bg{std::string(argv[1])},ov{std::string(argv[2])};
    bg.Layer(0);bg.Position(0);bg.Start(0);bg.End(count/30.0);
    ov.Layer(1);ov.Position(0);ov.Start(0);ov.End(count/30.0);ov.alpha.AddPoint(1,0.5);
    openshot::Timeline timeline(w,h,openshot::Fraction(30,1),48000,2,openshot::ChannelLayout::LAYOUT_STEREO);
    timeline.AddClip(&bg);timeline.AddClip(&ov);timeline.Open();
    auto warm=timeline.GetFrame(1);
    if(!warm||warm->GetWidth()!=w||warm->GetHeight()!=h)throw std::runtime_error("Warmup wrong size");
    std::vector<double> decode,late;int missed=0;unsigned long long checksum=0;
    auto start=Clock::now();
    for(int n=1;n<=count;++n){
      auto deadline=start+std::chrono::duration_cast<Clock::duration>(std::chrono::duration<double,std::milli>((n-1)*period));
      std::this_thread::sleep_until(deadline);
      auto before=Clock::now();
      auto frame=timeline.GetFrame(n);
      if(!frame||frame->GetWidth()!=w||frame->GetHeight()!=h)throw std::runtime_error("Wrong frame "+std::to_string(n));
      const unsigned char*pixels=frame->GetPixels();
      if(!pixels)throw std::runtime_error("No frame pixels");
      checksum+=(unsigned long long)pixels[0];
      auto done=Clock::now();
      decode.push_back(ms(before,done));
      double delay=std::max(0.0,ms(deadline,done));late.push_back(delay);
      if(delay>period)++missed;
    }
    double wall=ms(start,Clock::now());timeline.Close();
    std::filesystem::path dest(argv[6]);std::filesystem::create_directories(dest.parent_path());
    std::ofstream out(dest);if(!out)throw std::runtime_error("Cannot write report");
    out<<std::fixed<<std::setprecision(4)
      <<"{\n  \"engine\": \"libopenshot-native\",\n  \"scenario\": \""<<w<<"x"<<h<<"\",\n"
      <<"  \"frames_requested\": "<<count<<",\n  \"frames_delivered\": "<<decode.size()<<",\n"
      <<"  \"target_fps\": 30,\n  \"wall_ms\": "<<wall<<",\n"
      <<"  \"effective_fps\": "<<count*1000.0/wall<<",\n"
      <<"  \"frame_decode_p50_ms\": "<<pct(decode,50)<<",\n"
      <<"  \"frame_decode_p95_ms\": "<<pct(decode,95)<<",\n"
      <<"  \"delivery_lateness_p95_ms\": "<<pct(late,95)<<",\n"
      <<"  \"late_deadlines_over_one_frame\": "<<missed<<",\n"
      <<"  \"pixel_checksum\": "<<checksum<<",\n"
      <<"  \"timing_scope\": \"headless GetFrame+GetPixels; warmup excluded; no UI display/audio/GPU/IPC\"\n}\n";
    std::cout<<"C3A_LIBOPENSHOT_PACED_COMPLETE "<<w<<"x"<<h<<"\n";return 0;
  }catch(const std::exception&e){std::cerr<<"C3A error: "<<e.what()<<"\n";return 1;}
}

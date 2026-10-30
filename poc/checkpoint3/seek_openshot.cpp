// C3B: persistent native libopenshot Timeline seek and scrub benchmark.
// No window, audio playback, Rust IPC, GPU profiling, or realtime UI.
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "Clip.h"
#include "Frame.h"
#include "Settings.h"
#include "Timeline.h"
#include "seek_common.h"
int main(int argc,char** argv) {
  if(argc!=6) {
    std::cerr<<"Usage: seek_openshot background.mp4 overlay.mp4 width height out-dir\n";
    return 2;
  }
  try {
    const int w=std::stoi(argv[3]),h=std::stoi(argv[4]);
    if(w<64||h<64)throw std::invalid_argument("Invalid resolution");
    const std::filesystem::path dir(argv[5]);
    std::filesystem::create_directories(dir);
    openshot::Settings::Instance()->HARDWARE_DECODER=0;
    openshot::Clip bg{std::string(argv[1])},ov{std::string(argv[2])};
    bg.Layer(0);bg.Position(0);bg.Start(0);bg.End(4.0);
    ov.Layer(1);ov.Position(0);ov.Start(0);ov.End(4.0);
    ov.alpha.AddPoint(1,0.5);
    openshot::Timeline timeline(w,h,openshot::Fraction(30,1),
      48000,2,openshot::ChannelLayout::LAYOUT_STEREO);
    timeline.AddClip(&bg);timeline.AddClip(&ov);timeline.Open();
    std::vector<c3b::Measurement> measurements;
    for(int pass=0;pass<2;++pass) {
      for(int n:c3b::script()) {
        auto start=c3b::Clock::now();
        auto frame=timeline.GetFrame(n);
        if(!frame||frame->GetWidth()!=w||frame->GetHeight()!=h)
          throw std::runtime_error("Null/wrong-size frame "+std::to_string(n));
        const unsigned char* pixels=frame->GetPixels();
        if(!pixels)throw std::runtime_error("Missing pixels");
        // Convert full RGBA frame to RGB inside timed section.
        std::vector<unsigned char> rgb(static_cast<size_t>(w)*h*3);
        for(size_t i=0;i<static_cast<size_t>(w)*h;++i){
          rgb[i*3]=pixels[i*4];
          rgb[i*3+1]=pixels[i*4+1];
          rgb[i*3+2]=pixels[i*4+2];
        }
        auto hash=c3b::hash_pixels(rgb);
        auto end=c3b::Clock::now();
        measurements.push_back({n,c3b::ms(start,end),hash,-1.0});
        if(pass==0)
          c3b::ppm(dir/("frame_"+std::to_string(n)+".ppm"),w,h,rgb);
      }
    }
    timeline.Close();
    c3b::report(dir/"b.json","libopenshot-native-timeline",w,h,
      measurements,"Timeline::GetFrame + full RGBA-to-RGB copy and sampled hash; persistent timeline; two passes");
    std::cout<<"C3B_LIBOPENSHOT_SEEK_COMPLETE "<<w<<"x"<<h<<"\n";
    return 0;
  }catch(const std::exception&e){
    std::cerr<<"C3B libopenshot error: "<<e.what()<<"\n";return 1;
  }
}

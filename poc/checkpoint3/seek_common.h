#pragma once
// C3B fixed scrub requests. Two passes use one persistent process per engine.
// First pass is "first pass", NOT a true cold-cache benchmark.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>
#include <chrono>
namespace c3b {
using Clock=std::chrono::steady_clock;
inline double ms(Clock::time_point a,Clock::time_point b) {
  return std::chrono::duration<double,std::milli>(b-a).count();
}
inline const std::vector<int>& script(){
  static const std::vector<int> frames={60,1,118,30,90,15,105,45,75,10,110,55};
  return frames;
}
inline double percentile(std::vector<double> v,double p){
  if(v.empty())throw std::runtime_error("Empty samples");
  std::sort(v.begin(),v.end());double x=(v.size()-1)*p/100.0;
  size_t lo=(size_t)std::floor(x),hi=(size_t)std::ceil(x);
  return v[lo]+(v[hi]-v[lo])*(x-lo);
}
inline std::uint64_t hash_pixels(const std::vector<unsigned char>& v){
  if(v.empty())throw std::runtime_error("Empty frame");
  std::uint64_t hash=14695981039346656037ULL;
  for(size_t i=0;i<v.size();i+=4096) {
    hash^=v[i];hash*=1099511628211ULL;
  }
  hash^=v.back();hash*=1099511628211ULL;
  return hash;
}
inline void ppm(const std::filesystem::path& path,int w,int h,
                const std::vector<unsigned char>& rgb){
  if(rgb.size()!=static_cast<size_t>(w)*h*3)throw std::runtime_error("Bad RGB size");
  std::filesystem::create_directories(path.parent_path());
  std::ofstream out(path,std::ios::binary);
  if(!out)throw std::runtime_error("Cannot write PPM");
  out<<"P6\n"<<w<<" "<<h<<"\n255\n";
  out.write(reinterpret_cast<const char*>(rgb.data()),rgb.size());
}
struct Measurement {
  int frame=0;double latency_ms=0;std::uint64_t hash=0;double timestamp_error_ms=-1;
};
inline void report(const std::filesystem::path& path,const std::string& engine,
                   int w,int h,const std::vector<Measurement>& measurements,
                   const std::string& method){
  if(measurements.size()!=script().size()*2)throw std::runtime_error("Wrong sample count");
  std::filesystem::create_directories(path.parent_path());
  std::ofstream out(path);
  if(!out)throw std::runtime_error("Cannot write JSON");
  out<<std::fixed<<std::setprecision(4)
     <<"{\n  \"engine\": \""<<engine<<"\",\n  \"scenario\": \""<<w<<"x"<<h
     <<"\",\n  \"persistent_process\": true,\n  \"samples_per_pass\": "<<script().size()
     <<",\n  \"method\": \""<<method<<"\",\n  \"passes\": {\n";
  for(int pass=0;pass<2;++pass){
    std::vector<double> times;
    for(size_t i=0;i<script().size();++i)
      times.push_back(measurements[pass*script().size()+i].latency_ms);
    out<<"    \""<<(pass?"repeat":"first")<<"\": {"
       <<"\"p50_ms\": "<<percentile(times,50)
       <<", \"p95_ms\": "<<percentile(times,95)
       <<", \"max_ms\": "<<*std::max_element(times.begin(),times.end())
       <<"}"<<(pass==0?",":"")<<"\n";
  }
  out<<"  },\n  \"measurements\": [\n";
  for(size_t i=0;i<measurements.size();++i){
    auto& m=measurements[i];
    out<<"    {\"pass\": \""<<(i<script().size()?"first":"repeat")
       <<"\", \"frame\": "<<m.frame
       <<", \"latency_ms\": "<<m.latency_ms
       <<", \"pixel_hash\": \""<<m.hash
       <<"\", \"timestamp_error_ms\": "<<m.timestamp_error_ms<<"}"
       <<(i+1==measurements.size()?"":",")<<"\n";
  }
  out<<"  ]\n}\n";
}
} // namespace c3b

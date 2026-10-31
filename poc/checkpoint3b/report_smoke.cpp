// Regression check: reports from seek_common.h must be valid JSON.
#include <filesystem>
#include <iostream>
#include <vector>
#include "../checkpoint3/seek_common.h"
int main(int argc,char**argv){
  if(argc!=2)return 2;
  std::vector<c3b::Measurement> samples;
  for(int pass=0;pass<2;++pass)
    for(int frame:c3b::script())
      samples.push_back({frame,10.0+frame/100.0,
                         static_cast<std::uint64_t>(frame),0.0});
  c3b::report(argv[1],"c3b-regression",640,360,samples,"synthetic-report-smoke");
  std::cout<<"C3B_JSON_REPORT_GENERATED\n";
  return 0;
}

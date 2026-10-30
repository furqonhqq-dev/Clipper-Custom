cmake_minimum_required(VERSION 3.20)
project(openclipper_checkpoint3b LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT DEFINED OPENSHOT_INSTALL_PREFIX)
  message(FATAL_ERROR "Set -DOPENSHOT_INSTALL_PREFIX=<staged install>")
endif()
find_package(PkgConfig REQUIRED)
pkg_check_modules(FFMPEG REQUIRED IMPORTED_TARGET libavformat libavcodec libavutil libswscale)
find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets Svg)
find_library(OPENSHOT_LIBRARY NAMES openshot libopenshot
  PATHS "${OPENSHOT_INSTALL_PREFIX}/lib" NO_DEFAULT_PATH REQUIRED)
find_library(OPENSHOT_AUDIO_LIBRARY NAMES openshot-audio libopenshot-audio
  PATHS "${OPENSHOT_INSTALL_PREFIX}/lib" NO_DEFAULT_PATH REQUIRED)
add_executable(seek_ffmpeg ../checkpoint3/seek_ffmpeg.cpp)
target_include_directories(seek_ffmpeg PRIVATE ../checkpoint3)
target_link_libraries(seek_ffmpeg PRIVATE PkgConfig::FFMPEG)
add_executable(seek_openshot ../checkpoint3/seek_openshot.cpp)
target_include_directories(seek_openshot PRIVATE
  ../checkpoint3
  "${OPENSHOT_INSTALL_PREFIX}/include/libopenshot"
  "${OPENSHOT_INSTALL_PREFIX}/include/libopenshot-audio")
target_link_libraries(seek_openshot PRIVATE
  "${OPENSHOT_LIBRARY}" "${OPENSHOT_AUDIO_LIBRARY}"
  Qt6::Core Qt6::Gui Qt6::Widgets Qt6::Svg)

cmake_minimum_required(VERSION 3.20)
project(openclipper_libopenshot_native_smoke LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED OPENSHOT_INSTALL_PREFIX)
  message(FATAL_ERROR "Set -DOPENSHOT_INSTALL_PREFIX=<staged install>")
endif()
find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets Svg)
find_library(OPENSHOT_LIBRARY
  NAMES openshot libopenshot
  PATHS "${OPENSHOT_INSTALL_PREFIX}/lib"
  NO_DEFAULT_PATH REQUIRED)
find_library(OPENSHOT_AUDIO_LIBRARY
  NAMES openshot-audio libopenshot-audio
  PATHS "${OPENSHOT_INSTALL_PREFIX}/lib"
  NO_DEFAULT_PATH REQUIRED)

add_executable(native_smoke native_smoke.cpp)
target_include_directories(native_smoke PRIVATE
  "${OPENSHOT_INSTALL_PREFIX}/include/libopenshot"
  "${OPENSHOT_INSTALL_PREFIX}/include/libopenshot-audio")
target_link_libraries(native_smoke PRIVATE
  "${OPENSHOT_LIBRARY}"
  "${OPENSHOT_AUDIO_LIBRARY}"
  Qt6::Core Qt6::Gui Qt6::Widgets Qt6::Svg)

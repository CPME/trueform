cmake_minimum_required(VERSION 3.18)

project(occt_server LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(OpenCASCADE REQUIRED)

add_executable(occt_server
  main.cpp
)

target_include_directories(occt_server PRIVATE
  ${OpenCASCADE_INCLUDE_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party
)

set(OCCT_EXCLUDE
  TKOpenGl
  TKV3d
  TKMeshVS
  TKOpenGlTest
  TKViewerTest
  TKDraw
  TKTopTest
  TKXSDRAW
  TKDCAF
  TKXDEDRAW
  TKTObjDRAW
  TKQADraw
)

set(OCCT_LIBS "")
foreach(lib ${OpenCASCADE_LIBRARIES})
  list(FIND OCCT_EXCLUDE ${lib} excluded_index)
  if(excluded_index EQUAL -1)
    list(APPEND OCCT_LIBS ${lib})
  endif()
endforeach()

target_link_libraries(occt_server PRIVATE ${OCCT_LIBS})

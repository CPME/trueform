#include "httplib.h"
#include "json.hpp"

#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepGProp.hxx>
#include <BRepOffsetAPI_MakePipe.hxx>
#include <BRepOffsetAPI_ThruSections.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRep_Tool.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <GProp_GProps.hxx>
#include <Interface_Static.hxx>
#include <STEPCAFControl_Controller.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <STEPControl_Controller.hxx>
#include <STEPControl_Writer.hxx>
#include <TCollection_HAsciiString.hxx>
#include <TDF_Label.hxx>
#include <TDF_LabelSequence.hxx>
#include <TDocStd_Document.hxx>
#include <TopExp_Explorer.hxx>
#include <TopExp.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <XCAFDoc_Datum.hxx>
#include <XCAFDoc_DimTolTool.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_GeomTolerance.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XCAFDimTolObjects_DatumObject.hxx>
#include <XCAFDimTolObjects_DatumSingleModif.hxx>
#include <XCAFDimTolObjects_GeomToleranceModif.hxx>
#include <XCAFDimTolObjects_GeomToleranceObject.hxx>
#include <XCAFDimTolObjects_GeomToleranceType.hxx>
#include <XCAFDimTolObjects_GeomToleranceTypeValue.hxx>
#include <gp_Ax1.hxx>
#include <gp_Dir.hxx>
#include <gp_Pln.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>

#include <cmath>
#include <fstream>
#include <iostream>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

using json = nlohmann::json;

struct KernelObject {
  std::string id;
  std::string kind;
  json meta;
};

struct KernelSelection {
  std::string id;
  std::string kind;
  json meta;
};

struct KernelResult {
  std::unordered_map<std::string, KernelObject> outputs;
  std::vector<KernelSelection> selections;
};

class ShapeRegistry {
 public:
  std::string registerShape(const TopoDS_Shape& shape) {
    const std::string handle = "shape:" + std::to_string(counter_++);
    shapes_[handle] = shape;
    return handle;
  }

  TopoDS_Shape get(const std::string& handle) const {
    auto it = shapes_.find(handle);
    if (it == shapes_.end()) {
      throw std::runtime_error("Unknown shape handle: " + handle);
    }
    return it->second;
  }

  void clear() { shapes_.clear(); }

 private:
  std::unordered_map<std::string, TopoDS_Shape> shapes_;
  std::size_t counter_ = 0;
};

struct Session {
  ShapeRegistry registry;
  KernelResult current;
};

class SessionManager {
 public:
  Session& get(const std::string& sessionId) {
    auto it = sessions_.find(sessionId);
    if (it == sessions_.end()) {
      auto created = std::make_unique<Session>();
      Session* ptr = created.get();
      sessions_[sessionId] = std::move(created);
      return *ptr;
    }
    return *it->second;
  }

 private:
  std::unordered_map<std::string, std::unique_ptr<Session>> sessions_;
};

static double parseScalar(const json& value, double fallback = 0.0) {
  if (value.is_number()) {
    return value.get<double>();
  }
  if (value.is_object()) {
    const std::string kind = value.value("kind", "");
    if (kind == "expr.literal") {
      return value.value("value", fallback);
    }
  }
  return fallback;
}

static gp_Pnt parsePoint2D(const json& value, double z = 0.0) {
  if (!value.is_array() || value.size() < 2) {
    return gp_Pnt(0, 0, z);
  }
  const double zValue = value.size() >= 3 ? parseScalar(value[2]) : z;
  return gp_Pnt(parseScalar(value[0]), parseScalar(value[1]), zValue);
}

static gp_Pnt parsePoint3D(const json& value) {
  if (!value.is_array() || value.size() < 3) {
    return gp_Pnt(0, 0, 0);
  }
  return gp_Pnt(parseScalar(value[0]), parseScalar(value[1]), parseScalar(value[2]));
}

static gp_Vec axisVectorFromString(const std::string& dir) {
  if (dir == "+X") return gp_Vec(1, 0, 0);
  if (dir == "-X") return gp_Vec(-1, 0, 0);
  if (dir == "+Y") return gp_Vec(0, 1, 0);
  if (dir == "-Y") return gp_Vec(0, -1, 0);
  if (dir == "+Z") return gp_Vec(0, 0, 1);
  if (dir == "-Z") return gp_Vec(0, 0, -1);
  return gp_Vec(0, 0, 1);
}

static std::string axisDirectionFromVector(const gp_Vec& vec) {
  const double ax = std::abs(vec.X());
  const double ay = std::abs(vec.Y());
  const double az = std::abs(vec.Z());
  const double maxVal = std::max(ax, std::max(ay, az));
  if (maxVal < 0.9) return "";
  if (ax >= ay && ax >= az) return vec.X() >= 0 ? "+X" : "-X";
  if (ay >= ax && ay >= az) return vec.Y() >= 0 ? "+Y" : "-Y";
  return vec.Z() >= 0 ? "+Z" : "-Z";
}

static json vecToJson(const gp_Vec& vec) {
  return json::array({vec.X(), vec.Y(), vec.Z()});
}

static json pointToJson(const gp_Pnt& pnt) {
  return json::array({pnt.X(), pnt.Y(), pnt.Z()});
}

static std::string selectionOwnerToken(const std::string& ownerKey) {
  std::string token = ownerKey;
  for (char& ch : token) {
    if (ch == ':') ch = '.';
  }
  return token;
}

static TopoDS_Face makeRectangleFace(double width, double height, const gp_Pnt& center) {
  const double halfW = width / 2.0;
  const double halfH = height / 2.0;
  const double cx = center.X();
  const double cy = center.Y();
  const double cz = center.Z();
  BRepBuilderAPI_MakePolygon poly;
  poly.Add(gp_Pnt(cx - halfW, cy - halfH, cz));
  poly.Add(gp_Pnt(cx + halfW, cy - halfH, cz));
  poly.Add(gp_Pnt(cx + halfW, cy + halfH, cz));
  poly.Add(gp_Pnt(cx - halfW, cy + halfH, cz));
  poly.Close();
  TopoDS_Wire wire = poly.Wire();
  return BRepBuilderAPI_MakeFace(gp_Pln(center, gp_Dir(0, 0, 1)), wire, true);
}

static TopoDS_Face makeCircleFace(double radius, const gp_Pnt& center) {
  gp_Circ circ(gp_Ax2(center, gp_Dir(0, 0, 1)), radius);
  TopoDS_Edge edge = BRepBuilderAPI_MakeEdge(circ);
  TopoDS_Wire wire = BRepBuilderAPI_MakeWire(edge);
  return BRepBuilderAPI_MakeFace(gp_Pln(center, gp_Dir(0, 0, 1)), wire, true);
}

static TopoDS_Face makePolygonFace(int sides, double radius, const gp_Pnt& center, double rotation) {
  if (sides < 3) {
    throw std::runtime_error("profile.poly requires sides >= 3");
  }
  BRepBuilderAPI_MakePolygon poly;
  const double step = (2.0 * M_PI) / static_cast<double>(sides);
  for (int i = 0; i < sides; ++i) {
    const double angle = rotation + step * static_cast<double>(i);
    const double x = center.X() + radius * std::cos(angle);
    const double y = center.Y() + radius * std::sin(angle);
    poly.Add(gp_Pnt(x, y, center.Z()));
  }
  poly.Close();
  TopoDS_Wire wire = poly.Wire();
  return BRepBuilderAPI_MakeFace(gp_Pln(center, gp_Dir(0, 0, 1)), wire, true);
}

static TopoDS_Face buildProfileFace(const json& profile) {
  const std::string kind = profile.value("kind", "");
  if (kind == "profile.rectangle") {
    double width = parseScalar(profile["width"]);
    double height = parseScalar(profile["height"]);
    gp_Pnt center = parsePoint2D(profile.value("center", json::array({0, 0})));
    return makeRectangleFace(width, height, center);
  }
  if (kind == "profile.circle") {
    double radius = parseScalar(profile["radius"]);
    gp_Pnt center = parsePoint2D(profile.value("center", json::array({0, 0})));
    return makeCircleFace(radius, center);
  }
  if (kind == "profile.poly") {
    int sides = static_cast<int>(parseScalar(profile["sides"]));
    double radius = parseScalar(profile["radius"]);
    gp_Pnt center = parsePoint2D(profile.value("center", json::array({0, 0})));
    double rotation = parseScalar(profile.value("rotation", 0.0));
    return makePolygonFace(sides, radius, center, rotation);
  }
  throw std::runtime_error("Unsupported profile kind: " + kind);
}

static TopoDS_Wire buildProfileWire(const json& profile) {
  const std::string kind = profile.value("kind", "");
  if (kind == "profile.rectangle") {
    double width = parseScalar(profile["width"]);
    double height = parseScalar(profile["height"]);
    gp_Pnt center = parsePoint2D(profile.value("center", json::array({0, 0})));
    const double halfW = width / 2.0;
    const double halfH = height / 2.0;
    const double cx = center.X();
    const double cy = center.Y();
    const double cz = center.Z();
    BRepBuilderAPI_MakePolygon poly;
    poly.Add(gp_Pnt(cx - halfW, cy - halfH, cz));
    poly.Add(gp_Pnt(cx + halfW, cy - halfH, cz));
    poly.Add(gp_Pnt(cx + halfW, cy + halfH, cz));
    poly.Add(gp_Pnt(cx - halfW, cy + halfH, cz));
    poly.Close();
    return poly.Wire();
  }
  if (kind == "profile.circle") {
    double radius = parseScalar(profile["radius"]);
    gp_Pnt center = parsePoint2D(profile.value("center", json::array({0, 0})));
    gp_Circ circ(gp_Ax2(center, gp_Dir(0, 0, 1)), radius);
    TopoDS_Edge edge = BRepBuilderAPI_MakeEdge(circ);
    return BRepBuilderAPI_MakeWire(edge);
  }
  if (kind == "profile.poly") {
    int sides = static_cast<int>(parseScalar(profile["sides"]));
    double radius = parseScalar(profile["radius"]);
    gp_Pnt center = parsePoint2D(profile.value("center", json::array({0, 0})));
    double rotation = parseScalar(profile.value("rotation", 0.0));
    BRepBuilderAPI_MakePolygon poly;
    const double step = (2.0 * M_PI) / static_cast<double>(sides);
    for (int i = 0; i < sides; ++i) {
      const double angle = rotation + step * static_cast<double>(i);
      const double x = center.X() + radius * std::cos(angle);
      const double y = center.Y() + radius * std::sin(angle);
      poly.Add(gp_Pnt(x, y, center.Z()));
    }
    poly.Close();
    return poly.Wire();
  }
  throw std::runtime_error("Unsupported profile kind for wire: " + kind);
}

static TopoDS_Wire buildPathWire(const json& path) {
  const std::string kind = path.value("kind", "");
  if (kind == "path.polyline") {
    const json points = path.value("points", json::array());
    if (!points.is_array() || points.size() < 2) {
      throw std::runtime_error("path.polyline requires at least two points");
    }
    BRepBuilderAPI_MakePolygon poly;
    for (const auto& point : points) {
      poly.Add(parsePoint3D(point));
    }
    if (path.value("closed", false)) {
      poly.Close();
    }
    return poly.Wire();
  }
  if (kind == "path.segments") {
    const json segments = path.value("segments", json::array());
    if (!segments.is_array() || segments.empty()) {
      throw std::runtime_error("path.segments requires at least one segment");
    }
    BRepBuilderAPI_MakeWire wire;
    for (const auto& segment : segments) {
      if (segment.value("kind", "") != "path.line") {
        throw std::runtime_error("Native backend sweep currently supports only line path segments");
      }
      wire.Add(BRepBuilderAPI_MakeEdge(
          parsePoint3D(segment.value("start", json::array({0, 0, 0}))),
          parsePoint3D(segment.value("end", json::array({0, 0, 0})))));
    }
    return wire.Wire();
  }
  throw std::runtime_error("Native backend sweep currently supports path.polyline or line-only path.segments");
}

static json resolveProfileJson(const json& profileRef, const KernelResult& upstream) {
  const std::string kind = profileRef.value("kind", "");
  if (kind != "profile.ref") return profileRef;
  const std::string name = profileRef.value("name", "");
  auto it = upstream.outputs.find(name);
  if (it == upstream.outputs.end()) {
    throw std::runtime_error("Missing profile output: " + name);
  }
  if (it->second.kind != "profile") {
    throw std::runtime_error("Output is not a profile: " + name);
  }
  if (!it->second.meta.contains("profile") || !it->second.meta["profile"].is_object()) {
    throw std::runtime_error("Profile output missing profile data: " + name);
  }
  return it->second.meta["profile"];
}

static json resolvePlaneBasisJson(const json& planeRef, const KernelResult& upstream) {
  if (!planeRef.is_object()) {
    return {
        {"origin", json::array({0, 0, 0})},
        {"xDir", json::array({1, 0, 0})},
        {"yDir", json::array({0, 1, 0})},
        {"normal", json::array({0, 0, 1})},
    };
  }
  if (planeRef.value("kind", "") == "plane.datum") {
    const std::string ref = planeRef.value("ref", "");
    auto it = upstream.outputs.find("datum:" + ref);
    if (it == upstream.outputs.end()) {
      throw std::runtime_error("Missing plane datum: " + ref);
    }
    if (it->second.kind != "datum") {
      throw std::runtime_error("Referenced plane datum is not a datum: " + ref);
    }
    const json meta = it->second.meta;
    if (meta.value("type", "") != "plane") {
      throw std::runtime_error("Referenced datum is not a plane: " + ref);
    }
    return {
        {"origin", meta.value("origin", json::array({0, 0, 0}))},
        {"xDir", meta.value("xDir", json::array({1, 0, 0}))},
        {"yDir", meta.value("yDir", json::array({0, 1, 0}))},
        {"normal", meta.value("normal", json::array({0, 0, 1}))},
    };
  }
  throw std::runtime_error("Native backend plane feature currently supports default or plane.datum references only");
}

static gp_Vec parseAxis(const json& axis) {
  if (axis.is_string()) {
    return axisVectorFromString(axis.get<std::string>());
  }
  if (axis.is_object()) {
    const std::string kind = axis.value("kind", "");
    if (kind == "axis.vector") {
      auto direction = axis.value("direction", json::array({0, 0, 1}));
      if (!direction.is_array() || direction.size() < 3) return gp_Vec(0, 0, 1);
      return gp_Vec(parseScalar(direction[0]), parseScalar(direction[1]), parseScalar(direction[2]));
    }
    if (kind == "axis.sketch.normal") {
      return gp_Vec(0, 0, 1);
    }
  }
  return gp_Vec(0, 0, 1);
}

static json makeSolidMeta(const std::string& handle,
                          const std::string& ownerKey,
                          const std::string& featureId,
                          const gp_Pnt& center,
                          const json& tags) {
  json meta;
  meta["handle"] = handle;
  meta["ownerHandle"] = handle;
  meta["ownerKey"] = ownerKey;
  meta["createdBy"] = featureId;
  meta["role"] = "body";
  meta["center"] = pointToJson(center);
  meta["centerZ"] = center.Z();
  if (!tags.is_null()) meta["featureTags"] = tags;
  return meta;
}

static json makeFaceMeta(const std::string& handle,
                         const std::string& ownerHandle,
                         const std::string& ownerKey,
                         const std::string& featureId,
                         const gp_Pnt& center,
                         double area,
                         bool planar,
                         const std::string& normal,
                         const std::optional<gp_Vec>& normalVec,
                         const json& tags) {
  json meta;
  meta["handle"] = handle;
  meta["ownerHandle"] = ownerHandle;
  meta["ownerKey"] = ownerKey;
  meta["createdBy"] = featureId;
  meta["planar"] = planar;
  meta["area"] = area;
  meta["center"] = pointToJson(center);
  meta["centerZ"] = center.Z();
  if (!normal.empty()) meta["normal"] = normal;
  if (normalVec) meta["normalVec"] = vecToJson(*normalVec);
  if (!tags.is_null()) meta["featureTags"] = tags;
  return meta;
}

static json makeEdgeMeta(const std::string& handle,
                         const std::string& ownerHandle,
                         const std::string& ownerKey,
                         const std::string& featureId,
                         const gp_Pnt& center,
                         const json& tags) {
  json meta;
  meta["handle"] = handle;
  meta["ownerHandle"] = ownerHandle;
  meta["ownerKey"] = ownerKey;
  meta["createdBy"] = featureId;
  meta["role"] = "edge";
  meta["center"] = pointToJson(center);
  meta["centerZ"] = center.Z();
  if (!tags.is_null()) meta["featureTags"] = tags;
  return meta;
}

static KernelResult makeDatumResult(const std::string& key,
                                    const std::string& id,
                                    const json& meta) {
  KernelResult result;
  KernelObject output;
  output.id = id;
  output.kind = "datum";
  output.meta = meta;
  result.outputs[key] = output;
  return result;
}

static KernelResult makeSketchProfileResult(const json& feature) {
  KernelResult result;
  const std::string featureId = feature.value("id", "sketch");
  const json profiles = feature.value("profiles", json::array());
  for (const auto& entry : profiles) {
    const std::string name = entry.value("name", "");
    if (name.empty()) {
      throw std::runtime_error("feature.sketch2d profile entry missing name");
    }
    const json profile = entry.value("profile", json::object());
    const std::string profileKind = profile.value("kind", "");
    if (profileKind != "profile.rectangle" &&
        profileKind != "profile.circle" &&
        profileKind != "profile.poly") {
      throw std::runtime_error("Native backend sketch2d currently supports only primitive profile outputs");
    }
    KernelObject output;
    output.id = featureId + ":" + name;
    output.kind = "profile";
    output.meta = {
        {"profile", profile},
        {"createdBy", featureId},
    };
    result.outputs[name] = output;
  }
  return result;
}

static TopoDS_Face makePlaneFaceFromBasis(const json& basis,
                                          double width,
                                          double height,
                                          const json& originOffset) {
  gp_Pnt origin = parsePoint3D(basis.value("origin", json::array({0, 0, 0})));
  json xDirJson = basis.value("xDir", json::array({1, 0, 0}));
  json yDirJson = basis.value("yDir", json::array({0, 1, 0}));
  gp_Vec xDir(parseScalar(xDirJson[0]), parseScalar(xDirJson[1]), parseScalar(xDirJson[2]));
  gp_Vec yDir(parseScalar(yDirJson[0]), parseScalar(yDirJson[1]), parseScalar(yDirJson[2]));
  if (xDir.Magnitude() == 0 || yDir.Magnitude() == 0) {
    throw std::runtime_error("Invalid plane basis");
  }
  xDir.Normalize();
  yDir.Normalize();

  gp_Vec offset(
      parseScalar(originOffset[0]),
      parseScalar(originOffset[1]),
      parseScalar(originOffset[2]));
  gp_Pnt center(
      origin.X() + offset.X(),
      origin.Y() + offset.Y(),
      origin.Z() + offset.Z());

  const double halfW = width / 2.0;
  const double halfH = height / 2.0;
  auto addVec = [](const gp_Pnt& p, const gp_Vec& v) {
    return gp_Pnt(p.X() + v.X(), p.Y() + v.Y(), p.Z() + v.Z());
  };
  gp_Vec xOff = xDir.Multiplied(halfW);
  gp_Vec yOff = yDir.Multiplied(halfH);
  BRepBuilderAPI_MakePolygon poly;
  poly.Add(addVec(addVec(center, xOff), yOff));
  poly.Add(addVec(addVec(center, xOff.Reversed()), yOff));
  poly.Add(addVec(addVec(center, xOff.Reversed()), yOff.Reversed()));
  poly.Add(addVec(addVec(center, xOff), yOff.Reversed()));
  poly.Close();
  return BRepBuilderAPI_MakeFace(poly.Wire());
}

static gp_Pnt shapeCenter(const TopoDS_Shape& shape) {
  Bnd_Box box;
  BRepBndLib::Add(shape, box);
  gp_Pnt minPnt = box.CornerMin();
  gp_Pnt maxPnt = box.CornerMax();
  return gp_Pnt((minPnt.X() + maxPnt.X()) / 2.0,
                (minPnt.Y() + maxPnt.Y()) / 2.0,
                (minPnt.Z() + maxPnt.Z()) / 2.0);
}

static KernelResult collectSelections(const TopoDS_Shape& shape,
                                      ShapeRegistry& registry,
                                      const std::string& featureId,
                                      const std::string& ownerKey,
                                      const std::string& outputKind,
                                      const json& tags) {
  KernelResult result;
  const std::string ownerHandle = registry.registerShape(shape);
  const std::string ownerToken = selectionOwnerToken(ownerKey);

  if (outputKind == "solid") {
    gp_Pnt solidCenter = shapeCenter(shape);
    KernelSelection solidSelection;
    solidSelection.id = "solid:" + ownerToken + "~" + featureId + ".body";
    solidSelection.kind = "solid";
    solidSelection.meta = makeSolidMeta(ownerHandle, ownerKey, featureId, solidCenter, tags);
    result.selections.push_back(solidSelection);
  }

  TopTools_IndexedMapOfShape faceMap;
  TopExp::MapShapes(shape, TopAbs_FACE, faceMap);
  for (int index = 1; index <= faceMap.Extent(); ++index) {
    TopoDS_Face face = TopoDS::Face(faceMap(index));
    std::string faceHandle = registry.registerShape(face);

    GProp_GProps props;
    double area = 0.0;
    gp_Pnt center = gp_Pnt(0, 0, 0);
    try {
      BRepGProp::SurfaceProperties(face, props);
      area = props.Mass();
      center = props.CentreOfMass();
    } catch (...) {
      center = shapeCenter(face);
    }

    bool planar = false;
    std::string normalDir;
    std::optional<gp_Vec> normalVec;
    try {
      BRepAdaptor_Surface adaptor(face, true);
      if (adaptor.GetType() == GeomAbs_Plane) {
        planar = true;
        gp_Pln plane = adaptor.Plane();
        gp_Dir dir = plane.Axis().Direction();
        gp_Vec vec(dir.X(), dir.Y(), dir.Z());
        normalVec = vec;
        normalDir = axisDirectionFromVector(vec);
      }
    } catch (...) {
    }

    KernelSelection sel;
    sel.id = "face";
    sel.kind = "face";
    sel.meta = makeFaceMeta(faceHandle, ownerHandle, ownerKey, featureId, center, area,
                            planar, normalDir, normalVec, tags);
    result.selections.push_back(sel);
  }

  TopTools_IndexedMapOfShape edgeMap;
  TopExp::MapShapes(shape, TopAbs_EDGE, edgeMap);
  for (int index = 1; index <= edgeMap.Extent(); ++index) {
    TopoDS_Edge edge = TopoDS::Edge(edgeMap(index));
    std::string edgeHandle = registry.registerShape(edge);
    gp_Pnt center = shapeCenter(edge);
    KernelSelection sel;
    sel.id = "edge";
    sel.kind = "edge";
    sel.meta = makeEdgeMeta(edgeHandle, ownerHandle, ownerKey, featureId, center, tags);
    result.selections.push_back(sel);
  }

  KernelObject output;
  output.id = featureId + ":" + (outputKind == "solid" ? "solid" : "face");
  output.kind = outputKind;
  output.meta = json::object();
  output.meta["handle"] = ownerHandle;
  output.meta["ownerKey"] = ownerKey;
  output.meta["createdBy"] = featureId;
  output.meta["role"] = outputKind == "solid" ? "body" : "surface";
  result.outputs[ownerKey] = output;
  return result;
}

static KernelResult mergeResults(const KernelResult& upstream, const KernelResult& next) {
  KernelResult merged;
  merged.outputs = upstream.outputs;
  for (const auto& entry : next.outputs) {
    merged.outputs[entry.first] = entry.second;
  }
  std::vector<std::string> ownerKeys;
  for (const auto& sel : next.selections) {
    if (sel.meta.contains("ownerKey") && sel.meta["ownerKey"].is_string()) {
      ownerKeys.push_back(sel.meta["ownerKey"].get<std::string>());
    }
  }
  for (const auto& sel : upstream.selections) {
    bool skip = false;
    if (sel.meta.contains("ownerKey") && sel.meta["ownerKey"].is_string()) {
      const std::string owner = sel.meta["ownerKey"].get<std::string>();
      for (const auto& key : ownerKeys) {
        if (key == owner) {
          skip = true;
          break;
        }
      }
    }
    if (!skip) merged.selections.push_back(sel);
  }
  for (const auto& sel : next.selections) {
    merged.selections.push_back(sel);
  }
  return merged;
}

static KernelResult parseKernelResult(const json& value) {
  KernelResult result;
  if (!value.is_object()) return result;
  if (value.contains("outputs")) {
    for (const auto& entry : value["outputs"]) {
      KernelObject obj;
      obj.id = entry["object"].value("id", "");
      obj.kind = entry["object"].value("kind", "");
      obj.meta = entry["object"].value("meta", json::object());
      const std::string key = entry.value("key", obj.id);
      result.outputs[key] = obj;
    }
  }
  if (value.contains("selections")) {
    for (const auto& entry : value["selections"]) {
      KernelSelection sel;
      sel.id = entry.value("id", "");
      sel.kind = entry.value("kind", "");
      sel.meta = entry.value("meta", json::object());
      result.selections.push_back(sel);
    }
  }
  return result;
}

static json serializeKernelResult(const KernelResult& result) {
  json outputs = json::array();
  for (const auto& entry : result.outputs) {
    json obj;
    obj["key"] = entry.first;
    obj["object"] = {{"id", entry.second.id}, {"kind", entry.second.kind}, {"meta", entry.second.meta}};
    outputs.push_back(obj);
  }
  json selections = json::array();
  for (const auto& sel : result.selections) {
    selections.push_back({{"id", sel.id}, {"kind", sel.kind}, {"meta", sel.meta}});
  }
  return {{"outputs", outputs}, {"selections", selections}};
}

static std::optional<KernelSelection> resolveSelector(const json& selector,
                                                      const KernelResult& current,
                                                      std::string& error) {
  const std::string kind = selector.value("kind", "");
  if (kind == "selector.named") {
    const std::string name = selector.value("name", "");
    auto it = current.outputs.find(name);
    if (it == current.outputs.end()) {
      error = "Missing named output: " + name;
      return std::nullopt;
    }
    KernelSelection sel;
    sel.id = it->second.id;
    sel.kind = it->second.kind;
    sel.meta = it->second.meta;
    return sel;
  }

  std::vector<KernelSelection> candidates;
  for (const auto& sel : current.selections) {
    if (kind == "selector.face" && sel.kind != "face") continue;
    if (kind == "selector.edge" && sel.kind != "edge") continue;
    if (kind == "selector.solid" && sel.kind != "solid") continue;
    bool matches = true;
    for (const auto& pred : selector.value("predicates", json::array())) {
      const std::string predKind = pred.value("kind", "");
      if (predKind == "pred.planar") {
        if (!sel.meta.value("planar", false)) matches = false;
      } else if (predKind == "pred.normal") {
        if (sel.meta.value("normal", "") != pred.value("value", "")) matches = false;
      } else if (predKind == "pred.createdBy") {
        if (sel.meta.value("createdBy", "") != pred.value("featureId", "")) matches = false;
      } else if (predKind == "pred.role") {
        if (sel.meta.value("role", "") != pred.value("value", "")) matches = false;
      }
      if (!matches) break;
    }
    if (matches) candidates.push_back(sel);
  }

  if (candidates.empty()) {
    error = "Selector matched 0 candidates";
    return std::nullopt;
  }

  auto rankRules = selector.value("rank", json::array());
  for (const auto& rule : rankRules) {
    if (candidates.size() <= 1) break;
    const std::string ruleKind = rule.value("kind", "");
    if (ruleKind == "rank.maxArea") {
      double best = -1.0;
      for (const auto& c : candidates) best = std::max(best, c.meta.value("area", 0.0));
      std::vector<KernelSelection> filtered;
      for (const auto& c : candidates) {
        if (c.meta.value("area", 0.0) == best) filtered.push_back(c);
      }
      candidates.swap(filtered);
    } else if (ruleKind == "rank.minZ") {
      double best = std::numeric_limits<double>::infinity();
      for (const auto& c : candidates) best = std::min(best, c.meta.value("centerZ", 0.0));
      std::vector<KernelSelection> filtered;
      for (const auto& c : candidates) {
        if (c.meta.value("centerZ", 0.0) == best) filtered.push_back(c);
      }
      candidates.swap(filtered);
    } else if (ruleKind == "rank.maxZ") {
      double best = -std::numeric_limits<double>::infinity();
      for (const auto& c : candidates) best = std::max(best, c.meta.value("centerZ", 0.0));
      std::vector<KernelSelection> filtered;
      for (const auto& c : candidates) {
        if (c.meta.value("centerZ", 0.0) == best) filtered.push_back(c);
      }
      candidates.swap(filtered);
    } else if (ruleKind == "rank.closestTo") {
      std::string innerErr;
      auto targetSel = resolveSelector(rule["target"], current, innerErr);
      if (!targetSel) {
        error = innerErr;
        return std::nullopt;
      }
      auto center = targetSel->meta.value("center", json::array({0, 0, 0}));
      if (!center.is_array() || center.size() < 3) {
        error = "Selector requires center metadata";
        return std::nullopt;
      }
      auto tx = center[0].get<double>();
      auto ty = center[1].get<double>();
      auto tz = center[2].get<double>();
      double bestScore = std::numeric_limits<double>::infinity();
      for (const auto& c : candidates) {
        auto cc = c.meta.value("center", json::array({0, 0, 0}));
        double dx = cc[0].get<double>() - tx;
        double dy = cc[1].get<double>() - ty;
        double dz = cc[2].get<double>() - tz;
        double dist = std::sqrt(dx * dx + dy * dy + dz * dz);
        bestScore = std::min(bestScore, dist);
      }
      std::vector<KernelSelection> filtered;
      for (const auto& c : candidates) {
        auto cc = c.meta.value("center", json::array({0, 0, 0}));
        double dx = cc[0].get<double>() - tx;
        double dy = cc[1].get<double>() - ty;
        double dz = cc[2].get<double>() - tz;
        double dist = std::sqrt(dx * dx + dy * dy + dz * dz);
        if (dist == bestScore) filtered.push_back(c);
      }
      candidates.swap(filtered);
    }
  }

  if (candidates.size() != 1) {
    error = "Selector ambiguity after ranking";
    return std::nullopt;
  }
  return candidates.front();
}

static TopoDS_Shape resolveGeometryRef(const json& ref,
                                       const KernelResult& current,
                                       const ShapeRegistry& registry) {
  if (!ref.is_object()) {
    throw std::runtime_error("Invalid geometry ref");
  }
  const std::string kind = ref.value("kind", "");
  json selector = ref.value("selector", json::object());
  std::string error;
  auto selection = resolveSelector(selector, current, error);
  if (!selection) {
    throw std::runtime_error(error);
  }
  if (kind == "ref.surface" && selection->kind != "face") {
    throw std::runtime_error("Expected face selection for ref.surface");
  }
  if (kind == "ref.edge" && selection->kind != "edge") {
    throw std::runtime_error("Expected edge selection for ref.edge");
  }
  if (kind == "ref.axis" || kind == "ref.point" || kind == "ref.frame") {
    throw std::runtime_error("Geometry ref kind not supported yet: " + kind);
  }
  const std::string handle = selection->meta.value("handle", "");
  if (handle.empty()) {
    throw std::runtime_error("Selection missing handle metadata");
  }
  return registry.get(handle);
}

static XCAFDimTolObjects_DatumSingleModif mapDatumModifier(const std::string& mod) {
  if (mod == "MMB") return XCAFDimTolObjects_DatumSingleModif_MaximumMaterialRequirement;
  if (mod == "LMB") return XCAFDimTolObjects_DatumSingleModif_LeastMaterialRequirement;
  return XCAFDimTolObjects_DatumSingleModif_Basic;
}

static std::optional<XCAFDimTolObjects_GeomToleranceModif> mapTolModifier(const std::string& mod) {
  if (mod == "MMC") return XCAFDimTolObjects_GeomToleranceModif_Maximum_Material_Requirement;
  if (mod == "LMC") return XCAFDimTolObjects_GeomToleranceModif_Least_Material_Requirement;
  if (mod == "FREE_STATE") return XCAFDimTolObjects_GeomToleranceModif_Free_State;
  if (mod == "TANGENT_PLANE") return XCAFDimTolObjects_GeomToleranceModif_Tangent_Plane;
  if (mod == "STATISTICAL") return XCAFDimTolObjects_GeomToleranceModif_Statistical_Tolerance;
  return std::nullopt;
}

static XCAFDimTolObjects_GeomToleranceType mapToleranceType(const std::string& kind) {
  if (kind == "constraint.surfaceProfile") return XCAFDimTolObjects_GeomToleranceType_ProfileOfSurface;
  if (kind == "constraint.flatness") return XCAFDimTolObjects_GeomToleranceType_Flatness;
  if (kind == "constraint.parallelism") return XCAFDimTolObjects_GeomToleranceType_Parallelism;
  if (kind == "constraint.perpendicularity") return XCAFDimTolObjects_GeomToleranceType_Perpendicularity;
  if (kind == "constraint.position") return XCAFDimTolObjects_GeomToleranceType_Position;
  return XCAFDimTolObjects_GeomToleranceType_None;
}

static void ensureStepControllersReady() {
  static bool initialized = false;
  if (initialized) return;
  STEPControl_Controller::Init();
  STEPCAFControl_Controller::Init();
  initialized = true;
}

static std::string toUpperCopy(const std::string& value) {
  std::string out = value;
  for (char& ch : out) {
    if (ch >= 'a' && ch <= 'z') {
      ch = static_cast<char>(ch - 'a' + 'A');
    }
  }
  return out;
}

static std::string findSchemaEnumMatch(const std::string& token) {
  const int start = Interface_Static::IDef("write.step.schema", "estart");
  const int count = Interface_Static::IDef("write.step.schema", "ecount");
  if (count <= 0) return "";
  const std::string tokenUpper = toUpperCopy(token);
  for (int i = 0; i < count; ++i) {
    const int idx = start + i;
    const std::string key = std::string("enum ") + std::to_string(idx);
    const char* value = Interface_Static::CDef("write.step.schema", key.c_str());
    if (!value || value[0] == '\0') continue;
    const std::string valueStr(value);
    if (toUpperCopy(valueStr).find(tokenUpper) != std::string::npos) {
      return valueStr;
    }
  }
  return "";
}

static void writeStepSchema(const std::string& schema) {
  if (schema.empty()) return;
  ensureStepControllersReady();
  std::string target = schema;
  if (schema == "AP242") {
    const std::string mapped = findSchemaEnumMatch("AP242");
    if (!mapped.empty()) target = mapped;
  } else {
    const std::string mapped = findSchemaEnumMatch(schema);
    if (!mapped.empty()) target = mapped;
  }
  Interface_Static::SetCVal("write.step.schema", target.c_str());
}

static std::vector<unsigned char> readFileBytes(const std::string& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) return {};
  input.seekg(0, std::ios::end);
  std::size_t size = static_cast<std::size_t>(input.tellg());
  input.seekg(0, std::ios::beg);
  std::vector<unsigned char> data(size);
  input.read(reinterpret_cast<char*>(data.data()), static_cast<std::streamsize>(size));
  return data;
}

static json meshShape(const TopoDS_Shape& shape, const json& options) {
  const double linDeflection = options.value("linearDeflection", 0.1);
  const double angDeflection = options.value("angularDeflection", 0.5);
  const bool relative = options.value("relative", false);

  BRepMesh_IncrementalMesh mesher(shape, linDeflection, relative, angDeflection, true);
  mesher.Perform();

  std::vector<double> positions;
  std::vector<int> indices;
  int vertexOffset = 0;

  TopExp_Explorer explorer(shape, TopAbs_FACE);
  for (; explorer.More(); explorer.Next()) {
    TopoDS_Face face = TopoDS::Face(explorer.Current());
    TopLoc_Location loc;
    Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(face, loc);
    if (triangulation.IsNull()) continue;
    const int nodeCount = triangulation->NbNodes();
    for (int i = 1; i <= nodeCount; ++i) {
      gp_Pnt p = triangulation->Node(i).Transformed(loc.Transformation());
      positions.push_back(p.X());
      positions.push_back(p.Y());
      positions.push_back(p.Z());
    }
    const int triCount = triangulation->NbTriangles();
    for (int i = 1; i <= triCount; ++i) {
      int n1, n2, n3;
      triangulation->Triangle(i).Get(n1, n2, n3);
      indices.push_back(vertexOffset + n1 - 1);
      indices.push_back(vertexOffset + n2 - 1);
      indices.push_back(vertexOffset + n3 - 1);
    }
    vertexOffset += nodeCount;
  }

  json out;
  out["positions"] = positions;
  out["indices"] = indices;
  return out;
}

static std::vector<unsigned char> exportStep(const TopoDS_Shape& shape,
                                             const std::string& schema) {
  writeStepSchema(schema);
  STEPControl_Writer writer;
  writer.Transfer(shape, STEPControl_AsIs);
  const std::string path = "/tmp/trueform-native.step";
  IFSelect_ReturnStatus status = writer.Write(path.c_str());
  if (status != IFSelect_RetDone) {
    throw std::runtime_error("Failed to write STEP");
  }
  return readFileBytes(path);
}

static std::vector<unsigned char> exportStepWithPmi(const TopoDS_Shape& shape,
                                                    const KernelResult& current,
                                                    const ShapeRegistry& registry,
                                                    const json& pmiPayload,
                                                    const std::string& schema) {
  writeStepSchema(schema);
  Handle(TDocStd_Document) doc = new TDocStd_Document("MDTV-XCAF");
  Handle(XCAFDoc_ShapeTool) shapeTool = XCAFDoc_DocumentTool::ShapeTool(doc->Main());
  Handle(XCAFDoc_DimTolTool) dimTolTool = XCAFDoc_DocumentTool::DimTolTool(doc->Main());

  TDF_Label shapeLabel = shapeTool->AddShape(shape);

  std::unordered_map<std::string, TDF_Label> datumLabels;
  if (pmiPayload.contains("datums")) {
    for (const auto& datum : pmiPayload["datums"]) {
      const std::string datumId = datum.value("id", "");
      const std::string label = datum.value("label", datumId);
      const json target = datum.value("target", json::object());
      TopoDS_Shape targetShape = resolveGeometryRef(target, current, registry);
      TDF_Label targetLabel = shapeTool->AddSubShape(shapeLabel, targetShape);

      TDF_Label datumLabel = dimTolTool->AddDatum();
      Handle(TCollection_HAsciiString) name = new TCollection_HAsciiString(label.c_str());
      Handle(TCollection_HAsciiString) empty = new TCollection_HAsciiString("");
      XCAFDoc_Datum::Set(datumLabel, name, empty, name);
      {
        TDF_LabelSequence seq;
        seq.Append(targetLabel);
        dimTolTool->SetDatum(seq, datumLabel);
      }

      if (datum.contains("modifiers") && datum["modifiers"].is_array()) {
        Handle(XCAFDoc_Datum) datumAttr = XCAFDoc_Datum::Set(datumLabel);
        Handle(XCAFDimTolObjects_DatumObject) datumObj = datumAttr->GetObject();
        if (datumObj.IsNull()) {
          datumObj = new XCAFDimTolObjects_DatumObject();
        }
        for (const auto& mod : datum["modifiers"]) {
          datumObj->AddModifier(mapDatumModifier(mod.get<std::string>()));
        }
        datumAttr->SetObject(datumObj);
      }

      if (!datumId.empty()) {
        datumLabels[datumId] = datumLabel;
      }
    }
  }

  if (pmiPayload.contains("constraints")) {
    for (const auto& constraint : pmiPayload["constraints"]) {
      const std::string kind = constraint.value("kind", "");
      XCAFDimTolObjects_GeomToleranceType tolType = mapToleranceType(kind);
      if (tolType == XCAFDimTolObjects_GeomToleranceType_None) {
        continue;
      }
      const json targetRef = constraint.value("target", json::object());
      TopoDS_Shape targetShape = resolveGeometryRef(targetRef, current, registry);
      TDF_Label targetLabel = shapeTool->AddSubShape(shapeLabel, targetShape);

      TDF_Label tolLabel = dimTolTool->AddGeomTolerance();
      Handle(XCAFDoc_GeomTolerance) tolAttr = XCAFDoc_GeomTolerance::Set(tolLabel);
      Handle(XCAFDimTolObjects_GeomToleranceObject) tolObj = new XCAFDimTolObjects_GeomToleranceObject();
      tolObj->SetType(tolType);
      tolObj->SetValue(parseScalar(constraint.value("tolerance", 0.0)));

      if (kind == "constraint.position") {
        const std::string zone = constraint.value("zone", "");
        if (zone == "diameter") {
          tolObj->SetTypeOfValue(XCAFDimTolObjects_GeomToleranceTypeValue_Diameter);
        }
      }

      if (constraint.contains("modifiers") && constraint["modifiers"].is_array()) {
        for (const auto& mod : constraint["modifiers"]) {
          auto mapped = mapTolModifier(mod.get<std::string>());
          if (mapped) tolObj->AddModifier(*mapped);
        }
      }

      tolAttr->SetObject(tolObj);
      dimTolTool->SetGeomTolerance(targetLabel, tolLabel);

      if (constraint.contains("datum") && constraint["datum"].is_array()) {
        for (const auto& datumRef : constraint["datum"]) {
          const std::string refId = datumRef.value("datum", "");
          auto it = datumLabels.find(refId);
          if (it != datumLabels.end()) {
            dimTolTool->SetDatumToGeomTol(it->second, tolLabel);
          }
        }
      }
    }
  }

  STEPCAFControl_Writer writer;
  writer.SetDimTolMode(true);
  writer.SetNameMode(true);
  writer.SetPropsMode(true);
  writer.Transfer(doc, STEPControl_AsIs);
  const std::string path = "/tmp/trueform-native-pmi.step";
  IFSelect_ReturnStatus status = writer.Write(path.c_str());
  if (status != IFSelect_RetDone) {
    throw std::runtime_error("Failed to write STEP with PMI");
  }
  return readFileBytes(path);
}

static json capabilitiesPayload() {
  json payload;
  payload["name"] = "opencascade.native";
  payload["featureKinds"] = json::array({"datum.plane", "datum.axis", "datum.frame", "feature.sketch2d", "feature.extrude", "feature.plane", "feature.surface", "feature.revolve", "feature.pipe", "feature.loft", "feature.sweep"});
  payload["featureStages"] = {
      {"datum.plane", {{"stage", "stable"}}},
      {"datum.axis", {{"stage", "stable"}}},
      {"datum.frame", {{"stage", "stable"}}},
      {"feature.sketch2d", {{"stage", "stable"}}},
      {"feature.extrude", {{"stage", "stable"}}},
      {"feature.plane", {{"stage", "stable"}}},
      {"feature.surface", {{"stage", "stable"}}},
      {"feature.revolve", {{"stage", "stable"}}},
      {"feature.pipe", {{"stage", "stable"}}},
      {"feature.loft", {{"stage", "stable"}}},
      {"feature.sweep", {{"stage", "experimental"}}},
  };
  payload["mesh"] = true;
  payload["exports"] = {
      {"step", true},
      {"stl", false},
  };
  payload["assertions"] = json::array();
  return payload;
}

int main(int argc, char** argv) {
  std::string host = "127.0.0.1";
  int port = 8081;
  if (argc >= 2) host = argv[1];
  if (argc >= 3) port = std::stoi(argv[2]);

  {
    ensureStepControllersReady();
    const int start = Interface_Static::IDef("write.step.schema", "estart");
    const int count = Interface_Static::IDef("write.step.schema", "ecount");
    if (count > 0) {
      std::cout << "write.step.schema options:";
      for (int i = 0; i < count; ++i) {
        const int idx = start + i;
        const std::string key = std::string("enum ") + std::to_string(idx);
        const char* value = Interface_Static::CDef("write.step.schema", key.c_str());
        if (value && value[0] != '\0') {
          std::cout << " [" << idx << "]=" << value;
        }
      }
      std::cout << " current=" << Interface_Static::CVal("write.step.schema");
      std::cout << std::endl;
    }
  }

  SessionManager sessions;
  httplib::Server server;

  server.Get("/v1/capabilities", [&](const httplib::Request&, httplib::Response& res) {
    res.set_content(capabilitiesPayload().dump(), "application/json");
  });

  server.Post("/v1/exec-feature", [&](const httplib::Request& req, httplib::Response& res) {
    try {
      json payload = json::parse(req.body);
      const std::string sessionId = payload.value("sessionId", "default");
      Session& session = sessions.get(sessionId);

      KernelResult upstream = parseKernelResult(payload.value("upstream", json::object()));
      const json feature = payload.value("feature", json::object());
      const std::string kind = feature.value("kind", "");
      const std::string featureId = feature.value("id", "feature");
      const json tags = feature.value("tags", json::array());

      if (kind == "datum.plane") {
        gp_Vec normal = parseAxis(feature.value("normal", json("+Z")));
        if (normal.Magnitude() == 0) {
          throw std::runtime_error("datum.plane normal is invalid");
        }
        normal.Normalize();
        gp_Pnt origin = parsePoint3D(feature.value("origin", json::array({0, 0, 0})));
        gp_Vec xAxis(0, 0, 0);
        if (feature.contains("xAxis")) {
          xAxis = parseAxis(feature["xAxis"]);
          if (xAxis.Magnitude() != 0) {
            xAxis.Normalize();
          }
        }
        json meta;
        meta["type"] = "plane";
        meta["origin"] = pointToJson(origin);
        meta["normal"] = vecToJson(normal);
        if (xAxis.Magnitude() != 0) meta["xDir"] = vecToJson(xAxis);
        KernelResult built = makeDatumResult("datum:" + featureId, featureId + ":datum", meta);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind == "datum.axis") {
        gp_Vec direction = parseAxis(feature.value("direction", json("+Z")));
        if (direction.Magnitude() == 0) {
          throw std::runtime_error("datum.axis direction is invalid");
        }
        direction.Normalize();
        gp_Pnt origin = parsePoint3D(feature.value("origin", json::array({0, 0, 0})));
        json meta;
        meta["type"] = "axis";
        meta["origin"] = pointToJson(origin);
        meta["direction"] = vecToJson(direction);
        KernelResult built = makeDatumResult("datum:" + featureId, featureId + ":datum", meta);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind == "datum.frame") {
        std::string error;
        auto selection = resolveSelector(feature.value("on", json::object()), upstream, error);
        if (!selection) {
          throw std::runtime_error(error.empty() ? "datum.frame selector failed" : error);
        }
        if (selection->kind != "face") {
          throw std::runtime_error("datum.frame must resolve to a face");
        }
        const std::string handle = selection->meta.value("handle", "");
        if (handle.empty()) {
          throw std::runtime_error("datum.frame face selection missing handle");
        }
        TopoDS_Shape shape = session.registry.get(handle);
        TopoDS_Face face = TopoDS::Face(shape);
        BRepAdaptor_Surface adaptor(face, true);
        if (adaptor.GetType() != GeomAbs_Plane) {
          throw std::runtime_error("datum.frame currently requires a planar face");
        }
        gp_Pln plane = adaptor.Plane();
        gp_Ax3 ax3 = plane.Position();
        gp_Pnt origin = ax3.Location();
        gp_Dir xDir = ax3.XDirection();
        gp_Dir yDir = ax3.YDirection();
        gp_Dir normal = ax3.Direction();
        json meta;
        meta["type"] = "frame";
        meta["origin"] = pointToJson(origin);
        meta["xDir"] = json::array({xDir.X(), xDir.Y(), xDir.Z()});
        meta["yDir"] = json::array({yDir.X(), yDir.Y(), yDir.Z()});
        meta["normal"] = json::array({normal.X(), normal.Y(), normal.Z()});
        KernelResult built = makeDatumResult("datum:" + featureId, featureId + ":datum", meta);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind == "feature.sketch2d") {
        KernelResult built = makeSketchProfileResult(feature);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind == "feature.surface") {
        const json profile = resolveProfileJson(feature.value("profile", json::object()), upstream);
        TopoDS_Face face = buildProfileFace(profile);
        const std::string resultKey = feature.value("result", "surface:main");
        KernelResult built = collectSelections(
            face, session.registry, featureId, resultKey, "surface", tags);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind == "feature.plane") {
        const double width = parseScalar(feature.value("width", 0.0));
        const double height = parseScalar(feature.value("height", 0.0));
        if (!(width > 0) || !(height > 0)) {
          throw std::runtime_error("feature.plane requires positive width and height");
        }
        const json basis = feature.contains("plane")
            ? resolvePlaneBasisJson(feature["plane"], upstream)
            : json{
                  {"origin", json::array({0, 0, 0})},
                  {"xDir", json::array({1, 0, 0})},
                  {"yDir", json::array({0, 1, 0})},
                  {"normal", json::array({0, 0, 1})},
              };
        const json originOffset = feature.value("origin", json::array({0, 0, 0}));
        TopoDS_Face face = makePlaneFaceFromBasis(basis, width, height, originOffset);
        const std::string resultKey = feature.value("result", "surface:main");
        KernelResult built = collectSelections(
            face, session.registry, featureId, resultKey, "surface", tags);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind == "feature.revolve") {
        const json profile = resolveProfileJson(feature.value("profile", json::object()), upstream);
        TopoDS_Face face = buildProfileFace(profile);
        gp_Vec axisVec = parseAxis(feature.value("axis", json("+Z")));
        if (axisVec.Magnitude() == 0) {
          throw std::runtime_error("feature.revolve axis is invalid");
        }
        axisVec.Normalize();
        gp_Pnt origin = parsePoint3D(feature.value("origin", json::array({0, 0, 0})));
        gp_Ax1 axis(origin, gp_Dir(axisVec));
        json angleJson = feature.value("angle", "full");
        double angleRad = 2.0 * M_PI;
        if (angleJson.is_number()) {
          angleRad = parseScalar(angleJson);
        } else if (angleJson.is_string() && angleJson.get<std::string>() != "full") {
          throw std::runtime_error("feature.revolve angle must be numeric or 'full'");
        }
        TopoDS_Shape shape = BRepPrimAPI_MakeRevol(face, axis, angleRad);
        const std::string resultKey = feature.value("result", "body:main");
        KernelResult built = collectSelections(
            shape, session.registry, featureId, resultKey, "solid", tags);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind == "feature.pipe") {
        gp_Vec axisVec = parseAxis(feature.value("axis", json("+Z")));
        if (axisVec.Magnitude() == 0) {
          throw std::runtime_error("feature.pipe axis is invalid");
        }
        axisVec.Normalize();
        const double length = parseScalar(feature.value("length", 0.0));
        const double outerDia = parseScalar(feature.value("outerDiameter", 0.0));
        const double innerDia = feature.contains("innerDiameter")
            ? parseScalar(feature["innerDiameter"])
            : 0.0;
        if (!(length > 0)) {
          throw std::runtime_error("feature.pipe length must be positive");
        }
        if (!(outerDia > 0)) {
          throw std::runtime_error("feature.pipe outer diameter must be positive");
        }
        if (innerDia < 0) {
          throw std::runtime_error("feature.pipe inner diameter must be non-negative");
        }
        if (innerDia > 0 && innerDia >= outerDia) {
          throw std::runtime_error("feature.pipe inner diameter must be smaller than outer diameter");
        }
        gp_Pnt origin = parsePoint3D(feature.value("origin", json::array({0, 0, 0})));
        gp_Ax2 axis(origin, gp_Dir(axisVec));
        TopoDS_Shape outer = BRepPrimAPI_MakeCylinder(axis, outerDia / 2.0, length);
        TopoDS_Shape shape = outer;
        if (innerDia > 0) {
          TopoDS_Shape inner = BRepPrimAPI_MakeCylinder(axis, innerDia / 2.0, length);
          shape = BRepAlgoAPI_Cut(outer, inner);
        }
        const std::string resultKey = feature.value("result", "body:main");
        KernelResult built = collectSelections(
            shape, session.registry, featureId, resultKey, "solid", tags);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind == "feature.loft") {
        const json profiles = feature.value("profiles", json::array());
        if (!profiles.is_array() || profiles.size() < 2) {
          throw std::runtime_error("feature.loft requires at least two profiles");
        }
        const bool makeSolid = feature.value("mode", std::string("solid")) != "surface";
        BRepOffsetAPI_ThruSections loftBuilder(makeSolid, false, Precision::Confusion());
        for (const auto& profileRef : profiles) {
          const json profile = resolveProfileJson(profileRef, upstream);
          loftBuilder.AddWire(buildProfileWire(profile));
        }
        loftBuilder.Build();
        if (!loftBuilder.IsDone()) {
          throw std::runtime_error("feature.loft failed to build");
        }
        TopoDS_Shape shape = loftBuilder.Shape();
        const std::string resultKey = feature.value(
            "result", makeSolid ? "body:main" : "surface:main");
        KernelResult built = collectSelections(
            shape, session.registry, featureId, resultKey, makeSolid ? "solid" : "surface", tags);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind == "feature.sweep") {
        if (feature.contains("frame")) {
          throw std::runtime_error("Native backend sweep does not support custom frame references yet");
        }
        if (feature.contains("orientation") &&
            feature["orientation"].is_string() &&
            feature["orientation"].get<std::string>() != "frenet") {
          throw std::runtime_error("Native backend sweep currently supports only frenet orientation");
        }
        const json profile = resolveProfileJson(feature.value("profile", json::object()), upstream);
        TopoDS_Wire pathWire = buildPathWire(feature.value("path", json::object()));
        const bool makeSolid = feature.value("mode", std::string("solid")) != "surface";
        TopoDS_Shape section = makeSolid
            ? TopoDS_Shape(buildProfileFace(profile))
            : TopoDS_Shape(buildProfileWire(profile));
        BRepOffsetAPI_MakePipe sweepBuilder(pathWire, section);
        sweepBuilder.Build();
        if (!sweepBuilder.IsDone()) {
          throw std::runtime_error("feature.sweep failed to build");
        }
        TopoDS_Shape shape = sweepBuilder.Shape();
        const std::string resultKey = feature.value(
            "result", makeSolid ? "body:main" : "surface:main");
        KernelResult built = collectSelections(
            shape, session.registry, featureId, resultKey, makeSolid ? "solid" : "surface", tags);
        KernelResult merged = mergeResults(upstream, built);
        session.current = merged;

        json response;
        response["result"] = serializeKernelResult(built);
        res.set_content(response.dump(), "application/json");
        return;
      }

      if (kind != "feature.extrude") {
        throw std::runtime_error("Unsupported feature kind: " + kind);
      }
      const json profile = resolveProfileJson(feature.value("profile", json::object()), upstream);
      TopoDS_Face face = buildProfileFace(profile);
      json depthJson = feature.value("depth", 0.0);
      if (depthJson.is_string() && depthJson.get<std::string>() == "throughAll") {
        throw std::runtime_error("throughAll not supported in native backend yet");
      }
      double depth = parseScalar(depthJson);
      gp_Vec axis = parseAxis(feature.value("axis", json::object()));
      if (axis.Magnitude() == 0) axis = gp_Vec(0, 0, 1);
      axis.Normalize();
      gp_Vec vec = axis.Multiplied(depth);
      TopoDS_Shape solid = BRepPrimAPI_MakePrism(face, vec);

      const std::string resultKey = feature.value("result", "body:main");
      KernelResult built = collectSelections(
          solid, session.registry, featureId, resultKey, "solid", tags);
      KernelResult merged = mergeResults(upstream, built);
      session.current = merged;

      json response;
      response["result"] = serializeKernelResult(built);
      res.set_content(response.dump(), "application/json");
    } catch (const std::exception& ex) {
      res.status = 400;
      res.set_content(std::string("error: ") + ex.what(), "text/plain");
    }
  });

  server.Post("/v1/mesh", [&](const httplib::Request& req, httplib::Response& res) {
    try {
      json payload = json::parse(req.body);
      const std::string sessionId = payload.value("sessionId", "default");
      Session& session = sessions.get(sessionId);
      const std::string handle = payload.value("handle", "");
      if (handle.empty()) throw std::runtime_error("Missing shape handle");
      TopoDS_Shape shape = session.registry.get(handle);
      json result = meshShape(shape, payload.value("options", json::object()));
      res.set_content(result.dump(), "application/json");
    } catch (const std::exception& ex) {
      res.status = 400;
      res.set_content(std::string("error: ") + ex.what(), "text/plain");
    }
  });

  server.Post("/v1/export-step", [&](const httplib::Request& req, httplib::Response& res) {
    try {
      json payload = json::parse(req.body);
      const std::string sessionId = payload.value("sessionId", "default");
      Session& session = sessions.get(sessionId);
      const std::string handle = payload.value("handle", "");
      if (handle.empty()) throw std::runtime_error("Missing shape handle");
      TopoDS_Shape shape = session.registry.get(handle);
      const std::string schema = payload.value("options", json::object()).value("schema", "AP242");
      auto bytes = exportStep(shape, schema);
      res.set_content(reinterpret_cast<const char*>(bytes.data()), bytes.size(), "application/octet-stream");
    } catch (const std::exception& ex) {
      res.status = 400;
      res.set_content(std::string("error: ") + ex.what(), "text/plain");
    }
  });

  server.Post("/v1/export-step-pmi", [&](const httplib::Request& req, httplib::Response& res) {
    try {
      json payload = json::parse(req.body);
      const std::string sessionId = payload.value("sessionId", "default");
      Session& session = sessions.get(sessionId);
      const std::string handle = payload.value("handle", "");
      if (handle.empty()) throw std::runtime_error("Missing shape handle");
      TopoDS_Shape shape = session.registry.get(handle);
      const json pmiPayload = payload.value("pmi", json::object());
      const std::string schema = payload.value("options", json::object()).value("schema", "AP242");
      auto bytes = exportStepWithPmi(shape, session.current, session.registry, pmiPayload, schema);
      res.set_content(reinterpret_cast<const char*>(bytes.data()), bytes.size(), "application/octet-stream");
    } catch (const std::exception& ex) {
      res.status = 400;
      res.set_content(std::string("error: ") + ex.what(), "text/plain");
    }
  });

  std::cout << "occt_server listening on " << host << ":" << port << std::endl;
  server.listen(host.c_str(), port);
  return 0;
}

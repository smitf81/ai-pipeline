"""Build the BSB runtime baby-wyvern skin from the open Dragon_Main_March_V5 scene.

Run from Blender's Python Console. The script never overwrites the source blend:

    exec(compile(open(r".../rig_baby_wyvern_v5.py").read(), "rig_baby_wyvern_v5.py", "exec"))

It bakes Mirror + the unsubdivided source cage into a duplicate, creates an anatomical
deform hierarchy designed for BSB's procedural pose packet, assigns deterministic
region-owned weights, exports a GLB, and saves a rigged blend copy.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


CONTRACT = "black-sky-bound.skinned-baby-wyvern.v2"
SOURCE_OBJECT = "Cube"
PREFIX = "BSB_BabyWyvern"
SUBDIVISION_LEVEL = 0
EXPORT_SCALE = 0.25
PROJECT_ROOT = Path(r"C:\Users\felix\Desktop\Automated_AI_Pipeline\_A_Projects\BLACK_SKY_BOUND_V2")
OUTPUT_DIR = PROJECT_ROOT / "assets" / "models" / "player"
GLB_PATH = OUTPUT_DIR / "dragon_main_march_v5_baby_rig.glb"
BLEND_PATH = OUTPUT_DIR / "dragon_main_march_v5_baby_rig.blend"
METADATA_PATH = OUTPUT_DIR / "dragon_main_march_v5_baby_rig.json"


def set_object_mode() -> None:
    active = bpy.context.view_layer.objects.active
    if active and active.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def remove_previous_output() -> None:
    set_object_mode()
    for obj in list(bpy.data.objects):
        if obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)
    old_collection = bpy.data.collections.get(PREFIX)
    if old_collection:
        bpy.data.collections.remove(old_collection)


def bake_source_mesh(source: bpy.types.Object) -> bpy.types.Mesh:
    set_object_mode()
    temporary = source.copy()
    temporary.data = source.data.copy()
    temporary.name = f"{PREFIX}_BakeTemp"
    bpy.context.scene.collection.objects.link(temporary)
    temporary.hide_viewport = False
    temporary.hide_render = False
    try:
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        temporary.select_set(True)
        bpy.context.view_layer.objects.active = temporary
        for modifier in list(temporary.modifiers):
            if modifier.type == "SUBSURF":
                if SUBDIVISION_LEVEL <= 0:
                    temporary.modifiers.remove(modifier)
                    continue
                modifier.levels = SUBDIVISION_LEVEL
                modifier.render_levels = SUBDIVISION_LEVEL
            modifier.show_viewport = True
            modifier.show_render = True
            result = bpy.ops.object.modifier_apply(modifier=modifier.name)
            if "FINISHED" not in result:
                raise RuntimeError(f"Failed to bake source modifier {modifier.name}: {result}")
        mesh = temporary.data.copy()
        world_vertices = [temporary.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        bpy.data.objects.remove(temporary, do_unlink=True)

    minimum = Vector((
        min(vertex.x for vertex in world_vertices),
        min(vertex.y for vertex in world_vertices),
        min(vertex.z for vertex in world_vertices),
    ))
    maximum = Vector((
        max(vertex.x for vertex in world_vertices),
        max(vertex.y for vertex in world_vertices),
        max(vertex.z for vertex in world_vertices),
    ))
    center_x = (minimum.x + maximum.x) * 0.5
    hip_y = minimum.y + (maximum.y - minimum.y) * 0.47

    for vertex, world in zip(mesh.vertices, world_vertices):
        vertex.co = Vector((
            (world.x - center_x) * EXPORT_SCALE,
            (world.y - hip_y) * EXPORT_SCALE,
            (world.z - minimum.z) * EXPORT_SCALE,
        ))
    author_grounded_wing_bind(mesh)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.name = f"{PREFIX}_MeshData"
    mesh.update()
    return mesh


def author_grounded_wing_bind(mesh: bpy.types.Mesh) -> None:
    """Fold the source flying silhouette into a compact grounded bind shape.

    The original full-span vertex position is retained as immutable region metadata so
    skin ownership does not have to guess anatomy after the fold.
    """
    minimum, maximum = mesh_bounds(mesh)
    length = maximum.y - minimum.y
    height = maximum.z - minimum.z
    half_span = max(abs(minimum.x), abs(maximum.x))
    region_attribute = mesh.attributes.get("bsb_region") or mesh.attributes.new("bsb_region", "INT", "POINT")
    outward_attribute = mesh.attributes.get("bsb_outward") or mesh.attributes.new("bsb_outward", "FLOAT", "POINT")
    shoulder_y = minimum.y + length * 0.62

    for vertex in mesh.vertices:
        coordinate = vertex.co.copy()
        outward = abs(coordinate.x) / max(1e-8, half_span)
        progress = (coordinate.y - minimum.y) / max(1e-8, length)
        low = coordinate.z < minimum.z + height * 0.47
        side_offset = 0 if coordinate.x >= 0 else 1
        hind_region = 0.055 < outward < 0.19 and 0.40 < progress < 0.57 and low
        wing_region = outward >= 0.075 and progress >= 0.34 and not hind_region
        region = 3 + side_offset if hind_region else 1 + side_offset if wing_region else 0
        region_attribute.data[vertex.index].value = region
        outward_attribute.data[vertex.index].value = outward
        if not wing_region:
            continue

        fold = max(0.0, min(1.0, (outward - 0.075) / 0.16))
        fold = fold * fold * (3.0 - 2.0 * fold)
        sign = 1.0 if coordinate.x >= 0 else -1.0
        # Keep the membrane alongside the ribs and end its longest fingers near
        # the haunches. The previous 0.55 body-length fold turned each finger
        # into a parallel tail spike in the game camera.
        folded_x = sign * (half_span * (0.09 + outward * 0.16))
        folded_y = shoulder_y - outward * length * 0.31 + (coordinate.y - shoulder_y) * 0.08
        # The shoulders remain readable above the membrane while the wrist edge
        # settles toward the ground-contact plane.
        folded_z = minimum.z + height * (0.34 + (1.0 - outward) * 0.16)
        vertex.co.x = coordinate.x * (1.0 - fold) + folded_x * fold
        vertex.co.y = coordinate.y * (1.0 - fold) + folded_y * fold
        vertex.co.z = coordinate.z * (1.0 - fold) + folded_z * fold

    # Break the source model's perfectly straight tail into a subtle grounded
    # curve. This is bind shaping, not locomotion; the procedural tail chain can
    # still add follow-through at runtime.
    for vertex in mesh.vertices:
        coordinate = vertex.co.copy()
        progress = (coordinate.y - minimum.y) / max(1e-8, length)
        if progress >= 0.47:
            continue
        tail_progress = (0.47 - progress) / 0.47
        vertex.co.x += length * 0.048 * math.sin(tail_progress * math.pi * 1.15)


def mesh_bounds(mesh: bpy.types.Mesh) -> tuple[Vector, Vector]:
    minimum = Vector((
        min(vertex.co.x for vertex in mesh.vertices),
        min(vertex.co.y for vertex in mesh.vertices),
        min(vertex.co.z for vertex in mesh.vertices),
    ))
    maximum = Vector((
        max(vertex.co.x for vertex in mesh.vertices),
        max(vertex.co.y for vertex in mesh.vertices),
        max(vertex.co.z for vertex in mesh.vertices),
    ))
    return minimum, maximum


def build_bone_specs(mesh: bpy.types.Mesh) -> list[dict]:
    minimum, maximum = mesh_bounds(mesh)
    length = maximum.y - minimum.y
    half_span = max(abs(minimum.x), abs(maximum.x))
    height = maximum.z - minimum.z
    y_at = lambda factor: minimum.y + length * factor
    z_at = lambda factor: minimum.z + height * factor
    point = lambda x, y, z: Vector((x, y, z))

    hips = point(0, y_at(0.47), z_at(0.48))
    chest = point(0, y_at(0.62), z_at(0.58))
    neck = point(0, y_at(0.73), z_at(0.66))
    head = point(0, y_at(0.80), z_at(0.64))
    muzzle = point(0, y_at(0.88), z_at(0.56))

    specs = [
        {"name": "bsb_root", "head": point(0, 0, 0), "tail": point(0, 0.08, 0), "deform": False, "parent": None},
        {"name": "body_hips", "head": hips, "tail": chest, "deform": True, "parent": "bsb_root"},
        {"name": "body_chest", "head": chest, "tail": neck, "deform": True, "parent": "body_hips"},
        {"name": "neck", "head": neck, "tail": head, "deform": True, "parent": "body_chest"},
        {"name": "head", "head": head, "tail": muzzle, "deform": True, "parent": "neck"},
        {
            "name": "jaw",
            "head": head + Vector((0, 0, -height * 0.10)),
            "tail": muzzle + Vector((0, 0, -height * 0.12)),
            "deform": True,
            "parent": "head",
        },
    ]

    tail_points = [
        hips,
        point(0, y_at(0.35), z_at(0.42)),
        point(0, y_at(0.24), z_at(0.34)),
        point(0, y_at(0.14), z_at(0.27)),
        point(0, y_at(0.06), z_at(0.20)),
        point(0, y_at(0.00), z_at(0.13)),
    ]
    for index in range(5):
        specs.append({
            "name": f"tail_{index}",
            "head": tail_points[index],
            "tail": tail_points[index + 1],
            "deform": True,
            "parent": "body_hips" if index == 0 else f"tail_{index - 1}",
        })

    for side_name, sign in (("L", 1), ("R", -1)):
        shoulder = point(sign * half_span * 0.28, y_at(0.64), z_at(0.54))
        elbow = point(sign * half_span * 0.56, y_at(0.56), z_at(0.31))
        wrist = point(sign * half_span * 0.76, y_at(0.43), z_at(0.08))
        digit_ends = [
            point(sign * half_span * 0.94, y_at(0.29), z_at(0.045)),
            point(sign * half_span * 0.82, y_at(0.33), z_at(0.055)),
            point(sign * half_span * 0.68, y_at(0.36), z_at(0.07)),
            point(sign * half_span * 0.54, y_at(0.39), z_at(0.09)),
        ]
        specs.extend([
            {"name": f"wing_upper_{side_name}", "head": shoulder, "tail": elbow, "deform": True, "parent": "body_chest"},
            {"name": f"wing_fore_{side_name}", "head": elbow, "tail": wrist, "deform": True, "parent": f"wing_upper_{side_name}"},
        ])
        for index, digit_end in enumerate(digit_ends):
            specs.append({
                "name": f"wing_digit_{index}_{side_name}",
                "head": wrist,
                "tail": digit_end,
                "deform": True,
                "parent": f"wing_fore_{side_name}",
            })

        hip = point(sign * half_span * 0.08, y_at(0.45), z_at(0.42))
        knee = point(sign * half_span * 0.14, y_at(0.39), z_at(0.25))
        ankle = point(sign * half_span * 0.13, y_at(0.34), z_at(0.09))
        foot = point(sign * half_span * 0.19, y_at(0.39), z_at(0.035))
        specs.extend([
            {"name": f"hind_upper_{side_name}", "head": hip, "tail": knee, "deform": True, "parent": "body_hips"},
            {"name": f"hind_lower_{side_name}", "head": knee, "tail": ankle, "deform": True, "parent": f"hind_upper_{side_name}"},
            {"name": f"hind_foot_{side_name}", "head": ankle, "tail": foot, "deform": True, "parent": f"hind_lower_{side_name}"},
        ])

    return specs


def create_armature(collection: bpy.types.Collection, specs: list[dict]) -> bpy.types.Object:
    armature_data = bpy.data.armatures.new(f"{PREFIX}_ArmatureData")
    armature = bpy.data.objects.new(f"{PREFIX}_Armature", armature_data)
    collection.objects.link(armature)
    armature.show_in_front = True
    armature.display_type = "WIRE"
    armature["bsb_contract"] = CONTRACT
    armature["bsb_bone_count"] = len(specs)
    armature["bsb_rest_lengths_json"] = json.dumps({
        spec["name"]: round((spec["tail"] - spec["head"]).length, 8)
        for spec in specs
        if spec["deform"]
    }, separators=(",", ":"))
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = {}
    for spec in specs:
        bone = armature_data.edit_bones.new(spec["name"])
        bone.head = spec["head"]
        bone.tail = spec["tail"]
        bone.use_deform = spec["deform"]
        edit_bones[spec["name"]] = bone
    for spec in specs:
        parent_name = spec.get("parent")
        bone = edit_bones[spec["name"]]
        bone.parent = edit_bones.get(parent_name)
        bone.use_connect = bool(bone.parent and (bone.head - bone.parent.tail).length <= 1e-6)
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def distance_to_segment(point: Vector, start: Vector, end: Vector) -> float:
    segment = end - start
    length_squared = segment.length_squared
    if length_squared <= 1e-12:
        return (point - start).length
    factor = max(0.0, min(1.0, (point - start).dot(segment) / length_squared))
    return (point - (start + segment * factor)).length


def assign_weights(mesh_object: bpy.types.Object, specs: list[dict]) -> int:
    deform_specs = [spec for spec in specs if spec["deform"]]
    groups = {spec["name"]: mesh_object.vertex_groups.new(name=spec["name"]) for spec in deform_specs}
    spec_by_name = {spec["name"]: spec for spec in deform_specs}
    minimum, maximum = mesh_bounds(mesh_object.data)
    length = maximum.y - minimum.y
    height = maximum.z - minimum.z
    half_span = max(abs(minimum.x), abs(maximum.x))
    region_attribute = mesh_object.data.attributes.get("bsb_region")
    outward_attribute = mesh_object.data.attributes.get("bsb_outward")
    if not region_attribute or not outward_attribute:
        raise RuntimeError("Grounded bind region metadata is missing")
    max_influences = 3

    def y_factor(vertex: Vector) -> float:
        return (vertex.y - minimum.y) / max(1e-8, length)

    def nearest_weights(vertex: Vector, names: list[str], limit: int = 2) -> list[tuple[str, float]]:
        scored = []
        for name in names:
            spec = spec_by_name[name]
            distance = distance_to_segment(vertex, spec["head"], spec["tail"])
            scored.append((1.0 / (distance * distance + 0.00015), name))
        strongest = sorted(scored, reverse=True)[:limit]
        total = sum(score for score, _ in strongest)
        return [(name, score / total) for score, name in strongest]

    def wing_weights(outward: float, side: str) -> list[tuple[str, float]]:
        # The continuous membrane is owned by the two load-bearing arm segments.
        # Digit bones remain runtime pose references; letting four radiating digits
        # share membrane vertices was the v1 source of slab shearing and spikes.
        fore = max(0.0, min(1.0, (outward - 0.18) / 0.48))
        return [(f"wing_upper_{side}", 1.0 - fore), (f"wing_fore_{side}", fore)]

    def axial_weights(vertex: Vector) -> list[tuple[str, float]]:
        progress = y_factor(vertex)
        if progress < 0.47:
            return nearest_weights(vertex, [f"tail_{index}" for index in range(5)], 2)
        if progress > 0.765 and vertex.z < minimum.z + height * 0.49:
            return nearest_weights(vertex, ["jaw", "head"], 2)
        return nearest_weights(vertex, ["body_hips", "body_chest", "neck", "head"], 2)

    for vertex in mesh_object.data.vertices:
        coordinate = vertex.co.copy()
        region = int(region_attribute.data[vertex.index].value)
        outward = float(outward_attribute.data[vertex.index].value)
        side = "L" if region in {1, 3} else "R"
        if region in {3, 4}:
            weights = nearest_weights(coordinate, [f"hind_upper_{side}", f"hind_lower_{side}", f"hind_foot_{side}"], 2)
        elif region in {1, 2}:
            weights = wing_weights(outward, side)
        else:
            weights = axial_weights(coordinate)
        for name, weight in weights:
            if weight > 1e-6:
                groups[name].add([vertex.index], weight, "REPLACE")
    return max_influences


def mesh_statistics(mesh: bpy.types.Mesh) -> dict:
    triangles = sum(max(1, len(polygon.vertices) - 2) for polygon in mesh.polygons)
    minimum, maximum = mesh_bounds(mesh)
    return {
        "vertices": len(mesh.vertices),
        "polygons": len(mesh.polygons),
        "triangles": triangles,
        "dimensionsMeters": [round(value, 6) for value in (maximum - minimum)],
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source = bpy.data.objects.get(SOURCE_OBJECT)
    if not source or source.type != "MESH":
        raise RuntimeError(f"Expected mesh object {SOURCE_OBJECT!r} in the open Blender scene")

    remove_previous_output()
    collection = bpy.data.collections.new(PREFIX)
    bpy.context.scene.collection.children.link(collection)
    baked_mesh = bake_source_mesh(source)
    mesh_object = bpy.data.objects.new(f"{PREFIX}_Mesh", baked_mesh)
    collection.objects.link(mesh_object)
    mesh_object["bsb_contract"] = CONTRACT
    mesh_object["bsb_source"] = bpy.data.filepath
    mesh_object["bsb_subdivision_level"] = SUBDIVISION_LEVEL

    specs = build_bone_specs(baked_mesh)
    armature = create_armature(collection, specs)
    max_influences = assign_weights(mesh_object, specs)
    modifier = mesh_object.modifiers.new(name="BSB Runtime Armature", type="ARMATURE")
    modifier.object = armature
    modifier.use_deform_preserve_volume = True
    mesh_object.parent = armature

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    mesh_object.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = mesh_object

    export_result = bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_materials="NONE",
        export_extras=True,
        export_yup=True,
    )
    if "FINISHED" not in export_result:
        raise RuntimeError(f"GLB export failed: {export_result}")

    hidden_state = {obj.name: obj.hide_viewport for obj in bpy.context.scene.objects}
    previous_save_versions = bpy.context.preferences.filepaths.save_version
    try:
        for obj in bpy.context.scene.objects:
            obj.hide_viewport = obj not in {mesh_object, armature}
        bpy.context.preferences.filepaths.save_version = 0
        save_result = bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), copy=True)
        if "FINISHED" not in save_result:
            raise RuntimeError(f"Blend copy save failed: {save_result}")
    finally:
        bpy.context.preferences.filepaths.save_version = previous_save_versions
        for name, hidden in hidden_state.items():
            obj = bpy.data.objects.get(name)
            if obj:
                obj.hide_viewport = hidden

    statistics = mesh_statistics(baked_mesh)
    metadata = {
        "contract": CONTRACT,
        "sourceBlend": bpy.data.filepath,
        "sourceObject": SOURCE_OBJECT,
        "subdivisionLevel": SUBDIVISION_LEVEL,
        "exportScale": EXPORT_SCALE,
        "mesh": statistics,
        "boneCount": len(specs),
        "deformBoneCount": sum(1 for spec in specs if spec["deform"]),
        "maxVertexInfluences": max_influences,
        "bones": [spec["name"] for spec in specs],
        "boneParents": {spec["name"]: spec.get("parent") for spec in specs},
        "weightPolicy": "region_owned_axial_tail_hind_two_zone_wing_v2",
        "bindPosePolicy": "grounded_crawl_fold_and_tail_curve_export_bind_v2",
        "glb": GLB_PATH.name,
        "blend": BLEND_PATH.name,
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print("BSB_BABY_RIG_EXPORT", json.dumps(metadata, separators=(",", ":")))


main()

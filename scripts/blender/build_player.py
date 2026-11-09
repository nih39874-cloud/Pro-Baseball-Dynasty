"""Blender 4.x: build an original, adult-proportioned baseball player asset.
Run: blender -b --python scripts/blender/build_player.py
This mesh is a professional-format starter asset, NOT an athlete likeness.
"""
import bpy, math, os
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, rgba, roughness=.72, metallic=0.0):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    node=m.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value=(*rgba,1)
    node.inputs["Roughness"].default_value=roughness
    node.inputs["Metallic"].default_value=metallic
    return m

skin=material("skin_warm",(.47,.27,.18),.79)
jersey=material("jersey_fabric",(.08,.24,.34),.9)
jersey_trim=material("jersey_trim",(.9,.91,.87),.84)
pants=material("pants_fabric",(.73,.76,.78),.88)
hair=material("hair",(.03,.025,.024),.92)
rubber=material("cleats",(.035,.043,.056),.72)
leather=material("glove",(.18,.076,.034),.79)
helmet=material("helmet_shell",(.025,.06,.085),.29)
eye=material("eyes_dark",(.045,.032,.024),.29)

def uv(name, loc, scale, mat, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    o=bpy.context.object
    o.name=name
    o.scale=scale
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for face in o.data.polygons: face.use_smooth=True
    mod=o.modifiers.new("Subdivision surface","SUBSURF")
    mod.levels=1
    return o

def tapered(name, a, b, r0, r1, mat, vertices=16):
    v0,v1=Vector(a),Vector(b)
    d=v1-v0
    mid=(v0+v1)/2
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r0, radius2=r1, depth=d.length, location=mid)
    o=bpy.context.object
    o.name=name
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    o.data.materials.append(mat)
    for f in o.data.polygons:f.use_smooth=True
    bevel=o.modifiers.new("Soft seams","BEVEL")
    bevel.width=.016
    bevel.segments=2
    o.modifiers.new("Weighted normals","WEIGHTED_NORMAL")
    return o

def cube(name, pos, dims, mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=bpy.context.object
    o.name=name
    o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    bevel=o.modifiers.new("Edge bevels","BEVEL")
    bevel.width=.015
    bevel.segments=2
    o.modifiers.new("Weighted normals","WEIGHTED_NORMAL")
    return o

# Realistic adult proportions: head ~0.23m, total height ~1.87m,
# pelvis around 0.99m, shoulders 1.48m. Head is not exaggerated.
uv("torso anatomical mesh",(0,0,1.275),(.235,.14,.315),jersey,40,24)
uv("pelvis", (0,0,.985),(.20,.125,.13),pants,32,16)
uv("neck",(0,-.007,1.607),(.069,.065,.091),skin,24,14)
uv("head cranium",(0,-.018,1.749),(.101,.093,.137),skin,40,28)
uv("jaw",(0,-.046,1.691),(.084,.081,.070),skin,32,16)
uv("chin",(0,-.066,1.649),(.056,.055,.034),skin,24,12)
uv("nose",(0,-.104,1.736),(.022,.037,.040),skin,24,14)
uv("lower lip",(0,-.109,1.683),(.038,.012,.008),skin,20,12)
for sign in [-1,1]:
    uv("cheek "+str(sign),(sign*.081,-.051,1.713),(.046,.061,.067),skin,24,14)
    uv("ear "+str(sign),(sign*.106,-.006,1.741),(.018,.022,.045),skin,18,12)
    uv("eye "+str(sign),(sign*.044,-.104,1.762),(.026,.010,.012),eye,18,12)
    uv("eyebrow "+str(sign),(sign*.044,-.106,1.786),(.034,.013,.008),hair,18,12)
    # Lean muscled arms; fielding glove on non-throwing hand.
    uv("deltoid "+str(sign),(sign*.238,0,1.445),(.090,.095,.112),jersey,28,16)
    tapered("upper arm "+str(sign),(sign*.245,0,1.424),(sign*.288,-.002,1.185),.079,.058,jersey)
    uv("elbow "+str(sign),(sign*.289,-.006,1.18),(.058,.062,.066),skin,24,12)
    tapered("forearm "+str(sign),(sign*.289,-.006,1.18),(sign*.285,-.030,.967),.058,.042,skin)
    uv("hand "+str(sign),(sign*.28,-.040,.940),(.048,.029,.072),skin,24,14)
    tapered("thigh "+str(sign),(sign*.111,0,.962),(sign*.125,-.018,.548),.122,.088,pants,22)
    uv("knee "+str(sign),(sign*.125,-.018,.535),(.090,.095,.080),pants,28,18)
    tapered("calf "+str(sign),(sign*.125,-.022,.524),(sign*.13,-.012,.135),.088,.058,pants,20)
    uv("cleat "+str(sign),(sign*.130,-.076,.075),(.095,.168,.075),rubber,28,16)
    cube("shoelace "+str(sign),(sign*.130,-.151,.137),(.08,.025,.013),jersey_trim)
uv("collar",(0,-.008,1.568),(.09,.080,.034),jersey_trim,24,14)
cube("jersey buttons",(0,-.137,1.36),(.015,.014,.24),jersey_trim)
cube("belt",(0,-.122,.979),(.37,.036,.047),rubber)
cube("belt buckle",(0,-.148,.982),(.042,.012,.042),jersey_trim)

uv("short hair crown",(0,-.003,1.841),(.105,.093,.058),hair,36,18)
uv("cap crown",(0,-.003,1.853),(.119,.113,.063),helmet,36,18)
uv("cap peak",(0,-.115,1.828),(.112,.125,.018),helmet,28,16)
uv("leather fielding glove",(-.28,-.082,.93),(.079,.047,.107),leather,28,16)
for i in range(4):
    tapered("glove finger "+str(i),(-.333+i*.034,-.09,.980),(-.335+i*.035,-.10,1.080),.018,.011,leather,10)

# Root is standardized at field level and faces -Y before engine placement.
root=bpy.data.objects.new("PLAYER_RIG_ROOT",None)
bpy.context.collection.objects.link(root)
for obj in list(bpy.context.scene.objects):
    if obj.type=='MESH':obj.parent=root

output=os.path.join(os.path.dirname(__file__),"..","..","assets","models","player_base.glb")
os.makedirs(os.path.dirname(output),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(output), export_format='GLB',export_apply=True,export_materials='EXPORT',export_yup=True)
print("EXPORTED:",os.path.abspath(output))

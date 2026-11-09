"""Blender 4.x baseball stadium asset authoring.
Original stadium, not a claim of matching any licensed real-world venue.
Coordinates are metres; playable diamond matches existing game world (home 0,0,
pitcher 0,-18, second base 0,-46).
"""
import bpy, math, os
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def mat(name,c,rough=.8,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF')
 bs.inputs['Base Color'].default_value=(*c,1)
 bs.inputs['Roughness'].default_value=rough
 bs.inputs['Metallic'].default_value=metal
 return m
grass=mat('stadium_grass',(.055,.235,.087))
grass2=mat('stadium_grass_striped',(.075,.29,.12))
clay=mat('stadium_clay',(.32,.16,.085))
track=mat('stadium_warning_track',(.29,.25,.22))
chalk=mat('stadium_chalk',(.87,.86,.82))
wall=mat('stadium_padded_wall',(.045,.20,.18))
concrete=mat('stadium_concrete',(.31,.35,.38))
seat=mat('stadium_seating',(.06,.19,.28))
steel=mat('stadium_steel',(.48,.55,.59),.41,.7)
glass=mat('stadium_press_glass',(.075,.25,.32),.17,.2)
yellow=mat('stadium_foul_poles',(.82,.66,.13))
def box(name,xyz,dimensions,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz)
 o=bpy.context.object;o.name=name;o.dimensions=dimensions
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(m)
 return o
def cylinder(name,xyz,radius,depth,m,verts=12):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=xyz)
 o=bpy.context.object;o.name=name;o.data.materials.append(m)
 return o
def between(name,a,b,radius,m):
 a,b=Vector(a),Vector(b);d=b-a
 bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=radius,depth=d.length,location=(a+b)*.5)
 o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
 o.data.materials.append(m)
 return o
# Blender Z-up. Convert existing browser world [x,y,z] to [x,z,-y] for export Y-up,
# GLB accessor ultimately maps [x,z,y] in game convention with Blender exporter.
def place(x,height,z):return (x,-z,height)
box('main outfield grass',place(0,-.15,-50),(250,270,.20),grass)
for i in range(-10,11):
 # cut stripes remain thin enough to avoid z-fighting
 box('mowed grass stripe %d'%i,place(i*11.3,.004,-50),(11.3,270,.013),grass2 if i%2 else grass)
# Dirt diamond as four-vertex mesh in measured world coordinates.
def polygon(name,points,m):
 mesh=bpy.data.meshes.new(name)
 mesh.from_pydata(points,[],[list(range(len(points)))])
 mesh.materials.append(m)
 ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob);return ob
polygon('infield clay', [place(0,.025,1),place(24,.025,-23),place(0,.025,-47),place(-24,.025,-23)],clay)
polygon('infield central turf', [place(0,.045,-4),place(18.6,.045,-23),place(0,.045,-42),place(-18.6,.045,-23)],grass)
for name,x,z in [('home',0,0),('first',23,-23),('second',0,-46),('third',-23,-23)]:
 box(name+' base',place(x,.12,z),(.9,.9,.11),chalk)
cylinder('mound',place(0,.02,-18),2.55,.20,clay,32)
box('pitching rubber',place(0,.18,-18),(.9,.20,.09),chalk)
for sign in [-1,1]:
 between('foul chalk',place(0,.05,0),place(sign*105,.05,-105),.075,chalk)
# Outfield wall, warning track and concrete bowl using accurate stadium-scale arcs.
N=72
def arc(a,r):return r*math.cos(a),-r*math.sin(a)
for i in range(N):
 a=math.pi*.15+i*math.pi*.70/N
 x,z=arc(a,121)
 x2,z2=arc(a+math.pi*.70/N,121)
 between('fence top rail',place(x,6.4,z),place(x2,6.4,z2),.14,steel)
 box('outfield padded wall %d'%i,place(x,3.1,z),(2.8,2.6,6.2),wall)
 for row in range(6):
  sx,sz=arc(a,132+3.25*row)
  h=8.3+row*.92
  box('stadium concrete tier',place(sx,h-.46,sz),(2.9,3.22,.90),concrete)
  box('individual seat bench',place(sx,h+.12,sz),(2.20,.91,.16),seat)
 if i%6==0:
  px,pz=arc(a,128)
  between('fence net post',place(px,6.4,pz),place(px,9.8,pz),.052,steel)
# Dugouts with roofs, railings, built-in benches.
for sign in [-1,1]:
 x=sign*34
 box('dugout structure',place(x,1.20,7),(20,10,2.4),concrete)
 box('dugout roof',place(x,2.80,7),(23,11,.65),wall)
 box('dugout bench',place(x,.82,5),(17,.65,.36),seat)
 for j in range(5):
  between('dugout railing',place(x-9+j*4,1,1.1),place(x-9+j*4,2.1,1.1),.05,steel)
 lx=sign*124
 cylinder('floodlight pole',place(lx,16,-18),.49,32,steel)
 box('stadium floodlight LED rack',place(lx,32,-18),(13,1.2,3.2),steel)
 for k in range(8):
  box('individual floodlight',place(lx-5.6+k*1.6,32.8,-18),(1.2,.18,1.8),chalk)
# Scoreboard and outfield video structure.
box('centerfield scoreboard',place(0,12,-130),(26,2,16),steel)
box('video screen',place(0,12,-128.85),(24,.2,12),glass)
box('scoreboard roof',place(0,21,-130),(28,4,.65),wall)
# Defensive net above plate; posts and frame only, not an opaque block.
for x in range(-12,13,3):
 between('backstop mesh post',place(x,0,14),place(x,9,14),.025,steel)
for height in range(2,10,2):
 between('backstop horizontal wire',place(-12,height,14),place(12,height,14),.017,steel)
out=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..','assets','models','stadium_base.glb'))
os.makedirs(os.path.dirname(out),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_apply=True,export_materials='EXPORT')
print('EXPORTED STADIUM',out)

"""Render Blender GLB review plates. These are REAL Blender renders, not mockups.
Usage: blender -b --python scripts/blender/render_preview.py
Images are visual QA artifacts; they are not a claim of photoreal quality.
"""
import bpy, math, os
from mathutils import Vector

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
ASSETS=os.path.join(ROOT,'assets','models')
PREVIEWS=os.path.join(ROOT,'assets','previews')
os.makedirs(PREVIEWS,exist_ok=True)

def clear():
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.object.delete(use_global=False)
 for obj in list(bpy.data.materials):
  if obj.users==0:bpy.data.materials.remove(obj)

def material(name,color,roughness=.84):
 m=bpy.data.materials.new(name);m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF')
 b.inputs['Base Color'].default_value=(*color,1)
 b.inputs['Roughness'].default_value=roughness
 return m

def area(name,loc,power,size,color):
 bpy.ops.object.light_add(type='AREA', location=loc)
 light=bpy.context.object;light.name=name
 light.data.energy=power;light.data.shape='DISK';light.data.size=size
 light.data.color=color
 light.rotation_euler=(Vector((0,0,1.0))-light.location).to_track_quat('-Z','Y').to_euler()

def camera(pos,target,lens=54):
 bpy.ops.object.camera_add(location=pos)
 cam=bpy.context.object;cam.name='QUALITY_REVIEW_CAMERA'
 cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
 cam.data.type='PERSP';cam.data.lens=lens
 bpy.context.scene.camera=cam

def setup(res_x=1200,res_y=900):
 scene=bpy.context.scene
 scene.render.engine='CYCLES'
 scene.cycles.samples=28
 scene.render.resolution_x=res_x
 scene.render.resolution_y=res_y
 scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG'
 scene.view_settings.view_transform='Standard'
 scene.view_settings.look='Medium High Contrast'
 scene.render.film_transparent=False
 scene.world.color=(.17,.2,.25)

def export_preview(source,output,mode):
 clear()
 bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS,source))
 if mode=='player':
  # Neutral presentation environment. The stage is NOT exported to the playable GLB.
  floor=material('review stage',(.17,.205,.24))
  bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025))
  bpy.context.object.name='REVIEW_ONLY_FLOOR'
  bpy.context.object.data.materials.append(floor)
  area('key',(1.7,-2.5,4.5),450,3.2,(1,.92,.80))
  area('fill',(-2.2,-1,2.9),210,3.2,(.72,.82,1))
  area('rim',(1.4,2.4,3.6),560,2.0,(.92,.97,1))
  camera((2.6,-3.8,1.79),(0,0,1.04),52)
  setup(1000,1200)
 else:
  # Broad aerial review of the full-scale model.
  area('stadium sky key',(20,-20,150),60000,200,(1,.97,.89))
  area('stadium fill',(-80,60,120),27000,160,(.78,.85,1))
  camera((105,-140,91),(0,46,0),38)
  setup(1400,900)
  bpy.context.scene.cycles.samples=12
 bpy.context.scene.render.filepath=os.path.join(PREVIEWS,output)
 bpy.ops.render.render(write_still=True)
 assert os.path.getsize(bpy.context.scene.render.filepath)>10000
 print('REVIEW_RENDER:',bpy.context.scene.render.filepath)

export_preview('player_base.glb','player-review.png','player')
export_preview('stadium_base.glb','stadium-review.png','stadium')

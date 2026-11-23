"""Sand3D prototype. Run with Blender --background --python this_file.

Geometry is in metres, face in XY, front +Z before glTF axis conversion.
Nominal 112 mm bezel is a working proportion, not a measured factory dimension.
"""
from pathlib import Path
import sys, math, json
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'node_modules/.sand3d-tools'))
import bpy
import sand3d as s
from mathutils import Vector

OUT=ROOT/'public/models/cabin-prototype'
REPORT=ROOT/'reports/cabin-prototype'
OUT.mkdir(parents=True,exist_ok=True); REPORT.mkdir(parents=True,exist_ok=True)
s.empty_scene(); s.units('m')
def rev(name,pts,kind,color,rough=.5,metal=None):
    ob=s.revolve(name,[(r/1000,z/1000) for r,z in pts])
    s.material(ob,kind,color=color,roughness=rough,**({'metallic':metal} if metal is not None else {}))
    return ob
body=rev('speedometer_body',[(0,-42),(47,-42),(49,-39),(49,-3),(51,-2),(51,0),(46,0),(46,-39),(0,-39)],'painted_metal','#343a37',.7)
gasket=rev('mounting_gasket',[(48,-1),(55,-1),(55,1),(48,1)],'rubber','#191c19',.95)
bezel=rev('rolled_bezel',[(48,0),(54,0),(55.5,1),(56,2.5),(55.7,4.5),(54.4,6),(51.2,6.4),(49.3,5.4),(48,3.5)],'steel','#959b91',.37,.65)
inner=rev('inner_shadow_ring',[(45.7,-2),(48.5,-2),(49.5,3.8),(48.2,4.3),(46.8,0)],'painted_metal','#262b27',.65)
dial=s.at(s.cylinder('dial',.092,.00065),z=-.002)
s.material(dial,'painted_metal',color='#ffffff',roughness=.92)
needle=s.extrude('speed_needle',s.poly([(-.0013,-.010),(.0013,-.010),(.00105,.028),(0,.039),(-.00105,.028)]),.00065)
s.at(needle,z=.0004)
s.material(needle,'painted_metal',color='#c8b99a',roughness=.7)
needle.rotation_euler.z=math.radians(135)
hub=rev('needle_hub',[(0,.000),(4.2,0),(4.2,1.2),(3.4,2),(0,2)],'plastic','#252925',.65)
hub.location.z=.001
# Subtle glass: thin disk, transparent material; no thick refractive lens.
glass=s.at(s.cylinder('glass',.097,.00035),z=.0037)
s.material(glass,'glass',color='#dce8de',roughness=.16,opacity=.055)
parts=[body,gasket,bezel,inner,dial,needle,hub,glass]
root=s.assembly('uaz_speedometer',*parts)
root.root['nominal_bezel_diameter_m']=.112
root.root['scale_kmh_max']=120
root.root['reference']='User photographs; approximate dimensions, original dial artwork.'
# Blender supplies UVs and the authored raster face after Sand3D builds the parts.
dm=bpy.data.materials.new('dial_print'); dm.use_nodes=True
bs=dm.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value=.9
tex=dm.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(OUT/'speedometer-dial.png')); tex.interpolation='Closest'
dm.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
dial.data.materials.clear(); dial.data.materials.append(dm)
uv=dial.data.uv_layers.active or dial.data.uv_layers.new(name='UVMap')
for poly in dial.data.polygons:
    for li in poly.loop_indices:
        v=dial.data.vertices[dial.data.loops[li].vertex_index].co
        uv.data[li].uv=(v.x/.092+.5,v.y/.092+.5)
# Alpha glass is intentionally light enough for a low-resolution game camera.
gm=bpy.data.materials.new('glass_clear'); gm.use_nodes=True
gb=gm.node_tree.nodes.get('Principled BSDF'); gb.inputs['Base Color'].default_value=(.65,.76,.69,1); gb.inputs['Alpha'].default_value=.045; gb.inputs['Roughness'].default_value=.18
gm.surface_render_method='DITHERED'
glass.data.materials.clear(); glass.data.materials.append(gm)
for ob in parts:
    if ob not in (dial,needle):
        for p in ob.data.polygons: p.use_smooth=True
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for ob in [root.root,*parts]: ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'uaz-speedometer.glb'),export_format='GLB',use_selection=True,export_extras=True)
triangles=0
for ob in parts:
    ob.data.calc_loop_triangles(); triangles+=len(ob.data.loop_triangles)
(REPORT/'model-stats.json').write_text(json.dumps({'triangles':triangles,'mesh_objects':len(parts),'sand3d':s.__version__,'blender':bpy.app.version_string,'diameter_mm':112},indent=2))
# Separate studio scene; these lights and camera are not exported into the asset.
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=32
scene.render.resolution_x=1200; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Studio'); scene.world.color=(.18,.18,.18)
scene.view_settings.view_transform='AgX'
def aim(ob,target): ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
def light(name,loc,power,size):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    ob=bpy.data.objects.new(name,data); scene.collection.objects.link(ob); ob.location=loc; aim(ob,(0,0,0))
light('large_softbox',(-.12,.16,.22),2,.18)
light('rim_light',(.14,-.02,.09),1,.12)
camdata=bpy.data.cameras.new('Camera'); cam=bpy.data.objects.new('Camera',camdata); scene.collection.objects.link(cam); scene.camera=cam
camdata.type='ORTHO'; camdata.ortho_scale=.152
cam.location=(.065,-.035,.24); aim(cam,(0,0,-.008))
needle.rotation_euler.z=math.radians(135-270*42/120)
bpy.ops.wm.save_as_mainfile(filepath=str(REPORT/'speedometer.blend'))
scene.render.filepath=str(REPORT/'speedometer-perspective.png'); bpy.ops.render.render(write_still=True)
cam.location=(0,0,.25); aim(cam,(0,0,0)); scene.render.filepath=str(REPORT/'speedometer-front.png'); bpy.ops.render.render(write_still=True)
print('SPEEDOMETER_COMPLETE',triangles)

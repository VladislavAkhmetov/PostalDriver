"""Game derivative of the preserved Sand3D design; no archive files are modified.
Python + Pillow. Writes a self-contained glTF binary, in metres, face +Z / up +Y.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import math, struct, json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'public/models/cabin-game'
OUT.mkdir(parents=True, exist_ok=True)
atlas = Image.new('RGB', (256,256), '#222720')
dial = Image.open(ROOT/'public/models/cabin-prototype/speedometer-dial.png').convert('RGB')
atlas.paste(dial.resize((224,224), Image.Resampling.LANCZOS),(0,0))
draw = ImageDraw.Draw(atlas)
colors = ['#20261f','#777d70','#b3b5a0','#6c7367','#262e25','#c8b99a']
for i,c in enumerate(colors): draw.rectangle((i*40,232,i*40+31,255), fill=c)
atlas.save(OUT/'speedometer-atlas.png')

N=24
def palette(i): return ((i*40+16)/256, 244/256)
def point(r,z,j):
    a=2*math.pi*j/N
    return (r*math.cos(a),r*math.sin(a),z)
def normal(a,b,c):
    u=[b[i]-a[i] for i in range(3)]; v=[c[i]-a[i] for i in range(3)]
    n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
    l=math.sqrt(sum(x*x for x in n)); return tuple(x/l for x in n)
class Mesh:
    def __init__(self): self.positions=[]; self.normals=[]; self.uv=[]
    def tri(self,a,b,c,uv):
        self.positions.extend([a,b,c]); self.normals.extend([normal(a,b,c)]*3)
        self.uv.extend(uv if isinstance(uv,list) else [uv]*3)
static=Mesh(); moving=Mesh()
# Five visible bands replace the full hollow body and rolled metal profile.
profile=[(.055,-.001),(.056,.0025),(.0545,.006),(.051,.006),(.0475,.002),(.046,-.0014)]
for k in range(len(profile)-1):
    for j in range(N):
        a=point(*profile[k],j); b=point(*profile[k],j+1)
        c=point(*profile[k+1],j+1); d=point(*profile[k+1],j)
        static.tri(a,b,c,palette(k)); static.tri(a,c,d,palette(k))
def faceuv(p): return ((112+p[0]/.092*224)/256,(112-p[1]/.092*224)/256)
for j in range(N):
    a=(0,0,-.0014); b=point(.046,-.0014,j); c=point(.046,-.0014,j+1)
    static.tri(a,b,c,[faceuv(a),faceuv(b),faceuv(c)])
for j in range(12):
    static.tri((0,0,.0022),point(.0042,.0022,j*2),point(.0042,.0022,(j+1)*2),palette(4))
pts=[(-.0013,-.010,.0005),(.0013,-.010,.0005),(.00105,.028,.0005),(0,.039,.0005),(-.00105,.028,.0005)]
for i in range(1,4): moving.tri(pts[0],pts[i],pts[i+1],palette(5))

binary=bytearray(); views=[]; accessors=[]
def blob(data,target=None):
    while len(binary)%4: binary.append(0)
    view={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
    if target: view['target']=target
    views.append(view); binary.extend(data); return len(views)-1
def attribute(data,kind,bounds=False):
    flat=[v for row in data for v in row]
    idx=blob(struct.pack('<'+'f'*len(flat),*flat),34962)
    a={'bufferView':idx,'componentType':5126,'count':len(data),'type':kind}
    if bounds:
        a['min']=[min(v[i] for v in data) for i in range(3)]
        a['max']=[max(v[i] for v in data) for i in range(3)]
    accessors.append(a); return len(accessors)-1
meshes=[]
for name,m in [('speedometer_static',static),('speed_needle',moving)]:
    meshes.append({'name':name,'primitives':[{'attributes':{'POSITION':attribute(m.positions,'VEC3',True),'NORMAL':attribute(m.normals,'VEC3'),'TEXCOORD_0':attribute(m.uv,'VEC2')},'material':0}]})
imageview=blob((OUT/'speedometer-atlas.png').read_bytes())
angle=math.radians(135)/2
gltf={'asset':{'version':'2.0','generator':'PostalDriver game derivative'},'scene':0,'scenes':[{'nodes':[0]}],
 'nodes':[{'name':'uaz_speedometer_game','children':[1,2],'extras':{'diameter_m':.112,'scale_kmh_max':120}},
 {'name':'speedometer_static','mesh':0},{'name':'speed_needle','mesh':1,'rotation':[0,0,math.sin(angle),math.cos(angle)]}],
 'meshes':meshes,'materials':[{'name':'cabin_instrument_atlas','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1},'doubleSided':False}],
 'textures':[{'source':0,'sampler':0}],'images':[{'bufferView':imageview,'mimeType':'image/png'}],
 'samplers':[{'magFilter':9728,'minFilter':9987,'wrapS':33071,'wrapT':33071}],
 'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors}
js=json.dumps(gltf,separators=(',',':')).encode(); js+=b' '*((-len(js))%4)
binary+=b'\0'*((-len(binary))%4)
glb=struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
(OUT/'uaz-speedometer-game.glb').write_bytes(glb)
stats={'triangles':len(static.positions)//3+len(moving.positions)//3,'meshes':2,'materials':1,'texture_size':[256,256],'transparent_meshes':0,'file_bytes':len(glb)}
(OUT/'model-stats.json').write_text(json.dumps(stats,indent=2))
print(json.dumps(stats))

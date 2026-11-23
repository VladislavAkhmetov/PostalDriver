import json

with open('src/assets/uaz/uaz-hunyuan.glb', 'rb') as f:
    magic = f.read(4)
    version = f.read(4)
    length = f.read(4)
    chunk_len = int.from_bytes(f.read(4), 'little')
    chunk_type = f.read(4)
    data = json.loads(f.read(chunk_len).decode('utf-8'))
    
print('Nodes:')
for i, n in enumerate(data.get('nodes', [])):
    print(f"  [{i}] name={n.get('name')} mesh={n.get('mesh')} translation={n.get('translation')} rotation={n.get('rotation')} scale={n.get('scale')} children={n.get('children')}")
    
print('\nMeshes:')
for i, m in enumerate(data.get('meshes', [])):
    print(f"  [{i}] name={m.get('name')} prims={len(m.get('primitives', []))}")
    for p in m.get('primitives', []):
        print(f"     material={p.get('material')}")

print('\nMaterials:')
for i, mat in enumerate(data.get('materials', [])):
    print(f"  [{i}] name={mat.get('name')} pbr={mat.get('pbrMetallicRoughness')}")

print('\nTextures:')
for i, tex in enumerate(data.get('textures', [])):
    print(f"  [{i}] {tex}")

print('\nImages:')
for i, img in enumerate(data.get('images', [])):
    print(f"  [{i}] {img}")

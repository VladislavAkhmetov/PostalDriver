import json

with open('src/assets/uaz/uaz-hunyuan.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4) # chunk_type
    data = json.loads(f.read(chunk_len).decode('utf-8'))

accessors = data['accessors']
meshes = data['meshes']

for m in meshes:
    name = m['name']
    pos_acc_idx = m['primitives'][0]['attributes']['POSITION']
    acc = accessors[pos_acc_idx]
    print(f"Mesh: {name}")
    print(f"  min: {acc.get('min')}")
    print(f"  max: {acc.get('max')}")

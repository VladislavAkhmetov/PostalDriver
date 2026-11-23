import json

with open('src/assets/uaz/uaz-452.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    data = json.loads(f.read(chunk_len).decode('utf-8'))

accessors = data['accessors']
meshes = data['meshes']

for i, m in enumerate(meshes):
    name = m.get('name', f'mesh_{i}')
    pos_acc_idx = m['primitives'][0]['attributes']['POSITION']
    acc = accessors[pos_acc_idx]
    print(f"Mesh [{i}]: {name}")
    print(f"  min: {acc.get('min')}")
    print(f"  max: {acc.get('max')}")

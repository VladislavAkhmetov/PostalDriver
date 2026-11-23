import json

with open('src/assets/uaz/uaz-452.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4) # chunk_type
    data = json.loads(f.read(chunk_len).decode('utf-8'))

print('Nodes in uaz-452.glb:')
for i, n in enumerate(data.get('nodes', [])):
    print(f"  [{i}] name={n.get('name')} mesh={n.get('mesh')} translation={n.get('translation')} rotation={n.get('rotation')} scale={n.get('scale')} children={n.get('children')}")

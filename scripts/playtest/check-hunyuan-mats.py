import json

with open('src/assets/uaz/uaz-hunyuan.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    data = json.loads(f.read(chunk_len).decode('utf-8'))

for i, n in enumerate(data.get('nodes', [])):
    print(f"Node [{i}] name={n.get('name')}:")
    for k in ['matrix', 'translation', 'rotation', 'scale']:
        if k in n:
            print(f"   {k}: {n[k]}")

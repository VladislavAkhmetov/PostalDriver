import json
import struct

with open('src/assets/uaz/uaz-hunyuan.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    data = json.loads(f.read(chunk_len).decode('utf-8'))
    bin_offset = 12 + 8 + chunk_len + 8
    # Read binary buffer
    f.seek(bin_offset)
    bin_data = f.read()

# Let's inspect mesh primitives and accessors
accessors = data['accessors']
bufferViews = data['bufferViews']
meshes = data['meshes']

for m in meshes:
    if 'Wheel' in m['name']:
        print(f"\n--- Mesh {m['name']} ---")
        # Find position accessor
        p_acc = accessors[m['primitives'][0]['attributes']['POSITION']]
        p_bv = bufferViews[p_acc['bufferView']]
        p_offset = p_bv.get('byteOffset', 0) + p_acc.get('byteOffset', 0)
        p_count = p_acc['count']
        
        # Read first 10 vertices
        xs, ys, zs = [], [], []
        for i in range(p_count):
            x, y, z = struct.unpack_from('<fff', bin_data, p_offset + i * 12)
            xs.append(x)
            ys.append(y)
            zs.append(z)
        print(f"X mean={sum(xs)/len(xs):.3f}, range=[{min(xs):.3f}, {max(xs):.3f}]")
        print(f"Y mean={sum(ys)/len(ys):.3f}, range=[{min(ys):.3f}, {max(ys):.3f}]")
        print(f"Z mean={sum(zs)/len(zs):.3f}, range=[{min(zs):.3f}, {max(zs):.3f}]")

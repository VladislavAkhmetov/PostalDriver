import json
import struct

with open('src/assets/uaz/uaz-hunyuan.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    data = json.loads(f.read(chunk_len).decode('utf-8'))
    bin_offset = 12 + 8 + chunk_len + 8
    f.seek(bin_offset)
    bin_data = f.read()

accessors = data['accessors']
bufferViews = data['bufferViews']
meshes = data['meshes']

# Let's inspect Wheel_FL vertices and UVs
m = [x for x in meshes if x['name'] == 'Wheel_FL'][0]
pos_acc = accessors[m['primitives'][0]['attributes']['POSITION']]
pos_bv = bufferViews[pos_acc['bufferView']]
pos_offset = pos_bv.get('byteOffset', 0) + pos_acc.get('byteOffset', 0)

uv_acc = accessors[m['primitives'][0]['attributes']['TEXCOORD_0']]
uv_bv = bufferViews[uv_acc['bufferView']]
uv_offset = uv_bv.get('byteOffset', 0) + uv_acc.get('byteOffset', 0)

# Check vertices with highest X vs lowest X
verts = []
for i in range(pos_acc['count']):
    x, y, z = struct.unpack_from('<fff', bin_data, pos_offset + i * 12)
    u, v = struct.unpack_from('<ff', bin_data, uv_offset + i * 8)
    verts.append((x, y, z, u, v))

# Sort by X
verts.sort(key=lambda v: v[0])
print("Lowest X (negative X):")
for v in verts[:5]:
    print(f"  x={v[0]:.3f}, y={v[1]:.3f}, z={v[2]:.3f}, uv=({v[3]:.3f}, {v[4]:.3f})")

print("Highest X (positive X):")
for v in verts[-5:]:
    print(f"  x={v[0]:.3f}, y={v[1]:.3f}, z={v[2]:.3f}, uv=({v[3]:.3f}, {v[4]:.3f})")

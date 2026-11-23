from PIL import Image

img = Image.open('scripts/playtest/hunyuan_texture.png')
w, h = img.size

# Let's check bounding boxes of Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR UVs
import json

with open('src/assets/uaz/uaz-hunyuan.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    data = json.loads(f.read(chunk_len).decode('utf-8'))
    bin_offset = 12 + 8 + chunk_len + 8
    f.seek(bin_offset)
    bin_data = f.read()

import struct
accessors = data['accessors']
bufferViews = data['bufferViews']

for m in data['meshes']:
    if 'Wheel' in m['name']:
        uv_acc = accessors[m['primitives'][0]['attributes']['TEXCOORD_0']]
        uv_bv = bufferViews[uv_acc['bufferView']]
        uv_offset = uv_bv.get('byteOffset', 0) + uv_acc.get('byteOffset', 0)
        us, vs = [], []
        for i in range(uv_acc['count']):
            u, v = struct.unpack_from('<ff', bin_data, uv_offset + i * 8)
            us.append(u)
            vs.append(v)
        print(f"{m['name']}: U in [{min(us):.3f}, {max(us):.3f}], V in [{min(vs):.3f}, {max(vs):.3f}]")

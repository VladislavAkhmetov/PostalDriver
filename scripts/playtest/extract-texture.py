import json
from PIL import Image
import io

with open('src/assets/uaz/uaz-hunyuan.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    data = json.loads(f.read(chunk_len).decode('utf-8'))
    bin_offset = 12 + 8 + chunk_len + 8
    f.seek(bin_offset)
    bin_data = f.read()

bv = data['bufferViews'][data['images'][0]['bufferView']]
img_data = bin_data[bv['byteOffset']:bv['byteOffset']+bv['byteLength']]

img = Image.open(io.BytesIO(img_data))
print(f"Texture size: {img.size}")
img.save('scripts/playtest/hunyuan_texture.png')

# In GLTF, v is from top to bottom (or bottom to top depending on flipY)
# Usually GLTF UV (u, v): top-left is (0, 0) in WebGL / Three.js flipY=false
# Let's sample around u=0.15, v=0.73 and u=0.40, v=0.75
w, h = img.size
px1 = img.getpixel((int(0.15 * w), int(0.73 * h)))
px2 = img.getpixel((int(0.15 * w), int((1 - 0.73) * h)))
print(f"Sample at (0.15, 0.73): {px1}, flipY: {px2}")

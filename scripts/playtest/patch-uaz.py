with open('src/world/Uaz.ts', 'r', encoding='utf-8') as f:
    c = f.read()

target = '''    if (p && srcWheel) {
      // Clear old flat low-poly wheel geometry
      p.clear();
      const newWheel = srcWheel.clone(true) as THREE.Mesh;'''

replacement = '''    if (p && srcWheel) {
      // Clear old flat low-poly wheel geometry
      p.clear();
      if ((p as THREE.Mesh).isMesh) {
        (p as THREE.Mesh).geometry.dispose();
        (p as THREE.Mesh).geometry = new THREE.BufferGeometry();
      }
      const newWheel = srcWheel.clone(true) as THREE.Mesh;'''

assert target in c, "Target not found in Uaz.ts"
c = c.replace(target, replacement)

with open('src/world/Uaz.ts', 'w', encoding='utf-8') as f:
    f.write(c)

print('Updated Uaz.ts')

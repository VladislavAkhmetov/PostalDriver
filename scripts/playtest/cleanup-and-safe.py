with open('src/main.ts', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('  (window as any).__scene = scene;\n', '')
c = c.replace('    (window as any).__prologueVan = prologueVan;\n', '')

with open('src/main.ts', 'w', encoding='utf-8') as f:
    f.write(c)

print('Cleaned main.ts')

with open('src/world/Uaz.ts', 'r', encoding='utf-8') as f:
    c = f.read()

target = '''      if ((p as THREE.Mesh).isMesh) {
        (p as THREE.Mesh).geometry.dispose();
        (p as THREE.Mesh).geometry = new THREE.BufferGeometry();
      }'''

replacement = '''      if ((p as THREE.Mesh).isMesh) {
        (p as THREE.Mesh).geometry = new THREE.BufferGeometry();
      }'''

c = c.replace(target, replacement)

with open('src/world/Uaz.ts', 'w', encoding='utf-8') as f:
    f.write(c)

print('Updated Uaz.ts')

with open('src/main.ts', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('  const scene = new THREE.Scene();', '  const scene = new THREE.Scene();\n  (window as any).__scene = scene;')
c = c.replace('    prologueVan = buildUaz(\'post\');', '    prologueVan = buildUaz(\'post\');\n    (window as any).__prologueVan = prologueVan;')

with open('src/main.ts', 'w', encoding='utf-8') as f:
    f.write(c)
print('Updated main.ts')

import trimesh
import numpy as np
from PIL import Image
import json

def build_model(input_path, output_path):
    print(f"Loading {input_path}...")
    mesh = trimesh.load(input_path, force='mesh')

    orig_tex = mesh.visual.material.baseColorTexture
    tw, th = orig_tex.size
    print(f"Original texture size: {tw}x{th}")

    # Scale so length is 4.44 m
    bounds = mesh.bounds
    min_z, max_z = bounds[0, 2], bounds[1, 2]
    k = 4.44 / (max_z - min_z)
    mesh.apply_scale(k)

    # Center X to 0, put Y=0 on bottom (contact patch), center Z
    mesh.vertices[:, 0] -= (mesh.bounds[0, 0] + mesh.bounds[1, 0]) / 2.0
    mesh.vertices[:, 1] -= mesh.bounds[0, 1]
    mesh.vertices[:, 2] -= (mesh.bounds[0, 2] + mesh.bounds[1, 2]) / 2.0

    print("Scaled bounds:\n", mesh.bounds)
    print("Extents:", mesh.extents)

    c = mesh.triangles_center
    n = mesh.face_normals

    # 1. Wheels isolation
    wheel_r = 0.375
    wheel_configs = [
        ('Wheel_FL', np.array([ 0.75, wheel_r,  1.17])),
        ('Wheel_FR', np.array([-0.75, wheel_r,  1.17])),
        ('Wheel_RL', np.array([ 0.75, wheel_r, -1.19])),
        ('Wheel_RR', np.array([-0.75, wheel_r, -1.19]))
    ]

    wheel_masks = {}
    all_wheels_mask = np.zeros(len(mesh.faces), dtype=bool)
    for name, wc in wheel_configs:
        dist_2d = np.hypot(c[:, 1] - wc[1], c[:, 2] - wc[2])
        dist_x = np.abs(c[:, 0] - wc[0])
        mask = (dist_2d < wheel_r * 1.05) & (dist_x < 0.28) & (np.sign(c[:, 0]) == np.sign(wc[0]))
        wheel_masks[name] = mask
        all_wheels_mask |= mask
        print(f" {name}: {np.sum(mask)} faces")

    # 2. Window isolation
    windshield = (c[:, 2] > 1.35) & (c[:, 2] < 2.00) & (c[:, 1] > 1.35) & (c[:, 1] < 1.88) & (n[:, 2] > 0.30) & (n[:, 1] > 0.12) & (np.abs(c[:, 0]) < 0.88)
    front_side = (np.abs(c[:, 0]) > 0.82) & (c[:, 2] > 0.55) & (c[:, 2] < 1.25) & (c[:, 1] > 1.35) & (c[:, 1] < 1.85) & (np.abs(n[:, 0]) > 0.70)
    middle_side = (np.abs(c[:, 0]) > 0.82) & (c[:, 2] > -0.55) & (c[:, 2] < 0.25) & (c[:, 1] > 1.38) & (c[:, 1] < 1.78) & (np.abs(n[:, 0]) > 0.70)
    rear_win = (c[:, 2] < -2.02) & (c[:, 1] > 1.36) & (c[:, 1] < 1.76) & (n[:, 2] < -0.70) & (np.abs(c[:, 0]) > 0.15) & (np.abs(c[:, 0]) < 0.65)

    glass_mask = (windshield | front_side | middle_side | rear_win) & (~all_wheels_mask)
    print(f" Total Glass faces: {np.sum(glass_mask)} (Windshield: {np.sum(windshield)}, FrontSide: {np.sum(front_side)}, MiddleSide: {np.sum(middle_side)}, Rear: {np.sum(rear_win)})")

    # 3. Body faces
    body_mask = (~all_wheels_mask) & (~glass_mask)
    print(f" Total Body faces: {np.sum(body_mask)}")

    # Texture optimization: 2048x2048 Lanczos
    tex_opt = orig_tex.resize((2048, 2048), Image.Resampling.LANCZOS)
    paint_mat = trimesh.visual.material.PBRMaterial(
        name='Paint',
        baseColorTexture=tex_opt,
        metallicFactor=0.15,
        roughnessFactor=0.65,
        doubleSided=True
    )

    def submesh_from_faces(face_mask, material):
        sub_faces = mesh.faces[face_mask]
        unique_v_idx, new_faces = np.unique(sub_faces, return_inverse=True)
        new_vertices = mesh.vertices[unique_v_idx]
        new_uvs = mesh.visual.uv[unique_v_idx]
        new_faces = new_faces.reshape((-1, 3))
        sub = trimesh.Trimesh(vertices=new_vertices, faces=new_faces, process=False)
        sub.visual = trimesh.visual.TextureVisuals(uv=new_uvs, material=material)
        return sub

    body_mesh = submesh_from_faces(body_mask, paint_mat)

    # Glass submesh
    glass_mat = trimesh.visual.material.PBRMaterial(
        name='Glass',
        baseColorFactor=[0.18, 0.28, 0.35, 0.55],
        metallicFactor=0.20,
        roughnessFactor=0.10,
        alphaMode='BLEND',
        doubleSided=True
    )
    glass_mesh = submesh_from_faces(glass_mask, glass_mat)

    # 4. Build Detailed Interior Geometry
    print("Building detailed low-poly interior...")
    interior_parts = []

    def add_box(extents, pos, color, rot_axis=None, rot_deg=0):
        b = trimesh.creation.box(extents=extents)
        if rot_axis is not None and rot_deg != 0:
            R = trimesh.transformations.rotation_matrix(np.radians(rot_deg), rot_axis, point=[0, 0, 0])
            b.apply_transform(R)
        b.apply_translation(pos)
        b.visual.vertex_colors = np.tile(color, (len(b.vertices), 1))
        interior_parts.append(b)

    def add_cyl(radius, height, pos, color, rot_axis=None, rot_deg=0):
        c = trimesh.creation.cylinder(radius=radius, height=height, sections=16)
        if rot_axis is not None and rot_deg != 0:
            R = trimesh.transformations.rotation_matrix(np.radians(rot_deg), rot_axis)
            c.apply_transform(R)
        c.apply_translation(pos)
        c.visual.vertex_colors = np.tile(color, (len(c.vertices), 1))
        interior_parts.append(c)

    c_floor = [22, 22, 24, 255]
    c_ceiling = [20, 20, 22, 255]
    c_bulkhead = [28, 36, 42, 255]
    c_dash = [38, 44, 48, 255]
    c_engine = [34, 34, 36, 255]
    c_seat = [28, 28, 30, 255]
    c_wheel = [16, 16, 16, 255]
    c_lever = [24, 24, 24, 255]
    c_mirror = [60, 68, 75, 255]

    # Floor & Ceiling
    add_box([1.80, 0.04, 3.90], [0, 0.56, -0.15], c_floor)
    add_box([1.75, 0.04, 3.75], [0, 2.05, -0.15], c_ceiling)

    # Bulkhead partition
    add_box([1.76, 0.72, 0.04], [0, 0.92, 0.35], c_bulkhead)

    # Engine doghouse hump
    add_box([0.44, 0.34, 0.95], [0, 0.73, 0.88], c_engine)

    # Dashboard & Instrument binnacle
    add_box([1.70, 0.22, 0.32], [0, 1.10, 1.50], c_dash)
    add_box([0.38, 0.12, 0.14], [-0.52, 1.23, 1.48], [44, 52, 58, 255])

    # Steering Wheel (Driver side X = -0.52)
    add_cyl(0.026, 0.42, [-0.52, 0.92, 1.24], c_wheel, rot_axis=[1, 0, 0], rot_deg=-45)
    t_rim = trimesh.creation.torus(major_radius=0.21, minor_radius=0.016, major_sections=24, minor_sections=8)
    R_rim = trimesh.transformations.rotation_matrix(np.radians(-45), [1, 0, 0])
    t_rim.apply_transform(R_rim)
    t_rim.apply_translation([-0.52, 1.07, 1.09])
    t_rim.visual.vertex_colors = np.tile(c_wheel, (len(t_rim.vertices), 1))
    interior_parts.append(t_rim)
    add_cyl(0.045, 0.03, [-0.52, 1.07, 1.09], c_wheel, rot_axis=[1, 0, 0], rot_deg=-45)

    # Seats (Driver & Passenger)
    for sx in [-0.55, 0.55]:
        add_box([0.44, 0.18, 0.44], [sx, 0.68, 0.65], c_seat)
        add_box([0.42, 0.54, 0.12], [sx, 1.02, 0.44], c_seat, rot_axis=[1, 0, 0], rot_deg=-12)
        add_box([0.24, 0.16, 0.10], [sx, 1.34, 0.38], c_seat)

    # Floor levers
    add_cyl(0.012, 0.32, [-0.28, 0.82, 0.95], c_lever, rot_axis=[1, 0, 0], rot_deg=10)
    add_cyl(0.012, 0.24, [-0.28, 0.78, 1.08], c_lever, rot_axis=[1, 0, 0], rot_deg=15)

    # Interior rearview mirror
    add_box([0.18, 0.07, 0.03], [0, 1.84, 1.60], c_mirror)
    add_cyl(0.01, 0.08, [0, 1.90, 1.63], c_lever, rot_axis=[1, 0, 0], rot_deg=-30)

    interior_mesh = trimesh.util.concatenate(interior_parts)
    print(f" Interior complete: {len(interior_mesh.vertices)} vertices, {len(interior_mesh.faces)} faces")

    # 5. Assemble Scene (Separate Body and Interior nodes so Body retains texture!)
    scene = trimesh.Scene()
    scene.add_geometry(body_mesh, node_name='Body', geom_name='Body')
    scene.add_geometry(interior_mesh, node_name='Interior', geom_name='Interior')
    scene.add_geometry(glass_mesh, node_name='Glass', geom_name='Glass')

    for name, wc in wheel_configs:
        w_sub = submesh_from_faces(wheel_masks[name], paint_mat)
        w_sub.vertices -= wc
        T = trimesh.transformations.translation_matrix(wc)
        scene.add_geometry(w_sub, node_name=name, geom_name=name, transform=T)

    print(f"Exporting to {output_path}...")
    glb_data = scene.export(file_type='glb')

    # Post-process GLB JSON
    chunk0Len = int.from_bytes(glb_data[12:16], 'little')
    gltf_json = json.loads(glb_data[20:20+chunk0Len].decode('utf-8'))

    # Inject extras into wheel nodes
    for node in gltf_json.get('nodes', []):
        node_name = node.get('name', '')
        if node_name.startswith('Wheel_'):
            node['extras'] = { 'radius': wheel_r }

    # Ensure Glass material has BLEND and proper baseColorFactor
    for mat in gltf_json.get('materials', []):
        if mat.get('name') == 'Glass':
            mat['alphaMode'] = 'BLEND'
            mat['doubleSided'] = True
            mat['pbrMetallicRoughness']['baseColorFactor'] = [0.18, 0.28, 0.35, 0.55]
            mat['pbrMetallicRoughness']['roughnessFactor'] = 0.10
            mat['pbrMetallicRoughness']['metallicFactor'] = 0.20

    new_json_bytes = json.dumps(gltf_json, separators=(',', ':')).encode('utf-8')
    pad = (4 - (len(new_json_bytes) % 4)) % 4
    new_json_bytes += b' ' * pad

    bin_chunk_start = 20 + chunk0Len
    bin_chunk = glb_data[bin_chunk_start:]

    new_total_len = 12 + 8 + len(new_json_bytes) + len(bin_chunk)
    header = bytearray(glb_data[:12])
    header[8:12] = new_total_len.to_bytes(4, 'little')

    chunk0_hdr = len(new_json_bytes).to_bytes(4, 'little') + glb_data[16:20]
    final_glb = bytes(header) + chunk0_hdr + new_json_bytes + bin_chunk

    with open(output_path, 'wb') as f:
        f.write(final_glb)

    print(f"Done! Final model written to {output_path} ({len(final_glb)} bytes)")

if __name__ == '__main__':
    inp = 'c:/Users/amazi/Downloads/2170cc7791843c3daf26d60b1cf5e9d6.glb'
    out = 'src/assets/uaz/uaz-hunyuan.glb'
    build_model(inp, out)

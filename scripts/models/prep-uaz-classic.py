import trimesh
import numpy as np
import json
import os

def build_classic_with_interior():
    src_path = 'src/assets/uaz/uaz-452.glb'
    out_path = 'src/assets/uaz/uaz-452-interior.glb'
    print(f"Loading {src_path}...")
    s = trimesh.load(src_path)

    # 1. Identify window faces in GLTF and GLTF_4 (the two body halves)
    # Both have 268 faces, exactly 15 window faces each.
    # In GLTF: [23, 24, 25, 26, 27, 28, 29, 30, 39, 40, 59, 60, 73, 82, 83]
    # In GLTF_4: [23, 24, 25, 26, 27, 28, 29, 30, 39, 40, 59, 60, 72, 82, 83]
    
    window_faces_map = {
        'GLTF': [23, 24, 25, 26, 27, 28, 29, 30, 39, 40, 59, 60, 73, 82, 83],
        'GLTF_4': [23, 24, 25, 26, 27, 28, 29, 30, 39, 40, 59, 60, 72, 82, 83]
    }

    # Materials
    # Glass: light, reflective, non-tinted/light-tinted 90s automotive glass
    glass_mat = trimesh.visual.material.PBRMaterial(
        name='Glass',
        baseColorFactor=[0.82, 0.90, 0.92, 0.30], # Light cyan-grey, very transparent (70% transparent)
        metallicFactor=0.15,
        roughnessFactor=0.06, # High gloss, sharp reflections
        alphaMode='BLEND',
        doubleSided=True
    )

    glass_submeshes = []

    # Update body geometries: remove window faces and create glass submesh
    for geom_name, win_idx in window_faces_map.items():
        g = s.geometry[geom_name]
        all_faces = np.arange(len(g.faces))
        win_mask = np.isin(all_faces, win_idx)
        body_mask = ~win_mask

        # Glass submesh from this half
        win_faces = g.faces[win_mask]
        uniq_v, new_f = np.unique(win_faces, return_inverse=True)
        glass_sub = trimesh.Trimesh(
            vertices=g.vertices[uniq_v],
            faces=new_f.reshape((-1, 3)),
            process=False
        )
        if hasattr(g.visual, 'uv') and g.visual.uv is not None:
            glass_sub.visual = trimesh.visual.TextureVisuals(uv=g.visual.uv[uniq_v], material=glass_mat)
        else:
            glass_sub.visual.material = glass_mat
        glass_submeshes.append(glass_sub)

        # Body submesh (remaining faces)
        b_faces = g.faces[body_mask]
        uniq_vb, new_fb = np.unique(b_faces, return_inverse=True)
        g.vertices = g.vertices[uniq_vb]
        g.faces = new_fb.reshape((-1, 3))
        if hasattr(g.visual, 'uv') and g.visual.uv is not None:
            g.visual.uv = g.visual.uv[uniq_vb]

    # Combine all window faces into single Glass geometry
    combined_glass = trimesh.util.concatenate(glass_submeshes)
    combined_glass.visual = trimesh.visual.TextureVisuals(material=glass_mat)
    
    # Add Glass node under the body node offset [0, 1.3788836, 0]
    T_body = trimesh.transformations.translation_matrix([0, 1.3788836, 0])
    s.add_geometry(combined_glass, node_name='Glass', geom_name='Glass', transform=T_body)

    # 2. Build Authentic 90s Grandpa Cabin Interior (Салон)
    # Coordinates in body local space (before T_body offset):
    # Driver is at X = -0.45 (LEFT side in uaz-452 coordinates)
    # Passenger is at X = +0.45 (RIGHT side)
    # Front is -Z, Rear is +Z
    print("Building 1990s rural post UAZ interior...")
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

    # Authentic 90s color palette:
    c_floor = [28, 28, 30, 255]         # Dark rubber floor mat
    c_ceiling = [24, 25, 26, 255]       # Dark headliner
    c_bulkhead = [34, 42, 48, 255]      # Cabin partition
    c_dash = [48, 54, 58, 255]          # Stamped enamel dashboard
    c_cluster = [36, 40, 44, 255]       # Speedometer gauge cluster pod
    c_engine = [38, 36, 35, 255]        # Insulated quilted engine cover
    c_seat = [48, 42, 38, 255]          # Vintage brown/charcoal leatherette
    c_wheel = [18, 18, 18, 255]         # Bakelite thin wheel
    c_lever = [26, 26, 26, 255]         # Floor gear shift levers
    c_mirror = [70, 78, 85, 255]        # Interior mirror

    # 1. Floor plate
    add_box([1.76, 0.04, 3.85], [0, -0.72, -0.20], c_floor)

    # 2. Interior ceiling
    add_box([1.72, 0.04, 3.70], [0, 0.58, -0.20], c_ceiling)

    # 3. Partition wall behind front seats
    add_box([1.74, 0.72, 0.04], [0, -0.36, -0.75], c_bulkhead)

    # 4. Engine doghouse hump between front seats
    add_box([0.44, 0.38, 0.95], [0, -0.53, -1.40], c_engine)

    # 5. Dashboard across the front under windshield
    add_box([1.68, 0.20, 0.28], [0, -0.16, -1.95], c_dash)
    # Speedometer instrument cluster in front of driver (X = -0.45)
    add_box([0.34, 0.12, 0.12], [-0.45, -0.04, -1.90], c_cluster)

    # 6. Driver & Passenger Seats
    # Driver at X = -0.45, Passenger at X = +0.45
    for sx in [-0.45, 0.45]:
        # Cushion
        add_box([0.42, 0.16, 0.42], [sx, -0.48, -1.30], c_seat)
        # Backrest (slanted back 12 deg)
        add_box([0.40, 0.50, 0.10], [sx, -0.15, -1.06], c_seat, rot_axis=[1, 0, 0], rot_deg=12)
        # Headrest
        add_box([0.22, 0.15, 0.08], [sx, 0.15, -1.00], c_seat)

    # 7. Steering Wheel on Driver side (X = -0.45)
    # Steering column rising from floor
    add_cyl(0.024, 0.44, [-0.45, -0.24, -1.74], c_wheel, rot_axis=[1, 0, 0], rot_deg=45)
    # 3-spoke thin bakelite wheel (torus)
    t_rim = trimesh.creation.torus(major_radius=0.20, minor_radius=0.014, major_sections=24, minor_sections=8)
    R_rim = trimesh.transformations.rotation_matrix(np.radians(45), [1, 0, 0])
    t_rim.apply_transform(R_rim)
    t_rim.apply_translation([-0.45, -0.09, -1.58])
    t_rim.visual.vertex_colors = np.tile(c_wheel, (len(t_rim.vertices), 1))
    interior_parts.append(t_rim)
    # Center hub cap
    add_cyl(0.042, 0.025, [-0.45, -0.09, -1.58], c_wheel, rot_axis=[1, 0, 0], rot_deg=45)

    # 8. Floor gear shift & 4WD transfer levers next to engine hump
    add_cyl(0.012, 0.32, [-0.26, -0.36, -1.45], c_lever, rot_axis=[1, 0, 0], rot_deg=-10)
    add_cyl(0.012, 0.24, [-0.26, -0.40, -1.32], c_lever, rot_axis=[1, 0, 0], rot_deg=-15)

    # 9. Interior rearview mirror
    add_box([0.18, 0.06, 0.02], [0, 0.36, -1.86], c_mirror)
    add_cyl(0.008, 0.08, [0, 0.42, -1.88], c_lever, rot_axis=[1, 0, 0], rot_deg=30)

    interior_mesh = trimesh.util.concatenate(interior_parts)
    interior_mat = trimesh.visual.material.PBRMaterial(
        name='Interior',
        baseColorFactor=[1.0, 1.0, 1.0, 1.0],
        metallicFactor=0.05,
        roughnessFactor=0.85,
        doubleSided=True
    )
    interior_mesh.visual.material = interior_mat
    print(f" Interior complete: {len(interior_mesh.vertices)} vertices, {len(interior_mesh.faces)} faces")

    # Add Interior node under T_body offset
    s.add_geometry(interior_mesh, node_name='Interior', geom_name='Interior', transform=T_body)

    print(f"Exporting upgraded classic model to {out_path}...")
    glb_data = s.export(file_type='glb')

    # Post-process GLB JSON for alphaMode and transparent glass
    chunk0Len = int.from_bytes(glb_data[12:16], 'little')
    gltf_json = json.loads(glb_data[20:20+chunk0Len].decode('utf-8'))

    for mat in gltf_json.get('materials', []):
        if mat.get('name') == 'Glass':
            mat['alphaMode'] = 'BLEND'
            mat['doubleSided'] = True
            mat['pbrMetallicRoughness']['baseColorFactor'] = [0.80, 0.90, 0.92, 0.28] # light tint, 72% transparent
            mat['pbrMetallicRoughness']['roughnessFactor'] = 0.06
            mat['pbrMetallicRoughness']['metallicFactor'] = 0.15

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

    with open(out_path, 'wb') as f:
        f.write(final_glb)

    print(f"Done! Written {out_path} ({len(final_glb)} bytes)")

if __name__ == '__main__':
    build_classic_with_interior()

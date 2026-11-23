from PIL import Image
import numpy as np

def generate_uaz_alpha_texture():
    src_path = 'src/assets/uaz/UazPost.png'
    out_path = 'src/assets/uaz/UazPostAlpha.png'
    img = Image.open(src_path).convert('RGBA')
    arr = np.array(img)
    h, w, _ = arr.shape

    # Exact window bounding boxes in UazPost.png
    window_boxes = [
        (14, 8, 65, 33),      # Windshield
        (74, 22, 108, 39),    # Rear door windows
        (128, 68, 155, 96),   # Side cargo window
        (218, 165, 250, 193), # Front side cab door window
        (28, 165, 52, 192),   # Side cargo panel window
    ]

    total_glass_count = 0
    for x0, y0, x1, y1 in window_boxes:
        sub = arr[y0:y1+1, x0:x1+1]
        
        # Detect glass pixels
        is_blue_tint = (sub[:, :, 2].astype(int) > sub[:, :, 0].astype(int) + 8) & (sub[:, :, 1] > 45) & (sub[:, :, 2] > 60)
        is_not_white = ~( (sub[:, :, 0] > 175) & (sub[:, :, 1] > 175) & (sub[:, :, 2] > 175) )
        is_not_black = ~( (sub[:, :, 0] < 42) & (sub[:, :, 1] < 42) & (sub[:, :, 2] < 42) )
        is_glass = is_blue_tint & is_not_white & is_not_black

        count = np.sum(is_glass)
        total_glass_count += count

        # Set alpha to 45 (~18% opacity: very light, 82% transparent, authentic grandfather glass)
        sub[is_glass, 3] = 45

        # Light, clear float glass tint with subtle cyan sky reflection:
        sub[is_glass, 0] = 135
        sub[is_glass, 1] = 168
        sub[is_glass, 2] = 180

        arr[y0:y1+1, x0:x1+1] = sub

    res = Image.fromarray(arr)
    res.save(out_path)
    print(f"Generated {out_path} with {total_glass_count} transparent window pixels!")

if __name__ == '__main__':
    generate_uaz_alpha_texture()

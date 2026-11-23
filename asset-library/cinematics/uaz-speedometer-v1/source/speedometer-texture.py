"""Draw an original, photo-informed dial; no photo pixels are used."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math, random

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/cabin-prototype'
OUT.mkdir(parents=True, exist_ok=True)
N = 1024
im = Image.new('RGB', (N, N))
rng = random.Random(452)
pix = im.load()
for y in range(N):
    for x in range(N):
        d = math.hypot(x-512, y-512)/512
        v = int(25-6*d+rng.uniform(-2,2))
        pix[x,y] = (v, v+2, v+1)
g = ImageDraw.Draw(im)
ink = (205, 202, 179)
font = 'C:/Windows/Fonts/arial.ttf'
def text(x,y,s,size,fill=ink):
    g.text((x,y),s,font=ImageFont.truetype(font,size),fill=fill,anchor='mm',stroke_width=0)
def pt(a,r):
    a=math.radians(a)
    return (512+math.cos(a)*r,512-math.sin(a)*r)
for k in range(61):
    a=225-k*4.5
    major=k%10==0
    medium=k%5==0
    g.line([pt(a,439),pt(a,393 if major else 409 if medium else 422)],fill=ink,width=5 if major else 3)
    if major:
        x,y=pt(a,348)
        text(x,y,str(k*2),61)
text(512,390,'км/ч',33)
# Recessed mechanical odometer, six individual rollers. Display is illustrative.
g.rounded_rectangle((327,589,697,666),radius=5,fill=(7,9,8),outline=(95,94,82),width=3)
for i,c in enumerate('047218'):
    x=337+i*59
    g.rectangle((x,597,x+50,657),fill=(33,34,29))
    text(x+25,628,c,47,(199,195,169))
text(512,723,'СДЕЛАНО В СССР',18,(140,144,128))
text(512,756,'120',17,(118,122,109))
# Very restrained wear, kept away from the scale lettering.
for _ in range(170):
    a=rng.uniform(0,360); r=rng.uniform(455,490)
    x,y=pt(a,r)
    g.line((x,y,x+rng.uniform(-4,4),y+rng.uniform(-1,1)),fill=(73,74,63),width=1)
im.resize((512,512),Image.Resampling.LANCZOS).save(OUT/'speedometer-dial.png')
print(OUT/'speedometer-dial.png')

from pathlib import Path
from PIL import Image,ImageDraw
import sys,math
root=Path(__file__).resolve().parents[1]/'docs/phases_archive/environment-2026-09-17'
folder=root/sys.argv[1]
pattern=sys.argv[2] if len(sys.argv)>2 else 'planet-*.png'
files=sorted(folder.glob(pattern));cols=4;w=380;h=220
sheet=Image.new('RGB',(cols*w,math.ceil(len(files)/cols)*h),(8,13,18));draw=ImageDraw.Draw(sheet)
for i,p in enumerate(files):
    img=Image.open(p).convert('RGB');img.thumbnail((w,h-20));x=i%cols*w;y=i//cols*h
    sheet.paste(img,(x+(w-img.width)//2,y+20));draw.text((x+10,y+3),p.stem,fill=(210,190,155))
target=root/(sys.argv[1].replace('/','-')+'-'+pattern.split('*')[0].strip('-')+'-sheet.jpg');sheet.save(target,quality=90)
print(target)

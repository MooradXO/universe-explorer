from pathlib import Path
from PIL import Image
import json,hashlib
root=Path('public/assets/ui/titan-v1')
sources=json.loads(Path('docs/art-direction/hud-redesign-2026-09-18/production-sources.json').read_text(encoding='utf-8'))
report=[]
for row in sources:
 p=root/(row['id']+'.png'); im=Image.open(p); data=p.read_bytes()
 alpha=im.getchannel('A'); h=hashlib.sha256(data).hexdigest()
 original=Path(row['original']).read_bytes()
 assert data==original, p
 assert im.mode=='RGBA' and alpha.getextrema()==(0,255), p
 report.append(dict(id=row['id'],size=im.size,bytes=len(data),sha256=h,originalIdentical=True,alphaExtrema=alpha.getextrema()))
Path('docs/art-direction/hud-redesign-2026-09-18/production-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(dict(count=len(report),totalBytes=sum(r['bytes'] for r in report),allOriginalAndRGBA=True)))

"""Reproducible technical asset conversion. Original generated PNGs are retained."""
from pathlib import Path
import hashlib, json, urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/assets/environments'
SOLAR = {
    'earth': '2k_earth_daymap.jpg', 'mercury': '2k_mercury.jpg',
    'venus': '2k_venus_atmosphere.jpg', 'mars': '2k_mars.jpg',
    'jupiter': '2k_jupiter.jpg', 'saturn': '2k_saturn.jpg',
    'uranus': '2k_uranus.jpg', 'neptune': '2k_neptune.jpg', 'moon': '2k_moon.jpg',
}
records = []
for name, filename in SOLAR.items():
    source = DEST / 'source' / filename
    source.parent.mkdir(parents=True, exist_ok=True)
    url = 'https://www.solarsystemscope.com/textures/download/' + filename
    if not source.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            source.write_bytes(response.read())
    records.append({'name': name, 'source': str(source.relative_to(DEST)), 'url': url,
                    'creator': 'Solar System Scope', 'license': 'CC BY 4.0',
                    'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
                    'changes': 'Resized and encoded as WebP; color map used in cinematic lighting.'})
for name in ['regolith', 'ice', 'mineral', 'clouds']:
    records.append({'name': name, 'source': f'generated/{name}.png', 'creator': 'OpenAI image generation for Universe Explorer',
                    'changes': 'Technical resize and WebP encoding; originals retained. Procedural triplanar sampling.'})
for record in records:
    source = DEST / record['source']
    record['sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    with Image.open(source) as original:
        # Composite the cloud density source against black if it has an alpha channel.
        img = Image.new('RGB', original.size, (0, 0, 0))
        img.paste(original, mask=original.getchannel('A') if original.mode == 'RGBA' else None)
        for label, width in [('high', 2048), ('low', 512)]:
            target = DEST / label / (record['name'] + '.webp')
            target.parent.mkdir(exist_ok=True)
            img.resize((width, width // 2), Image.Resampling.LANCZOS).save(target, quality=86 if label == 'high' else 78, method=6)
(DEST / 'provenance.json').write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'assets': len(records), 'runtimeBytes': sum(p.stat().st_size for p in DEST.glob('*/*.webp'))}))

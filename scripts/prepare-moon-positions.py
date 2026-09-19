from pathlib import Path
import urllib.request, urllib.parse, json
ROOT = Path(__file__).resolve().parents[1]
# JPL Satellite Physical Parameters, accessed 2026-09-17. Mean radii in km.
MOONS = [('earth',301,'Луна',1737.4,0),('mars',401,'Фобос',11.08,15),('mars',402,'Деймос',6.2,15),
 ('jupiter',501,'Ио',1821.49,9),('jupiter',502,'Европа',1560.8,3),('jupiter',503,'Ганимед',2631.2,6),('jupiter',504,'Каллисто',2410.3,0),
 ('saturn',602,'Энцелад',252.1,4),('saturn',606,'Титан',2574.76,12),('uranus',703,'Титания',788.9,6),('neptune',801,'Тритон',1352.6,5)]
out=[]
cache=ROOT/'docs/research/moon-source';cache.mkdir(parents=True,exist_ok=True)
for parent,code,name,radius,style in MOONS:
    params={'format':'json','COMMAND':str(code),'CENTER':f'500@{code//100}99','EPHEM_TYPE':'VECTORS','TLIST':'2451545.0',
            'REF_PLANE':'FRAME','REF_SYSTEM':'ICRF','OUT_UNITS':'KM-S','VEC_TABLE':'2','CSV_FORMAT':'YES','VEC_CORR':'NONE'}
    url='https://ssd.jpl.nasa.gov/api/horizons.api?'+urllib.parse.urlencode(params)
    path=cache/f'{code}.json'
    if not path.exists():
        with urllib.request.urlopen(url,timeout=60) as response:path.write_bytes(response.read())
    data=json.loads(path.read_text())
    if 'error' in data:raise RuntimeError(data['error'])
    row=data['result'].split('$$SOE')[1].split('$$EOE')[0].strip().split(',')
    x,y,z=map(float,row[2:5])
    out.append({'parent':'sol/'+parent,'id':str(code),'name':name,'radius':radius/10,'position':[x/10,z/10,-y/10],'style':style})
target=ROOT/'src/world/environments/SolarMoonData.ts'
target.write_text('/** Fixed J2000 TDB geocentric/planetocentric ICRF vectors from JPL Horizons. X,Z,-Y; 10 km/unit.\n * Absolute accuracy remains limited by the parent planet approximate J2000 orbit. Textures except Moon are illustrative.\n * Sources: https://ssd.jpl.nasa.gov/api/horizons.api and https://ssd.jpl.nasa.gov/sats/phys_par/sep.html\n */\nexport const SOLAR_MOONS = '+json.dumps(out,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
print(f'Saved {len(out)} moon vectors')

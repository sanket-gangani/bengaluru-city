# Turns the OpenStreetMap extract into js/world-data.js. Run from the project root:
#   bash tools/fetch_osm.sh && python3 tools/fetch_tiles.py && python3 tools/build_world.py
# Coordinates are packed as integers in "grid ×10" units (1 grid cell = 60 m).
import json, math, os, glob, base64, csv, io
S,W,N,E = 12.83,77.46,13.11,77.80
CELL=60.0
KX=111320*math.cos(math.radians((S+N)/2)); KY=110574
GW=(E-W)*KX/CELL; GH=(N-S)*KY/CELL
NX, NZ = math.ceil(GW), math.ceil(GH)
def proj(lat,lon): return ((lon-W)*KX/CELL, (N-lat)*KY/CELL)
def dp(pts,tol):
    if len(pts)<3: return pts
    keep=[False]*len(pts); keep[0]=keep[-1]=True; st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop(); ax,ay=pts[a]; bx,by=pts[b]; dx,dy=bx-ax,by-ay; L=math.hypot(dx,dy)
        md=-1;mi=-1
        for i in range(a+1,b):
            px,py=pts[i]; d=abs(dy*px-dx*py+bx*ay-by*ax)/L if L>1e-6 else math.hypot(px-ax,py-ay)
            if d>md: md,mi=d,i
        if md>tol: keep[mi]=True; st+=[(a,mi),(mi,b)]
    return [p for p,k in zip(pts,keep) if k]
def enc(pts):
    # delta-encoded ints: first point absolute, then steps (keeps the file small)
    out=[]; px=py=0
    for x,y in pts:
        ix,iy=round(x*10),round(y*10); out+=[ix-px,iy-py]; px,py=ix,iy
    return out
def geom(e): return [proj(g['lat'],g['lon']) for g in e.get('geometry',[]) if g]
def inb(pts): return any(-20<x<GW+20 and -20<y<GH+20 for x,y in pts)
def area(p): return abs(sum(p[i][0]*p[i-1][1]-p[i-1][0]*p[i][1] for i in range(len(p))))/2
def load(f): return json.load(open(f))['elements']
def tiles(prefix):
    seen=set()
    for f in sorted(glob.glob(f'tools/osm/tiles/{prefix}_*.json')):
        try: els=load(f)
        except Exception: print('skip',f); continue
        for e in els:
            k=(e['type'],e['id'])
            if k in seen: continue
            seen.add(k); yield e

out={'meta':{'gw':GW,'gh':GH,'cell':CELL,'bbox':[S,W,N,E],'enc':'delta'}}

# ── roads: arterials (single query) + residential grid (tiles)
RC={'motorway':0,'trunk':0,'motorway_link':0,'trunk_link':0,'primary':1,'primary_link':1,'secondary':2,'secondary_link':2,'tertiary':3,'tertiary_link':3,'residential':4,'unclassified':4,'living_street':4}
roads=[]; seen=set()
def addroad(e):
    if e['id'] in seen: return
    seen.add(e['id'])
    c=RC.get(e.get('tags',{}).get('highway'))
    if c is None: return
    p=geom(e)
    if len(p)<2 or not inb(p): return
    p=dp(p,0.12 if c<4 else 0.22)
    t=e['tags']; lanes=t.get('lanes'); ow=1 if t.get('oneway')=='yes' else 0
    r=[c+(10 if (t.get('bridge') in ('yes','viaduct') or t.get('layer') in ('1','2','3')) else 0)]+enc(p)
    roads.append(r)
for f in ['roads','tertiary']:
    for e in load(f'tools/osm/{f}.json'): addroad(e)
for e in tiles('resi'): addroad(e)
out['roads']=roads

# ── polygons
def rings_of(e):
    if e['type']=='way':
        p=geom(e); return [('outer',p)] if len(p)>3 else []
    res=[]
    for m in e.get('members',[]):
        if m['type']=='way' and 'geometry' in m:
            p=[proj(g['lat'],g['lon']) for g in m['geometry'] if g]
            if len(p)>1: res.append((m.get('role') or 'outer',p))
    final=[]
    for role in ('outer','inner'):
        segs=[p for r,p in res if r==role]
        while segs:
            cur=segs.pop(0); changed=True
            while changed and math.dist(cur[0],cur[-1])>1e-6:
                changed=False
                for i,s in enumerate(segs):
                    if math.dist(cur[-1],s[0])<1e-6: cur=cur+s[1:]; segs.pop(i); changed=True; break
                    if math.dist(cur[-1],s[-1])<1e-6: cur=cur+s[::-1][1:]; segs.pop(i); changed=True; break
            if len(cur)>3: final.append((role,cur))
    return final
def polys(els, classify, tol=0.3, minarea=0.5, holes=False):
    res=[]
    for e in els:
        k=classify(e.get('tags',{}))
        if k is None: continue
        for role,p in rings_of(e):
            if not inb(p): continue
            if role=='inner' and not holes: continue
            if role=='outer' and area(p)<minarea: continue
            p=dp(p,tol)
            if len(p)<3: continue
            res.append([k if role=='outer' else -1]+enc(p))
    return res
def wcls(t):
    if t.get('water') in ('river','canal','stream','drain','wastewater'): return 2
    return 1
water_els=load('tools/osm/water.json')
out['water']=polys(water_els,wcls,0.12,0.25,holes=True)
lakes=[]
for e in water_els:
    t=e.get('tags',{}); n=t.get('name:en') or t.get('name')
    if n and any(w in n.lower() for w in ('lake','kere','tank')):
        rs=rings_of(e)
        if not rs: continue
        p=rs[0][1]; a=area(p)
        if a>60:
            cx=sum(x for x,y in p)/len(p); cy=sum(y for x,y in p)/len(p)
            if 0<cx<GW and 0<cy<GH: lakes.append([n,round(cx,1),round(cy,1),round(a)])
lakes.sort(key=lambda r:-r[3]); out['lakes']=lakes[:40]
def gcls(t):
    v=t.get('leisure') or t.get('landuse') or t.get('natural')
    if v in ('park','grass','recreation_ground','cemetery','pitch','common','golf_course','sports_centre','meadow'): return 1
    if v in ('wood','forest'): return 2
    if v in ('farmland',): return 3
    return None
green_els=load('tools/osm/green.json')
out['green']=polys(green_els,gcls,0.25,0.8)
parks=[]
for e in green_els:
    t=e.get('tags',{}); n=t.get('name:en') or t.get('name')
    if n and t.get('leisure')=='park':
        rs=rings_of(e)
        if not rs: continue
        p=rs[0][1]; a=area(p)
        if a>80: parks.append([n,round(sum(x for x,y in p)/len(p),1),round(sum(y for x,y in p)/len(p),1),round(a)])
parks.sort(key=lambda r:-r[3]); out['parks']=parks[:20]

# landuse: 1 residential 2 commercial 3 industrial 4 military 5 institutional/education 6 hospital 7 construction 8 railway 9 stadium/sports 10 golf 11 aerodrome
def lucls(t):
    lu=t.get('landuse'); am=t.get('amenity'); le=t.get('leisure')
    if t.get('aeroway')=='aerodrome': return 11
    if le=='golf_course': return 10
    if le in ('stadium','sports_centre'): return 9
    if am=='hospital': return 6
    if am in ('university','college','school'): return 5
    return {'residential':1,'commercial':2,'retail':2,'industrial':3,'military':4,'institutional':5,'education':5,'religious':5,
            'construction':7,'railway':8,'garages':2}.get(lu)
out['landuse']=polys(tiles('landuse'),lucls,0.3,0.6)

# ── rail + runways + metro (as before)
rail=[];run=[]
for e in load('tools/osm/rail.json'):
    t=e['tags']; p=geom(e)
    if len(p)<2 or not inb(p): continue
    if t.get('railway')=='rail' and t.get('service') not in ('yard','siding','spur'): rail.append(enc(dp(p,0.2)))
    elif t.get('aeroway')=='runway': run.append([float(t.get('width','45') or 45)/CELL]+enc(p))
out['rail']=rail; out['runways']=run
pick={'Purple':'Whitefield (Kadugodi) → Challaghatta','Green':'Madavara -> Silk Institute','Yellow':'Rashtreeya Vidyalaya Road → Delta'}
metro=[]
for e in load('tools/osm/metro.json'):
    t=e['tags']; ref=t.get('ref'); nm=t.get('name','')
    if ref not in pick or pick[ref] not in nm: continue
    segs=[[proj(g['lat'],g['lon']) for g in m['geometry']] for m in e['members'] if m['type']=='way' and 'geometry' in m]
    stops=[proj(m['lat'],m['lon']) for m in e['members'] if m['type']=='node' and m.get('role','').startswith('stop') and 'lat' in m]
    line=list(segs[0]) if segs else []
    for s in segs[1:]:
        d0=math.dist(line[-1],s[0]); d1=math.dist(line[-1],s[-1])
        if len(line)==len(segs[0]) and min(d0,d1)>0.5 and min(math.dist(line[0],s[0]),math.dist(line[0],s[-1]))<0.5:
            line=line[::-1]; d0=math.dist(line[-1],s[0]); d1=math.dist(line[-1],s[-1])
        line+=(s if d0<=d1 else s[::-1])[1:]
    col={'Purple':'#8a3fa5','Green':'#1f9d4c','Yellow':'#e8c21a'}[ref]
    metro.append({'ref':ref,'color':col,'p':enc(dp(line,0.1)),'stops':enc(stops)})
out['metro']=metro

# ── buildings: density & height grid from every mapped building centroid
cnt=[0]*(NX*NZ); lvl=[0.0]*(NX*NZ); lvn=[0]*(NX*NZ); tall=[]; nb=0
TYPE={'apartments':1,'residential':1,'house':2,'commercial':3,'office':3,'retail':4,'industrial':5,'warehouse':5,'hospital':6,'school':6,'university':6,'college':6,'hotel':3}
for f in sorted(glob.glob('tools/osm/tiles/bld_*.csv')):
    for row in csv.reader(open(f),delimiter='\t'):
        if len(row)<2: continue
        try: lat=float(row[0]); lon=float(row[1])
        except ValueError: continue
        x,z=proj(lat,lon); i=int(x); j=int(z)
        if not (0<=i<NX and 0<=j<NZ): continue
        c=j*NX+i; cnt[c]+=1; nb+=1
        lv=None
        try:
            if len(row)>2 and row[2]: lv=float(row[2].split(';')[0])
            elif len(row)>3 and row[3]: lv=float(row[3].replace('m','').split(';')[0])/3.2
        except ValueError: lv=None
        if lv and 0<lv<120:
            lvl[c]+=lv; lvn[c]+=1
            if lv>=8: tall.append([round(x*10),round(z*10),int(round(lv)),TYPE.get(row[4] if len(row)>4 else '',0)])
grid=bytearray(NX*NZ)
for c in range(NX*NZ):
    a=min(15,cnt[c]); b=min(15,round(lvl[c]/lvn[c])) if lvn[c] else 0
    grid[c]=(a<<4)|b
out['bgrid']=base64.b64encode(bytes(grid)).decode()
# dedupe towers that share a 20 m spot
tall.sort(key=lambda r:-r[2]); seenp=set(); T=[]
for r in tall:
    k=(r[0]//3,r[1]//3)
    if k in seenp: continue
    seenp.add(k); T+= r
out['tall']=T

# ── neighbourhood names
places=[]
for f in glob.glob('tools/osm/tiles/places_*.json'):
    for e in load(f):
        t=e.get('tags',{}); n=t.get('name:en') or t.get('name')
        if not n: continue
        x,z=proj(e['lat'],e['lon'])
        if 0<x<GW and 0<z<GH: places.append([n,round(x,1),round(z,1),{'suburb':0,'quarter':1,'neighbourhood':2}.get(t.get('place'),2),t.get('name:kn','')])
out['places']=places

# ── pack the heavy layers as binary (little-endian) so phones don't have to parse millions of JS numbers
import struct
def pack_layer(items, has_class=True):
    # items: [cls, dx0, dz0, dx1, dz1, ...] (or plain coord lists when has_class=False)
    b = bytearray(struct.pack('<I', len(items)))
    b += bytes((it[0] if has_class else 0) & 255 for it in items)
    while len(b) % 4: b.append(0)
    off = 1 if has_class else 0
    b += struct.pack('<%dI' % len(items), *[(len(it) - off) // 2 for it in items])
    co = [v for it in items for v in it[off:]]
    b += struct.pack('<%dh' % len(co), *co)
    while len(b) % 4: b.append(0)
    return b
blob = bytearray(b'NOW1')
blob += pack_layer(out['roads']); blob += pack_layer(out['water']); blob += pack_layer(out['green']); blob += pack_layer(out['landuse'])
blob += pack_layer(out['rail'], False)
blob += pack_layer([[min(255, round(r[0] * 100))] + r[1:] for r in out['runways']])
g = base64.b64decode(out['bgrid']); blob += struct.pack('<I', len(g)) + g
while len(blob) % 4: blob.append(0)
T = out['tall']; nT = len(T) // 4; blob += struct.pack('<I', nT)
blob += struct.pack('<%dh' % (nT * 2), *[T[i + k] for i in range(0, len(T), 4) for k in (0, 1)])
blob += bytes(min(255, T[i + 2]) for i in range(0, len(T), 4)) + bytes(T[i + 3] for i in range(0, len(T), 4))
light = {k: v for k, v in out.items() if k not in ('roads', 'water', 'green', 'landuse', 'rail', 'runways', 'bgrid', 'tall')}
s = json.dumps(light, separators=(',', ':'))
open('js/world-data.js', 'w').write('window.NO=window.NO||{};NO.WORLD=' + s + ';\nNO.WORLD_BIN="' + base64.b64encode(bytes(blob)).decode() + '";\n')
print('GW %.1f GH %.1f  json %d  buildings %d tall %d'%(GW,GH,len(s),nb,len(T)//4), {k:len(v) for k,v in out.items() if isinstance(v,list)})
print('residential roads', sum(1 for r in roads if r[0]%10==4), 'coord ints', sum(len(r) for r in roads))

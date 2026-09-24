# Tiled Overpass downloads (the city is too big for single queries). Run from the project root.
import urllib.request, urllib.parse, os, sys, time, concurrent.futures as cf
S,W,N,E = 12.83,77.46,13.11,77.80
MIRRORS=["https://overpass-api.de/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
OUT="tools/osm/tiles"
Q={
 "resi": ('json', 'way["highway"~"^(residential|unclassified|living_street)$"]({b});out geom qt;', 5),
 "bld":  ('csv',  '[out:csv(::lat,::lon,"building:levels","height","building";false)];way["building"]({b});out center qt;', 6),
 "landuse": ('json','(way["landuse"~"^(residential|commercial|retail|industrial|military|institutional|education|construction|railway|religious|garages)$"]({b});relation["landuse"~"^(residential|commercial|retail|industrial|military|institutional|education)$"]({b});way["amenity"~"^(university|college|school|hospital)$"]({b});way["leisure"~"^(stadium|golf_course|sports_centre)$"]({b});way["aeroway"="aerodrome"]({b}););out geom qt;', 3),
 "places": ('json','node["place"~"^(suburb|neighbourhood|quarter)$"]({b});out qt;', 1),
}
def job(name, i, j, n, fmt, q):
    fn=f"{OUT}/{name}_{i}_{j}.{fmt}"
    if os.path.exists(fn) and os.path.getsize(fn)>50: return fn, "cached"
    la=(N-S)/n; lo=(E-W)/n
    b=f"{S+la*i:.5f},{W+lo*j:.5f},{S+la*(i+1):.5f},{W+lo*(j+1):.5f}"
    body=q.format(b=b)
    if not body.startswith('['): body='[out:json][timeout:170];'+body
    else: body=body.replace(';way','[timeout:170];way',1) if '[timeout' not in body else body
    for t in range(8):
        url=MIRRORS[(t+i+j)%2]
        try:
            req=urllib.request.Request(url, data=urllib.parse.urlencode({'data':body}).encode(), headers={'User-Agent':'namma-ooru-map/1.0'})
            with urllib.request.urlopen(req, timeout=200) as r: d=r.read()
            if len(d)<30 or d.lstrip()[:1]==b'<': raise Exception('bad body')
            open(fn,'wb').write(d); return fn, f"ok {len(d)}"
        except Exception as e:
            time.sleep(4+t*3)
    return fn, "FAILED"
names=sys.argv[1:] or list(Q)
jobs=[]
with cf.ThreadPoolExecutor(3) as ex:
    for name in names:
        fmt,q,n=Q[name]
        for i in range(n):
            for j in range(n): jobs.append(ex.submit(job,name,i,j,n,fmt,q))
    for f in cf.as_completed(jobs):
        print(*f.result(), flush=True)

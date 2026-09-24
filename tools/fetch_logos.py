# Downloads a square logo/icon per organisation and packs them into assets/logos.png (+ js/logos.js index).
# Needs Pillow. Run from the project root:  python3 tools/fetch_logos.py
import urllib.request, re, io, os, json, concurrent.futures as cf
from PIL import Image
DOM = {
 "flipkart":"flipkart.com","swiggy":"swiggy.com","meesho":"meesho.com","myntra":"myntra.com","bigbasket":"bigbasket.com","udaan":"udaan.com",
 "dunzo":"dunzo.com","licious":"licious.in","zetwerk":"zetwerk.com","phonepe":"phonepe.com","razorpay":"razorpay.com","cred":"cred.club",
 "zerodha":"zerodha.com","groww":"groww.in","juspay":"juspay.in","khatabook":"khatabook.com","slice":"sliceit.com","smallcase":"smallcase.com",
 "acko":"acko.com","digit":"godigit.com","setu":"setu.co","ola":"olacabs.com","olaelectric":"olaelectric.com","rapido":"rapido.bike",
 "ather":"atherenergy.com","yulu":"yulu.bike","postman":"postman.com","sarvam":"sarvam.ai","inmobi":"inmobi.com","hasura":"hasura.io",
 "krutrim":"olakrutrim.com","sharechat":"sharechat.com","byjus":"byjus.com","unacademy":"unacademy.com","vedantu":"vedantu.com","cultfit":"cult.fit",
 "practo":"practo.com","ultrahuman":"ultrahuman.com","accel":"accel.com","peakxv":"peakxv.com","lightspeed":"lsvp.com","elevation":"elevationcapital.com",
 "kalaari":"kalaari.com","blume":"blume.vc","nexus":"nexusvp.com","z47":"z47.com","chiratae":"chiratae.com","stellaris":"stellarisvp.com",
 "threeone4":"3one4capital.com","westbridge":"westbridgecap.com","prime":"primevp.in","rainmatter":"rainmatter.com","letsventure":"letsventure.com",
 "ian":"indianangelnetwork.com","tiger":"tigerglobal.com","softbank":"group.softbank","yc":"ycombinator.com","prosus":"prosus.com","walmart":"walmart.com",
 "dst":"dst-global.com","ribbit":"ribbitcap.com","gic":"gic.com.sg","temasek":"temasek.com.sg","generalatlantic":"generalatlantic.com",
 "insight":"insightpartners.com","tencent":"tencent.com","khosla":"khoslaventures.com","google":"google.com","reliance":"relianceretail.com",
 "meta":"meta.com","amazon":"amazon.com","fairfax":"fairfax.ca","hero":"heromotocorp.com","bajaj":"bajajauto.com","magna":"magna.com",
 "tatadigital":"tatadigital.com","iisc":"iisc.ac.in","iimb":"iimb.ac.in","iiitb":"iiitb.ac.in","ncbs":"ncbs.res.in","nsrcel":"nsrcel.org",
 "sid":"sid.iisc.ac.in","ccamp":"ccamp.res.in","surge":"surgeahead.com","axilor":"axilor.com","gfs":"startup.google.com",
 "manyata":"embassyofficeparks.com","etv":"embassyofficeparks.com","egl":"embassyofficeparks.com","ecospace":"rmzcorp.com","bagmane":"bagmanegroup.com",
 "ptp":"prestigeconstructions.com","ecitypark":"elcita.in","91sb":"91springboard.com","bhive":"bhiveworkspace.com","wework":"wework.co.in",
 "indiqube":"indiqube.com","infosys":"infosys.com","wipro":"wipro.com","biocon":"biocon.com","titan":"titan.co.in","googlein":"google.com",
 "sap":"sap.com","amazonwtc":"amazon.com","microsoft":"microsoft.com","cisco":"cisco.com","intel":"intel.com","isro":"isro.gov.in",
 "hal":"hal-india.co.in","bel":"bel-india.in","startupkarnataka":"startup.karnataka.gov.in","itpl":"itpbangalore.com",
}
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'}
def get(url, t=12):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t) as r: return r.read(), r.geturl()
def img(b):
    try:
        im=Image.open(io.BytesIO(b));
        if getattr(im,'n_frames',1)>1 or im.format=='ICO':
            best=None
            try:
                for s in sorted(im.info.get('sizes',[]) or [], reverse=True): im.size=s; break
            except Exception: pass
        im=im.convert('RGBA'); return im
    except Exception: return None
def fetch(oid, d):
    cands=[]
    try:
        html,final=get('https://'+d+'/'); html=html.decode('utf8','ignore')
        base=re.match(r'(https?://[^/]+)',final).group(1)
        for m in re.finditer(r'<link[^>]+>', html, re.I):
            tag=m.group(0); rel=re.search(r'rel=["\']([^"\']+)',tag,re.I); href=re.search(r'href=["\']([^"\']+)',tag,re.I)
            if not rel or not href: continue
            r=rel.group(1).lower()
            if 'apple-touch-icon' in r or 'icon' in r:
                h=href.group(1).replace('&amp;','&')
                if h.startswith('//'): h='https:'+h
                elif h.startswith('/'): h=base+h
                elif not h.startswith('http'): h=base+'/'+h
                sz=re.search(r'sizes=["\'](\d+)',tag); pri=(3 if 'apple' in r else 1)*1000+(int(sz.group(1)) if sz else 0)
                if h.lower().endswith('.svg'): continue
                cands.append((pri,h))
        cands.append((500,base+'/apple-touch-icon.png'))
    except Exception: pass
    cands.append((100,f'https://www.google.com/s2/favicons?domain={d}&sz=256'))
    best=None
    for pri,u in sorted(cands,reverse=True):
        try:
            b,_=get(u); im=img(b)
            if im and min(im.size)>=64: best=(im,u); break
            if im and (not best or min(im.size)>min(best[0].size)): best=(im,u)
        except Exception: continue
    return oid, best
os.makedirs('tools/logos',exist_ok=True)
res={}
with cf.ThreadPoolExecutor(12) as ex:
    for oid,best in ex.map(lambda kv: fetch(*kv), DOM.items()):
        if best and min(best[0].size)>=48:
            im=best[0]
            # trim transparent border, pad to square
            bb=im.getbbox()
            if bb: im=im.crop(bb)
            s=max(im.size); sq=Image.new('RGBA',(s,s),(0,0,0,0)); sq.paste(im,((s-im.size[0])//2,(s-im.size[1])//2))
            sq=sq.resize((96,96),Image.LANCZOS); sq.save(f'tools/logos/{oid}.png'); res[oid]=best[1]
            print('ok ',oid,best[0].size,best[1][:90],flush=True)
        else: print('-- ',oid, best[0].size if best else None, flush=True)
json.dump(res,open('tools/logos/sources.json','w'),indent=1)

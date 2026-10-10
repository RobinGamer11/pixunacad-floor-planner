"""Speicherprobe Pixelmodus: echte 512px-PNG-Kacheln (RGBA, wie Browser-Kodierung) messen."""
import io, random, json
from PIL import Image, ImageDraw
random.seed(7); T=512
def png(img):
    b=io.BytesIO(); img.save(b,"PNG",optimize=False,compress_level=6); return len(b.getvalue())
def tile(): return Image.new("RGBA",(T,T),(0,0,0,0))
def strokes(n,w):
    im=tile(); d=ImageDraw.Draw(im)
    for _ in range(n):
        pts=[(random.randint(0,T),random.randint(0,T))]
        for _ in range(12): x,y=pts[-1]; pts.append((x+random.randint(-40,40),y+random.randint(-40,40)))
        d.line(pts,fill=(200,30,30,255),width=w,joint="curve")
    return im
def hatch(sp,ang=1):
    im=tile(); d=ImageDraw.Draw(im)
    for k in range(-T,2*T,sp): d.line([(k,0),(k+T*ang,T)],fill=(60,60,60,255),width=2)
    return im
def concrete():
    im=tile(); d=ImageDraw.Draw(im)
    for _ in range(900):
        x,y=random.randint(0,T),random.randint(0,T); r=random.randint(1,4); d.ellipse([x,y,x+r,y+r],fill=(90,90,90,255))
    return im
def insulation():
    im=tile(); d=ImageDraw.Draw(im)
    for y in range(0,T,16):
        d.line([(x,y+8*((x//8)%2)) for x in range(0,T+8,8)],fill=(40,40,40,255),width=2)
    return im
def wash():  # großflächiger Farbauftrag halbtransparent, mit Rand
    im=tile(); d=ImageDraw.Draw(im); d.rectangle([0,0,T,T],fill=(250,210,60,140))
    for _ in range(30): x,y=random.randint(0,T),random.randint(0,T); d.ellipse([x,y,x+60,y+60],fill=(250,180,40,200))
    return im
def erased_fill():  # materialisierte Fläche mit Radierlöchern
    im=tile(); d=ImageDraw.Draw(im); d.rectangle([0,0,T,T],fill=(180,200,220,255))
    for _ in range(8):
        pts=[(random.randint(0,T),random.randint(0,T)) for _ in range(6)]; d.line(pts,fill=(0,0,0,0),width=24)
    return im
kinds={"skizze_leicht":strokes(3,3),"skizze_dicht":strokes(20,4),"schraffur_45":hatch(12),
 "schraffur_eng":hatch(6),"beton":concrete(),"daemmung":insulation(),"farbauftrag":wash(),"flaeche_radiert":erased_fill()}
sz={k:png(v) for k,v in kinds.items()}
# Szenarien: Kachelanzahl je Art (512px bei Standardauflösung), + Vektor-JSON + Manifest
scen={
 "A_EFH_Skizzen":{"skizze_leicht":18,"skizze_dicht":4,"json":180_000},
 "B_MFH_Muster":{"skizze_leicht":30,"skizze_dicht":10,"schraffur_45":25,"beton":20,"daemmung":15,"flaeche_radiert":6,"json":450_000},
 "C_Werkplanung_viel_Pixel":{"skizze_leicht":60,"skizze_dicht":40,"schraffur_45":60,"schraffur_eng":30,"beton":50,"daemmung":40,"farbauftrag":30,"flaeche_radiert":20,"json":900_000},
 "D_Stress_Pixel":{"skizze_dicht":200,"schraffur_eng":150,"beton":150,"farbauftrag":150,"flaeche_radiert":50,"json":1_000_000},
}
out={"tile_png_bytes":sz,"scenarios":{}}
for n,s in scen.items():
    tiles=sum(c for k,c in s.items() if k!="json"); px=sum(sz[k]*c for k,c in s.items() if k!="json")
    out["scenarios"][n]={"tiles":tiles,"pixel_bytes":px,"json_bytes":s["json"],"total_bytes":px+s["json"]}
print(json.dumps(out,indent=1))

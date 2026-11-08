"""
Détourer les photographies d'objets.

Les photos sont prises sur un fond presque noir. Pour poser une plume DANS une
trousse ouverte, il faut que ce fond disparaisse : sans cela on verrait une
vignette carrée noire collée sur la toile. On retire donc le fond par
remplissage depuis les bords — et seulement depuis les bords : un stylo laqué
noir au milieu de l'image n'est pas du fond, il ne doit pas être effacé.

    python3 outils/detourer-photos.py
"""
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "assets" / "objets" / "photos"
CIBLE = RACINE / "assets" / "objets" / "detoures"
PAS = 3.2    # écart de luminance toléré d'un pixel de fond à son voisin
MARGE = 9    # au-dessus du fond le plus clair relevé sur les bords

# Les objets percés : le fond se voit AU TRAVERS (le vide d'une équerre, la
# boucle d'une bandoulière). Ces trous ne touchent pas le bord, le remplissage
# ne les atteint pas ; on les cherche donc aussi à l'intérieur. Seulement pour
# eux : ailleurs, un aplat sombre au milieu de l'image est l'objet lui-même.
PERCES = {"equerre", "rapporteur", "sacoche", "boulier", "compas"}


def lum(p):
    r, g, b = p[:3]
    return 0.299 * r + 0.587 * g + 0.114 * b


def detourer(chemin):
    im = Image.open(chemin).convert("RGB")
    w, h = im.size
    px = im.load()
    fond = [[False] * w for _ in range(h)]
    L = [[lum(px[x, y]) for x in range(w)] for y in range(h)]

    # Le fond n'est jamais tout à fait uni : une lumière de studio le dégrade.
    # On relève sa teinte sur les bords, et on n'avance dans l'image que tant
    # que la luminance varie doucement — un bord d'objet, lui, est un saut.
    # C'est ce qui garde entiers un stylo laqué noir ou un encrier sombre, que
    # le seul critère « c'est sombre » effaçait.
    bords = sorted([L[0][x] for x in range(w)] + [L[h - 1][x] for x in range(w)]
                   + [L[y][0] for y in range(h)] + [L[y][w - 1] for y in range(h)])
    plafond = bords[int(len(bords) * 0.9)] + MARGE

    file = deque()
    for x in range(w):
        file.append((x, 0, L[0][x])); file.append((x, h - 1, L[h - 1][x]))
    for y in range(h):
        file.append((0, y, L[y][0])); file.append((w - 1, y, L[y][w - 1]))
    while file:
        x, y, venant = file.popleft()
        if not (0 <= x < w and 0 <= y < h) or fond[y][x]:
            continue
        v = L[y][x]
        if v > plafond or abs(v - venant) > PAS:
            continue
        fond[y][x] = True
        file.extend(((x + 1, y, v), (x - 1, y, v), (x, y + 1, v), (x, y - 1, v)))

    if chemin.stem in PERCES:
        ref = bords[len(bords) // 2]
        for y0 in range(h):
            for x0 in range(w):
                if fond[y0][x0] or abs(L[y0][x0] - ref) > 2.5:
                    continue
                # On mesure la poche avant de la déclarer fond : une tache de
                # quelques pixels sombres est un détail de l'objet.
                poche, vus, file2 = [], {(x0, y0)}, deque([(x0, y0, L[y0][x0])])
                while file2:
                    x, y, venant = file2.popleft()
                    v = L[y][x]
                    if v > plafond or abs(v - venant) > PAS:
                        continue
                    poche.append((x, y))
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in vus and not fond[ny][nx]:
                            vus.add((nx, ny)); file2.append((nx, ny, v))
                if len(poche) > 120:
                    for x, y in poche:
                        fond[y][x] = True

    masque = Image.new("L", (w, h), 0)
    m = masque.load()
    for y in range(h):
        for x in range(w):
            m[x, y] = 0 if fond[y][x] else 255
    # Un bord adouci : un détourage au couteau se voit à trois mètres.
    masque = masque.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.1))

    sortie = im.convert("RGBA")
    sortie.putalpha(masque)
    boite = masque.point(lambda v: 255 if v > 24 else 0).getbbox()
    if boite:
        marge = 4
        boite = (max(0, boite[0] - marge), max(0, boite[1] - marge),
                 min(w, boite[2] + marge), min(h, boite[3] + marge))
        sortie = sortie.crop(boite)
    sortie.save(CIBLE / (chemin.stem + ".webp"), quality=86, method=6)
    return sortie.size


if __name__ == "__main__":
    CIBLE.mkdir(parents=True, exist_ok=True)
    for f in sorted(SOURCE.glob("*.jpg")):
        print(f.stem, detourer(f))

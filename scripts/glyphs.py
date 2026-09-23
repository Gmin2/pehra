# flattens nucleo's glass icons into two tone glyphs for the app: each icon's back shape (data-glass
# origin) and front shape (data-glass blur), gradients and blur dropped. writes src/ui/glyphs.ts.
# usage: python3 scripts/glyphs.py [path to the glass folder]
import re, sys, pathlib
lib = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/Users/mintu/coding/portfolio/ui/tools/icons/glass")
out = pathlib.Path(__file__).resolve().parent.parent / "apps/mobile/src/ui/glyphs.ts"

def attrs(tag):
    return dict(re.findall(r'([a-zA-Z-]+)="([^"]*)"', tag))

def to_path(name, a):
    f = float
    if name == "path":
        return a["d"]
    if name == "circle":
        cx, cy, r = f(a["cx"]), f(a["cy"]), f(a["r"])
        return f"M{cx - r} {cy}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0Z"
    if name == "ellipse":
        cx, cy, rx, ry = f(a["cx"]), f(a["cy"]), f(a["rx"]), f(a["ry"])
        return f"M{cx - rx} {cy}a{rx} {ry} 0 1 0 {2 * rx} 0a{rx} {ry} 0 1 0 {-2 * rx} 0Z"
    if name == "rect":
        x, y, w, h = f(a.get("x", 0)), f(a.get("y", 0)), f(a["width"]), f(a["height"])
        r = min(f(a.get("rx", a.get("ry", 0))), w / 2, h / 2)
        if not r:
            return f"M{x} {y}h{w}v{h}h{-w}Z"
        return f"M{x + r} {y}h{w - 2 * r}a{r} {r} 0 0 1 {r} {r}v{h - 2 * r}a{r} {r} 0 0 1 {-r} {r}h{-(w - 2 * r)}a{r} {r} 0 0 1 {-r} {-r}v{-(h - 2 * r)}a{r} {r} 0 0 1 {r} {-r}Z"
    return None

lines = [
    "// two tone glyphs flattened from nucleo's glass set by scripts/glyphs.py (do not edit by hand): each",
    "// icon is a back shape and a front shape, drawn as a light tint and a full colour. 24 unit canvas.",
    "// shield is nucleo's shield-check split down the middle the same way.",
    "export type Shape = { d: string; evenodd?: boolean };",
    "export type Glyph = { back: Shape[]; front: Shape[] };",
    "export const glyphs: Record<string, Glyph> = {",
]
count = 0
for svg in sorted(lib.glob("*.svg")):
    src = svg.read_text()
    back, front = [], []
    for name, tag in re.findall(r'<(path|circle|rect|ellipse)\b([^>]*)>', src):
        a = attrs(tag)
        kind = a.get("data-glass")
        if kind not in ("origin", "blur"):
            continue
        d = to_path(name, a)
        if not d:
            continue
        shape = {"d": d, "evenodd": a.get("fill-rule") == "evenodd"}
        (back if kind == "origin" else front).append(shape)
    if not back and not front:
        continue
    def js(shapes):
        return "[" + ", ".join('{ d: "%s"%s }' % (s["d"], ", evenodd: true" if s["evenodd"] else "") for s in shapes) + "]"
    lines.append(f'  "{svg.stem}": {{ back: {js(back)}, front: {js(front)} }},')
    count += 1
lines.append('  shield: {')
lines.append('    back: [{ d: "M12 2C9.35553 3.32223 6.49199 4.1508 3.55006 4.44499L3 4.5L3.62236 12.9014C3.85658 16.0632 5.73712 18.8685 8.57285 20.2864L12 22Z" }],')
lines.append('    front: [{ d: "M12 2C14.6445 3.32223 17.508 4.1508 20.4499 4.445L21 4.5L20.3777 12.9014C20.1435 16.0632 18.263 18.8685 15.4272 20.2864L12 22Z" }],')
lines.append('  },')
lines.append("};")
out.write_text("\n".join(lines) + "\n")
print(f"{count} glyphs written to {out}")

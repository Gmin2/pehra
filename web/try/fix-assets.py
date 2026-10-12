# vercel never uploads a folder called node_modules or a dot folder, and expo puts fonts and package images
# under node_modules/.pnpm. move them to nm/pnpm and point the bundle at the new paths
import os, sys, glob
dist = sys.argv[1]
moves = []
for root, _, files in os.walk(os.path.join(dist, 'assets')):
    for f in files:
        old = os.path.relpath(os.path.join(root, f), dist)
        if 'node_modules' not in old and '/.pnpm/' not in old: continue
        new = old.replace('__node_modules', '_nm').replace('/node_modules/', '/nm/').replace('/.pnpm/', '/pnpm/')
        moves.append((old, new))
for old, new in moves:
    os.makedirs(os.path.dirname(os.path.join(dist, new)), exist_ok=True)
    os.rename(os.path.join(dist, old), os.path.join(dist, new))
for js in glob.glob(os.path.join(dist, '_expo/static/js/web/*.js')):
    s = open(js).read()
    for old, new in moves: s = s.replace('/' + old, '/' + new)
    open(js, 'w').write(s)
print(len(moves), 'assets moved')

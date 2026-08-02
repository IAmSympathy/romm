import os
from collections import defaultdict

stats = defaultdict(int)
ext_stats = defaultdict(int)

for root, dirs, files in os.walk('/romm/resources'):
    folder_name = os.path.basename(root)
    for f in files:
        fp = os.path.join(root, f)
        if os.path.isfile(fp):
            sz = os.path.getsize(fp)
            stats[folder_name] += sz
            ext = os.path.splitext(f)[1].lower()
            ext_stats[ext] += sz

print('=== PAR TYPE DE RESSOURCE ===')
for k, v in sorted(stats.items(), key=lambda x: x[1], reverse=True)[:10]:
    print(f'{v / (1024**3):.2f} GB\t{k}')

print('\n=== PAR EXTENSION DE FICHIER ===')
for k, v in sorted(ext_stats.items(), key=lambda x: x[1], reverse=True)[:10]:
    print(f'{v / (1024**3):.2f} GB\t{k}')

# romm-patch

Custom patches appliqués dynamiquement au container Docker RomM à chaque démarrage.

## Structure

\\\
romm-patch/
├── patch.py          # Script de patch principal
├── apply.sh          # Point d'entrée : docker compose up + patch
├── assets/           # Fichiers injectés dans le container
│   ├── romm-custom-ui.js    # UI custom (high scores, sessions actives…)
│   ├── arcade-audiofix.js   # Fix audio arcade
│   ├── hiscore.dat          # Données high scores MAME
│   └── icons/               # Icônes PSP Minis (SVG, ICO)
├── tools/            # Scripts utilitaires (exécution manuelle)
│   ├── make_white_psp.py    # Générateur icônes PSP blanches
│   ├── arcade_server.py     # Serveur de scores arcade
│   ├── breakdown.py         # Analyse de données
│   ├── patch_roms_cache.py  # Cache ROM
│   └── …
└── README.md
\\\

## Usage

### Mise à jour complète (pull Docker + patch)
\\\ash
bash /home/ubuntu/romm-patch/apply.sh
\\\

### Patch uniquement (sans mise à jour Docker)
\\\ash
python3 /home/ubuntu/romm-patch/patch.py
\\\

## Ce que fait patch.py

| Étape | Description |
|-------|-------------|
| 0 | Patch backend Python (public save states) |
| 1 | Patch JS assets dans le container (boxart, UI, arcade…) |
| 2 | Injection index.html (custom UI script) |
| 3 | Copie des assets statiques (icônes, audio fix…) |
| 4 | MariaDB : ui_settings, générations de plateformes |
| 5 | Nginx : désactiver le cache stale |

## Déploiement de romm-custom-ui.js

Depuis la machine locale (Windows) :
\\\powershell
scp -i  C:\Users\samyl\Downloads\ssh-key-2026-03-04.key romm-custom-ui.js ubuntu@68.233.120.229:/home/ubuntu/romm-patch/assets/
ssh -i C:\Users\samyl\Downloads\ssh-key-2026-03-04.key ubuntu@68.233.120.229 python3 /home/ubuntu/romm-patch/patch.py
\\\

# Guide de Migration vers le Fork Custom RomM

Ce guide vous explique étape par étape comment migrer votre serveur de production (`ubuntu-server`) de l'ancien système de patch dynamique (`romm-patch/patch.py`) vers votre propre **Fork Custom RomM**.

---

## Ce qui change avec le Fork Custom

| Fonctionnalité | Avant (`romm-patch`) | Avec le Fork Custom |
| --- | --- | --- |
| **Bâtiment & Déploiement** | Image Docker officielle RomM + patch dynamic via `patch.py` sur container démarré | Image Docker construite directement depuis votre code source (`docker compose build`) |
| **Serveur Arcade Netplay** | Script Python séparé sur port 8088 (`arcade_server.py`) | Endpoints natifs FastAPI intégrés (`/api/arcade/...`) |
| **Sauvegardes Publics Arcade** | Remplacement de chaînes dans le backend Python du container | Code natif dans `backend/endpoints/states.py` |
| **Mise à jour du serveur** | `bash apply.sh` (pull + patch) | `git pull && docker compose up -d --build` |

---

## Étape 1 : Pousser ce Fork sur votre dépôts Git (ex: GitHub / GitLab)

Sur votre machine locale (Windows) dans ce dossier `romm` :

```bash
git add .
git commit -m "feat: integrate custom patches natively into RomM core"
git remote add my-fork git@github.com:VOTRE_NOM/romm.git  # Remplacez par votre repo
git push -u my-fork master
```

---

## Étape 2 : Préparer la transition sur `ubuntu-server`

Connectez-vous à votre serveur via SSH :

```bash
ssh ubuntu-server
```

Arrêtez le conteneur et supprimez la tâche automatisée de patch si vous en aviez une :

```bash
cd /home/ubuntu
docker compose -f /home/ubuntu/romm-patch/docker-compose.yml down  # Ou le compose actuel
```

---

## Étape 3 : Cloner votre Fork Custom sur le serveur

```bash
cd /home/ubuntu
git clone git@github.com:VOTRE_NOM/romm.git romm-custom
cd romm-custom
```

Copiez votre fichier `.env` existant et vos dossiers de données (roms, assets, database, etc.) vers la configuration du nouveau repo :

```bash
cp /home/ubuntu/romm-patch/.env .env   # Ou depuis votre répertoire romm précédent
```

S'il utilisait des volumes Docker partagés (`romm-db`, `romm-redis`, etc.), assurez-vous que les noms de volumes dans `docker-compose.yml` pointent vers les mêmes volumes.

---

## Étape 4 : Construire et Lancer le conteneur Custom

Exécutez la construction et le démarrage du container :

```bash
docker compose build --no-cache
docker compose up -d
```

Au démarrage, RomM appliquera automatiquement les migrations Alembic (y compris la migration `0108_cloud_platform_generations` pour la génération Cloud et ZX Spectrum).

---

## Étape 5 : Nettoyage et Mises à jour futures

Vous n'avez plus besoin du dossier `romm-patch` ni du script `patch.py` !

### Pour mettre à jour votre serveur à l'avenir :

```bash
cd /home/ubuntu/romm-custom
git pull
docker compose up -d --build
```

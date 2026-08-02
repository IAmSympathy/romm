#!/bin/bash

# ==============================
# Configuration
# ==============================

ARTWORK_DIR="/tmp/artwork"
PLATFORM_ID=39

RESOURCE_DIR="/var/lib/docker/volumes/ubuntu_romm_resources/_data/roms"

CONTAINER="romm-db"
DB_USER="romm-user"
DB_NAME="romm"

# false = simulation uniquement
# true  = copie réelle
DRY_RUN=false


# ==============================
# Connexion MariaDB
# ==============================

echo "Connexion MariaDB..."
read -s -p "Mot de passe MariaDB: " DB_PASS
echo


# ==============================
# Compteurs
# ==============================

FOUND=0
COPIED=0
SKIPPED=0


# ==============================
# Parcours des bezels
# ==============================

for zip in "$ARTWORK_DIR"/*.zip; do

    [ -e "$zip" ] || continue

    filename=$(basename "$zip")
    
    echo
    echo "--------------------------------"
    echo "Analyse: $filename"


    # Cherche la ROM dans ROMM via fs_name
    rom_id=$(docker exec "$CONTAINER" mariadb \
        -u"$DB_USER" \
        -p"$DB_PASS" \
        "$DB_NAME" \
        -N -B \
        -e "
        SELECT id
        FROM roms
        WHERE platform_id=$PLATFORM_ID
        AND fs_name='$filename'
        LIMIT 1;
        ")


    if [ -z "$rom_id" ]; then
        echo "[SKIP] Pas dans ta bibliothèque"
        ((SKIPPED++))
        continue
    fi


    echo "[OK] ROMM ID: $rom_id"
    ((FOUND++))


    # Vérifie le contenu du ZIP
    bezel_file=""

    if unzip -l "$zip" | grep -q "mame_nebula_vertical.png"; then
        bezel_file="mame_nebula_vertical.png"
    elif unzip -l "$zip" | grep -q "mame_nebula_horizontal.png"; then
        bezel_file="mame_nebula_horizontal.png"
    fi


    if [ -z "$bezel_file" ]; then
        echo "[SKIP] Aucun bezel compatible"
        ((SKIPPED++))
        continue
    fi


    destination="$RESOURCE_DIR/$PLATFORM_ID/$rom_id/bezel/bezel.png"


    echo "Source : $bezel_file"
    echo "Dest   : $destination"


    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] Aucun changement"
        continue
    fi


sudo mkdir -p "$(dirname "$destination")"

if unzip -p "$zip" "$bezel_file" | sudo tee "$destination" > /dev/null; then
    echo "[COPIE OK]"
    ((COPIED++))
else
    echo "[ERREUR COPIE]"
fi

done


echo
echo "=============================="
echo "Terminé"
echo "Trouvés : $FOUND"
echo "Copiés  : $COPIED"
echo "Ignorés : $SKIPPED"
echo "=============================="

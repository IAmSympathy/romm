#!/usr/bin/env bash
# apply.sh - Full RomM update + patch entrypoint
# Usage: bash /home/ubuntu/romm-patch/apply.sh
set -e

echo '=========================================='
echo '  Updating RomM & Applying All Patches    '
echo '=========================================='

cd /home/ubuntu

echo '1. Pulling latest Docker images...'
docker compose pull

echo '2. Starting containers...'
docker compose up -d

echo '3. Waiting for containers to be ready...'
sleep 5

echo '4. Running Master Patch script...'
python3 /home/ubuntu/romm-patch/patch.py

echo ''
echo 'Done!'

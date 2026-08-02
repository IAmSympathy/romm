import asyncio
import sys
from pathlib import Path

# Add backend to sys.path
sys.path.insert(0, '/backend')

from tasks.scheduled.convert_images_to_webp import convert_images_to_webp_task

imgs = convert_images_to_webp_task._find_convertible_images()
print(f"Nombre total d'images convertibles trouvées par RomM : {len(imgs)}")

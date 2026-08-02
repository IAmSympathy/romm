import re

content = open('/tmp/romm_assets/PlatformsIndex-Cd7tXJ_V.js', 'r', encoding='utf-8').read()

print("=== PlatformsIndex-Cd7tXJ_V.js FULL GENERATION GROUPING & SORTING LOGIC ===")
for m in re.finditer(r'generation|__unknown', content):
    idx = m.start()
    snippet = content[max(0, idx-100):min(len(content), idx+250)].replace('\n', ' ')
    print(f"   -> {snippet}")

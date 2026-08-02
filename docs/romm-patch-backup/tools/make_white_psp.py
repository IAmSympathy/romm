import re
import os

paths = [
    '/home/ubuntu/custom/assets/platforms/psp-minis.svg',
    '/home/ubuntu/custom/assets/platforms/systematic/psp-minis.svg',
    '/home/ubuntu/custom/assets/console/neon/systems/psp-minis.svg',
    '/home/ubuntu/custom/assets/console/default/systems/psp-minis.svg'
]

white_style = """<style>
      .cls-1, .cls-2 {
        stroke: #8b5cf6;
        stroke-width: 4px;
        fill: none;
        stroke-miterlimit: 10;
      }
      .cls-3 {
        stroke: #cbd5e1;
        stroke-width: 2px;
        fill: none;
      }
      .cls-4 {
        fill: #0f172a;
      }
      .cls-5 {
        opacity: .15;
      }
      .cls-6 {
        fill: #ffffff;
      }
      .cls-7 {
        fill: #ffffff;
      }
      .cls-8 {
        fill: #cbd5e1;
      }
      .cls-9, .cls-10, .cls-11, .cls-12 {
        fill: #e2e8f0;
      }
      .cls-13 {
        fill: #475569;
      }
      .cls-14 {
        opacity: .45;
      }
      .cls-15 {
        fill: #a78bfa;
      }
      .cls-16 {
        fill: #ffffff;
        stroke: #a78bfa;
        stroke-width: 6px;
      }
      .cls-17 {
        fill: #76c7a7;
      }
      .cls-18 {
        fill: #f8fafc;
      }
      .cls-19 {
        fill: #ffffff;
      }
    </style>"""

for p in paths:
    if not os.path.exists(p):
        continue
    try:
        with open(p, 'r', encoding='utf-8') as f:
            svg = f.read()

        # Replace style block with White PSP Console styling
        if '<style>' in svg and '</style>' in svg:
            svg = re.sub(r'<style>.*?</style>', white_style, svg, flags=re.DOTALL)
        else:
            svg = re.sub(r'fill:\s*#(202023|323233|212123|060707|1a1c1d)', 'fill: #ffffff', svg, flags=re.I)
            svg = re.sub(r'fill="#(202023|323233|212123|060707|1a1c1d)"', 'fill="#ffffff"', svg, flags=re.I)

        with open(p, 'w', encoding='utf-8') as f:
            f.write(svg)
        print(f"✓ Successfully generated White PSP Console frame SVG: {p}")
    except Exception as e:
        print(f"Error on {p}: {e}")

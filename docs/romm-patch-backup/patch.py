#!/usr/bin/env python3
"""
RomM Master Patch Script
========================
Applies all custom patches to the RomM Docker container at runtime.
Run via: python3 /home/ubuntu/romm-patch/patch.py
Or via:  bash /home/ubuntu/romm-patch/apply.sh  (includes docker compose up)

Directory layout:
  romm-patch/
  ├── patch.py          <- this file
  ├── apply.sh          <- full update + patch entrypoint
  ├── assets/           <- source files injected into the container
  │   ├── romm-custom-ui.js
  │   ├── arcade-audiofix.js
  │   ├── hiscore.dat
  │   ├── index.html
  │   └── icons/        <- PSP Minis SVG/ICO etc.
  └── tools/            <- standalone utility scripts (not auto-run)
"""

import os
import sys
import glob
import json
import shutil
import subprocess
import re

# -- Paths --------------------------------------------------------------------
PATCH_DIR        = "/home/ubuntu/romm-patch"
ASSETS_SRC       = f"{PATCH_DIR}/assets"
CUSTOM_UI_SRC    = f"{ASSETS_SRC}/romm-custom-ui.js"
CONTAINER_ASSETS = "/var/www/html/assets"
TMP_DIR          = "/tmp/romm_patch_assets"

# -- Banner -------------------------------------------------------------------
print("==========================================")
print("   RomM Master Dynamic Patch Script       ")
print("   - Arcade Netplay Audio Fix             ")
print("   - Dedicated RomM Custom UI Script      ")
print("   - Dynamic Container index.html Inject  ")
print("   - Hardcoded Default Cover Settings     ")
print("   - Default Platforms Group By Generation")
print("   - Default Arcade Core: mame2003_plus   ")
print("   - Clean Spring Bounce Widget Styling   ")
print("   - Extended Library Stats Widget        ")
print("   - PSP Minis White Console Icon Inject  ")
print("   - Arcade Master Public Save States     ")
print("   - FBNeo & FBAlpha Core Arcade Support  ")
print("   - Backend Public States Inherit Patch  ")
print("   - Disable Stale Browser Nginx Caching  ")
print("==========================================")


# -- Helper: string-replace patches in JS files --------------------------------
def patch_file(filename_pattern, replacements):
    """Apply string or regex replacements to all files matching a glob in TMP_DIR."""
    files = glob.glob(os.path.join(TMP_DIR, filename_pattern))
    for f in files:
        with open(f, "r", encoding="utf-8") as fh:
            content = fh.read()
        modified = False
        for old, new in replacements:
            if isinstance(old, re.Pattern):
                if old.search(content):
                    content = old.sub(new, content)
                    modified = True
            else:
                if old in content:
                    content = content.replace(old, new)
                    modified = True
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(content)
        print(f"  {'✓ Patched' if modified else '✓'} {os.path.basename(f)}"
              + ("" if modified else " up-to-date"))


# -- Step 0: Patch RomM backend Python (Arcade Public Highscore states) ----------
print("\n[0/5] Patching RomM Backend Python for Arcade Public Highscore States...")
try:
    subprocess.run("docker cp /home/ubuntu/romm-patch/tools/patch_backend_states.py romm:/tmp/patch_backend_states.py", shell=True, check=True)
    subprocess.run("docker exec romm python3 /tmp/patch_backend_states.py", shell=True, check=True)
    subprocess.run("docker exec romm sh -c 'kill -HUP $(cat /tmp/gunicorn.pid)'", shell=True, check=True)
except Exception as e:
    print(f"  Backend patch skipped: {e}")

# -- Step 1: Extract & patch JS assets ----------------------------------------
print("\n[1/5] Extracting & Patching JS assets inside container...")
subprocess.run(f"rm -rf {TMP_DIR} && mkdir -p {TMP_DIR}", shell=True, check=True)
subprocess.run(f"docker cp romm:{CONTAINER_ASSETS}/. {TMP_DIR}/", shell=True, check=True)

if os.path.exists(CUSTOM_UI_SRC):
    shutil.copy(CUSTOM_UI_SRC, os.path.join(TMP_DIR, "romm-custom-ui.js"))

# 1. useUISettings - default settings
patch_file("useUISettings-*.js", [
    ('boxartStyleDetails:{key:"settings.boxartStyleDetails",default:"miximage_v2_path"}',
     'boxartStyleDetails:{key:"settings.boxartStyleDetails",default:"box3d_path"}'),
    ('boxartStylePlayer:{key:"settings.boxartStylePlayer",default:"miximage_v2_path"}',
     'boxartStylePlayer:{key:"settings.boxartStylePlayer",default:"physical_path"}'),
    ('platformsGroupBy:{key:`settings.platformsGroupBy`,default:null}',
     'platformsGroupBy:{key:`settings.platformsGroupBy`,default:`generation`}'),
    ('libraryStatsMode:{key:"settings.libraryStatsMode",default:"simple"}',
     'libraryStatsMode:{key:"settings.libraryStatsMode",default:"extended"}'),
])

# 2. GameCover - fallback boxart style
patch_file("GameCover-*.js", [
    ('e.boxartStyleDetails??"miximage_v2_path"', 'e.boxartStyleDetails??"box3d_path"'),
    ('e.boxartStylePlayer??"miximage_v2_path"',  'e.boxartStylePlayer??"physical_path"'),
])

# 3. VSkeletonLoader - fallback boxart style
patch_file("VSkeletonLoader-*.js", [
    ('e.boxartStyleDetails??"miximage_v2_path"', 'e.boxartStyleDetails??"box3d_path"'),
    ('e.boxartStylePlayer??"miximage_v2_path"',  'e.boxartStylePlayer??"physical_path"'),
])

# 4. useGameAnimation - fallback boxart style
patch_file("useGameAnimation-*.js", [
    ('e.boxartStyleDetails??"miximage_v2_path"', 'e.boxartStyleDetails??"box3d_path"'),
    ('e.boxartStylePlayer??"miximage_v2_path"',  'e.boxartStylePlayer??"physical_path"'),
])

# 5. GalleryShell - boxart style only (card-width patch disabled, uses native layout)
patch_file("GalleryShell-*.js", [
    ('boxartStyleDetails??"miximage_v2_path"', 'boxartStyleDetails??"box3d_path"'),
    ('boxartStylePlayer??"miximage_v2_path"',  'boxartStylePlayer??"physical_path"'),
])

# 6. UserInterface - boxart style & platform group-by
patch_file("UserInterface-*.js", [
    ('boxartStyleDetails:"miximage_v2_path"', 'boxartStyleDetails:"box3d_path"'),
    ('boxartStylePlayer:"miximage_v2_path"',  'boxartStylePlayer:"physical_path"'),
    ('platformsGroupBy:null',                  'platformsGroupBy:"generation"'),
])

# 7. Backend - public save states (allows viewing states marked as public)
print("\n[7/7] Patching backend public savestates...")
try:
    patch_py = (
        "docker exec romm python3 -c \""
        "path='/backend/endpoints/responses/rom.py'\n"
        "content=open(path).read()\n"
        "old='for s in db_rom.states if s.user_id == user_id'\n"
        "new='for s in db_rom.states if s.user_id == user_id or s.is_public'\n"
        "if old in content:\n"
        "    open(path, 'w').write(content.replace(old, new))\n"
        "    print('Patched public states successfully')\n"
        "else:\n"
        "    print('Already patched or pattern not found')\n"
        "\""
    )
    subprocess.run(patch_py, shell=True, check=True)
except Exception as e:
    print(f"Backend patch skipped: {e}")

# 8. Main - platform drawer Cloud label & sort order
patch_file("Main-*.js", [
    ("]).sort(([e],[t])=>e===`Other`?1:t===`Other`?-1:e.localeCompare(t))",
     "]).sort(([e],[t])=>{let g=k=>(k===`Other`?98:(k==99||k===`99`?99:(parseInt(k)||0)));return g(e)-g(t)})"),
    ("m=e=>d.value===`generation`&&e!==`Other`?`Gen ${e}`:d.value===`category`&&e===`Portable Console`?`Handheld Console`:e",
     "m=e=>d.value===`generation`?(e==99||e===`99`?`Cloud`:(e===`Other`?`Other`:`Gen ${e}`)):d.value===`category`&&e===`Portable Console`?`Handheld Console`:e"),
])

# 9. PlatformsIndex - Cloud generation label & sort
patch_file("PlatformsIndex-*.js", [
    # Old pattern (variable Z)
    ("Z=r(()=>q(U.value,e=>{let t=e.generation;return typeof t==`number`&&t>0?{key:t.toString().padStart(4,`0`),label:L(t)}:{key:`__unknown`,label:`Unknown generation`}},(e,t)=>e.key===`__unknown`?1:t.key===`__unknown`?-1:e.key.localeCompare(t.key)))",
     "Z=r(()=>q(U.value,e=>{let t=e.generation;return typeof t==`number`&&t>0?{key:t===99?`9999`:t.toString().padStart(4,`0`),label:t===99?`Cloud`:L(t)}:{key:`__unknown`,label:`Unknown generation`}},(e,t)=>{let g=k=>(k===`__unknown`?98:(k===`9999`||k===`0099`?99:(parseInt(k)||0)));return g(e.key)-g(t.key)}))"),
    # New pattern (stable anchor: typeof t==`number`)
    ("typeof t==`number`&&t>0?{key:t.toString().padStart(4,`0`),label:L(t)}:{key:`__unknown`,label:`Unknown generation`}},(e,t)=>e.key===`__unknown`?1:t.key===`__unknown`?-1:e.key.localeCompare(t.key))",
     "typeof t==`number`&&t>0?{key:t===99?`9999`:t.toString().padStart(4,`0`),label:t===99?`Cloud`:L(t)}:{key:`__unknown`,label:`Unknown generation`}},(e,t)=>{let g=k=>(k===`__unknown`?98:(k===`9999`||k===`0099`?99:(parseInt(k)||0)));return g(e.key)-g(t.key)})"),
])

# 10b. Base - initialize core prop without variable shadowing & re-select state on core change
patch_file("Base-*.js", [
    ("let i=localStorage.getItem(`player:${H.value.platform_slug}:core`);i?J.value=i:J.value=X.value[0];let t=H.value.user_states.filter(e=>!e.emulator||e.emulator===J.value);t.length>0?(G.value=!1,K.value=t[0],W.value=null):H.value.user_saves.length>0?(G.value=!0,W.value=H.value.user_saves[0],K.value=null):(G.value=!0,W.value=null,K.value=null);",
     "let cr=i?.core??localStorage.getItem(`player:${H.value.platform_slug}:core`);cr?J.value=cr:J.value=X.value[0];let t=H.value.user_states.filter(e=>!e.emulator||e.emulator===J.value);t.length>0?(G.value=!1,K.value=t[0],W.value=null):H.value.user_saves.length>0?(G.value=!0,W.value=H.value.user_saves[0],K.value=null):(G.value=!0,W.value=null,K.value=null);"),
    ("re(J,e=>{K.value&&K.value.emulator&&K.value.emulator!==e&&(K.value=null,localStorage.removeItem(`player:${H.value?.platform_slug}:state_id`))})",
     "re(J,e=>{let t=H.value?.user_states?.filter(st=>!st.emulator||st.emulator===e)??[];t.length>0?(G.value=!1,K.value=t[0],W.value=null):(K.value=null,W.value=H.value?.user_saves?.[0]??null,G.value=!0)})"),
])

# 10. index - default arcade core
patch_file("index-*.js", [
    ('arcade:[`mame2003`,`mame2003_plus`',
     'arcade:[`mame2003_plus`,`mame2003`'),
])

# 11. useGalleryViewModeUrl - default group-by
patch_file("useGalleryViewModeUrl-*.js", [
    ("y(`v2.gallery.groupBy`,`none`)",       "y(`v2.gallery.groupBy`,`generation`)"),
    ("y(`v2.gallery.groupBy`,default:null)", "y(`v2.gallery.groupBy`,`generation`)"),
])

# 12. widgets - extended stats, fast query params, total caching & horizontal platform+year footer
patch_file("widgets-*.js", [
    ('h={limit:1,withCharIndex:!1,withFilterValues:!1,withRomIdIndex:!1}',
     'h={limit:1,with_char_index:!1,with_filter_values:!1,with_rom_id_index:!1}'),
    ('async function z(){let{data:e}=await g.getRoms({...h,offset:0});if(!e.total)return null;let{data:t}=await g.getRoms({...h,offset:Math.floor(Math.random()*e.total)});return t.items.at(0)}',
     'var _tot=0;async function z(){if(!_tot){let{data:e}=await g.getRoms({...h,offset:0});if(!e.total)return null;_tot=e.total}let{data:t}=await g.getRoms({...h,offset:Math.floor(Math.random()*_tot)});return t.items.at(0)}'),
    ('x(`div`,W,[x(`div`,G,f(k.value),1),x(`div`,K,[o(I,{slug:v.value.platform_slug,name:v.value.platform_display_name,size:14},null,8,[`slug`,`name`]),x(`span`,q,f(v.value.platform_display_name),1)]),A.value||N.value?(d(),u(`div`,J,[A.value?(d(),u(`span`,Y,f(A.value),1)):c(``,!0),N.value?(d(),s(r(M),{key:1,size:`x-small`,variant:`translucent`},{default:_(()=>[i(f(N.value),1)]),_:1})):c(``,!0)])):c(``,!0)])',
     'x(`div`,W,[x(`div`,G,f(k.value),1),x(`div`,{class:`r-v2-widget-pick__footer`},[x(`div`,K,[o(I,{slug:v.value.platform_slug,name:v.value.platform_display_name,size:14},null,8,[`slug`,`name`]),x(`span`,q,f(v.value.platform_display_name),1)]),A.value||N.value?(d(),u(`div`,J,[A.value?(d(),u(`span`,Y,f(A.value),1)):c(``,!0),N.value?(d(),s(r(M),{key:1,size:`x-small`,variant:`translucent`},{default:_(()=>[i(f(N.value),1)]),_:1})):c(``,!0)])):c(``,!0)])])'),
    (',loading:y.value},{action:', ',loading:!v.value},{action:'),
    ('async function V({notify:e}){if(y.value)return;R();let n=document.activeElement===D();y.value=!0;try{let e=await z();if(e===void 0&&(e=await z()),e===void 0)throw Error(`random pick came back empty`);v.value=e,w.value=!1}',
     'async function V({notify:e}){if(y.value)return;R();let n=document.activeElement===D();y.value=!0;try{let e=await z();if(e===void 0&&(e=await z()),e===void 0)throw Error(`random pick came back empty`);let u=e?.cover_url||e?.metadatum?.cover_url;if(u){await new Promise(r=>{let i=new Image();i.onload=r;i.onerror=r;i.src=u})};v.value=e,w.value=!1}'),
])

# 12b. widgets CSS - remove margin-top: auto void space
patch_file("widgets-*.css", [
    ('margin-top:auto', 'margin-top:0'),
])

# 13. utils - public save-state upload
patch_file("utils-*.js", [
    ('async saveSaveState({romId:e,name:t,type:n,file:r}){',
     'async saveSaveState({romId:e,name:t,type:n,file:r,public_states:pState}){'),
    ('let a=new FormData;if(a.append("file",r),t&&a.append("name",t),n&&a.append("type",n)',
     'let a=new FormData;if(a.append("file",r),t&&a.append("name",t),n&&a.append("type",n),pState!==undefined&&a.append("public_states",pState)'),
])


# Sync patched assets -> container
subprocess.run(f"docker cp {TMP_DIR}/. romm:{CONTAINER_ASSETS}/", shell=True, check=True)


# -- Step 2: Inject index.html -------------------------------------------------
print("\n[2/5] Updating index.html with correct entry point JS hash...")
index_js_files = glob.glob(os.path.join(TMP_DIR, "index-*.js"))
if index_js_files:
    entry_js = os.path.basename(index_js_files[0])
    print(f"  Target: {entry_js}")
    tmp_html = "/tmp/romm_index.html"
    subprocess.run(f"docker cp romm:/var/www/html/index.html {tmp_html}", shell=True, check=True)
    with open(tmp_html, "r", encoding="utf-8") as fh:
        html = fh.read()
    html = re.sub(r"/assets/index-[A-Za-z0-9_-]+\.js", f"/assets/{entry_js}", html)
    if "</head>" in html and "romm-custom-ui.js" not in html:
        html = html.replace(
            "</head>",
            '<script type="module" crossorigin src="/assets/romm-custom-ui.js"></script>\n</head>'
        )
    with open(tmp_html, "w", encoding="utf-8") as fh:
        fh.write(html)
    subprocess.run(
        f"cat {tmp_html} | docker exec -i romm sh -c 'cat > /var/www/html/index.html'",
        shell=True, check=True
    )
    print("  Successfully patched and synced container index.html!")


# -- Step 3: Copy static assets ------------------------------------------------
print("\n[3/5] Injecting static assets into container...")
subprocess.run(f"docker cp {TMP_DIR}/. romm:{CONTAINER_ASSETS}/", shell=True, check=True)
if os.path.isdir(ASSETS_SRC):
    subprocess.run(f"docker cp {ASSETS_SRC}/. romm:{CONTAINER_ASSETS}/", shell=True, check=True)
subprocess.run(
    "docker exec romm sh -c 'mkdir -p /romm/assets && ln -sf /var/www/html/assets/users /romm/assets/users'",
    shell=True, check=True
)


# -- Step 4: MariaDB - ui_settings & platform generations ---------------------
print("\n[4/5] Updating MariaDB user ui_settings in database...")
try:
    sql = (
        "UPDATE users SET ui_settings = JSON_SET("
        "COALESCE(ui_settings, '{}'), "
        "'$.boxartStyleDetails', 'box3d_path', "
        "'$.boxartStylePlayer', 'physical_path', "
        "'$.platformsGroupBy', 'generation', "
        "'$.libraryStatsMode', 'extended'"
        "); "
        "UPDATE platforms SET generation = 3  WHERE id = 50 OR slug = 'zxs'; "
        "UPDATE platforms SET generation = 99 WHERE id IN (27, 30); "
        "UPDATE users SET permission_group_id = 1 WHERE permission_group_id IS NULL; "
    )
    subprocess.run(
        f'docker exec romm-db mariadb -u romm-user -p0HstfrcGJEeSvU romm -e "{sql}"',
        shell=True, check=True
    )
    print("  Successfully updated database ui_settings for all users")
    print("  Successfully enforced platform generations (ZX Spectrum -> Gen 3, Steam/Xbox Cloud -> Cloud Gen 99)")
except Exception as e:
    print(f"  Database update skipped: {e}")


# -- Step 5: Nginx - disable stale caching ------------------------------------
print("\n[5/5] Updating Nginx Cache-Control headers...")
try:
    # Write a helper script file then copy it into the container (avoids shell escaping issues)
    nginx_helper_lines = [
        "path = '/etc/nginx/conf.d/default.conf'",
        "c = open(path).read()",
        "if 'add_header Cache-Control' not in c:",
        "    new = c.replace('location / {', 'location / {\\n        add_header Cache-Control \"no-cache, must-revalidate\";  ')",
        "    open(path, 'w').write(new)",
        "    print('Added Nginx Cache-Control header')",
    ]
    with open("/tmp/romm_nginx_patch.py", "w") as f:
        f.write("\n".join(nginx_helper_lines) + "\n")
    subprocess.run("docker cp /tmp/romm_nginx_patch.py romm:/tmp/romm_nginx_patch.py", shell=True, check=True)
    subprocess.run("docker exec romm python3 /tmp/romm_nginx_patch.py && docker exec romm nginx -s reload", shell=True, check=True)
except Exception as e:
    print(f"  Nginx cache header skipped: {e}")


print("\n==========================================")
print("   Master Patch Completed Successfully!   ")
print("==========================================")

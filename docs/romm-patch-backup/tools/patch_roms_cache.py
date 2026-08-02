import re

path = '/backend/endpoints/roms/__init__.py'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace build_unscoped_sidecar_cache_key definition with full search & platform caching support
old_func_pattern = r'def build_unscoped_sidecar_cache_key\([\s\S]*?\)\s*->\s*str\s*\|\s*None:[\s\S]*?return None'

new_func = """def build_unscoped_sidecar_cache_key(
    user_id: int,
    order_by: str,
    order_dir: str,
    group_by_meta_id: bool,
    is_unscoped: bool,
    platform_ids: list[int] | None = None,
    collection_id: int | None = None,
    search_term: str | None = None,
) -> str | None:
    \"\"\"Cache key for library sidecars (char index, filter values, rom id index).
    Enables instant sidecar caching for platform views (SNES 3000 roms) and search queries (/search 9000 roms)
    to eliminate scroll lag across all 9,000 ROMs.
    \"\"\"
    if is_unscoped:
        return (
            f"all:u{user_id}"
            f":o{order_by.lower()}:d{order_dir.lower()}:g{int(group_by_meta_id)}"
        )
    elif platform_ids and len(platform_ids) == 1:
        return (
            f"plat{platform_ids[0]}:u{user_id}"
            f":o{order_by.lower()}:d{order_dir.lower()}:g{int(group_by_meta_id)}"
        )
    elif collection_id:
        return (
            f"coll{collection_id}:u{user_id}"
            f":o{order_by.lower()}:d{order_dir.lower()}:g{int(group_by_meta_id)}"
        )
    elif search_term and len(search_term.strip()) >= 2:
        st = re.sub(r'[^a-zA-Z0-9]', '', search_term.strip().lower())
        return (
            f"srch{st[:16]}:u{user_id}"
            f":o{order_by.lower()}:d{order_dir.lower()}:g{int(group_by_meta_id)}"
        )
    return None"""

content = re.sub(old_func_pattern, new_func, content, count=1)

# Ensure all 3 invocation sites pass platform_ids, collection_id, search_term
old_call_pattern = r'build_unscoped_sidecar_cache_key\(\s*request\.user\.id,\s*order_by,\s*order_dir,\s*group_by_meta_id,\s*is_unscoped\s*\)'
new_call = 'build_unscoped_sidecar_cache_key(request.user.id, order_by, order_dir, group_by_meta_id, is_unscoped, platform_ids, collection_id, search_term)'

content = re.sub(old_call_pattern, new_call, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Full platform & search sidecar caching patch applied to /backend/endpoints/roms/__init__.py")

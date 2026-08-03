"""Real-time user game activity tracking.

Stores ephemeral "currently playing" state in Redis. Each active session is a
Redis key with a short TTL, refreshed by periodic heartbeats from the client
(browser) or the device. When the TTL expires (no heartbeat received), the
session is considered ended automatically.
"""

from __future__ import annotations

import json
from typing import TypedDict

from handler.redis_handler import async_cache
from logger.logger import log


class ActivityEntry(TypedDict):
    user_id: int
    username: str
    avatar_path: str
    rom_id: int
    rom_name: str
    rom_cover_path: str  # small cover path, may be empty
    screenshot_path: str  # "where they are" image (save/title/screenshot), may be empty
    platform_slug: str
    platform_name: str
    device_id: str
    device_type: str  # "web", "grout", "argosy-launcher", etc.
    started_at: str  # ISO 8601 timestamp


class ActivityHandler:
    """Redis-backed store for currently active game play sessions."""

    ACTIVITY_TTL = 90  # seconds; refreshed by heartbeats
    ROM_INDEX_TTL = 120  # slightly longer than ACTIVITY_TTL
    KEY_PREFIX = "activity:user:"
    ROM_INDEX_PREFIX = "activity:rom:"

    def _activity_key(self, user_id: int, device_id: str) -> str:
        return f"{self.KEY_PREFIX}{user_id}:{device_id}"

    def _rom_index_key(self, rom_id: int) -> str:
        return f"{self.ROM_INDEX_PREFIX}{rom_id}"

    def _member(self, user_id: int, device_id: str) -> str:
        return f"{user_id}:{device_id}"

    async def set_active(self, entry: ActivityEntry) -> None:
        """Store or refresh a user's active play session."""
        key = self._activity_key(entry["user_id"], entry["device_id"])
        rom_key = self._rom_index_key(entry["rom_id"])
        member = self._member(entry["user_id"], entry["device_id"])

        async with async_cache.pipeline() as pipe:
            await pipe.set(key, json.dumps(entry), ex=self.ACTIVITY_TTL)
            await pipe.sadd(rom_key, member)
            await pipe.expire(rom_key, self.ROM_INDEX_TTL)
            await pipe.execute()

    async def clear_active(self, user_id: int, device_id: str) -> int | None:
        """Clear a user's active play session. Returns the rom_id that was cleared, or None."""
        key = self._activity_key(user_id, device_id)
        raw = await async_cache.get(key)
        if not raw:
            return None

        try:
            entry = json.loads(raw)
            rom_id = int(entry["rom_id"])
        except (ValueError, KeyError, TypeError) as e:
            log.warning(f"Failed to parse activity entry for cleanup: {e}")
            await async_cache.delete(key)
            return None

        member = self._member(user_id, device_id)
        async with async_cache.pipeline() as pipe:
            await pipe.delete(key)
            await pipe.srem(self._rom_index_key(rom_id), member)
            await pipe.execute()
        return rom_id

    async def get_active(self, user_id: int, device_id: str) -> ActivityEntry | None:
        """Get a single active session by user and device."""
        key = self._activity_key(user_id, device_id)
        raw = await async_cache.get(key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except ValueError:
            return None

    ONLINE_TTL = 60  # seconds
    ONLINE_KEY_PREFIX = "activity:online:"

    def _online_key(self, user_id: int) -> str:
        return f"{self.ONLINE_KEY_PREFIX}{user_id}"

    async def set_online(self, user_id: int, username: str, avatar_path: str) -> None:
        """Store or refresh an online user's presence."""
        key = self._online_key(user_id)
        entry: ActivityEntry = {
            "user_id": user_id,
            "username": username,
            "avatar_path": avatar_path or "",
            "rom_id": 0,
            "rom_name": "",
            "rom_cover_path": "",
            "screenshot_path": "",
            "platform_slug": "",
            "platform_name": "",
            "device_id": "web",
            "device_type": "web",
            "started_at": "",
        }
        await async_cache.set(key, json.dumps(entry), ex=self.ONLINE_TTL)

    async def clear_online(self, user_id: int) -> None:
        """Remove online presence for a user."""
        await async_cache.delete(self._online_key(user_id))

    async def get_all_active(self) -> list[ActivityEntry]:
        """Get all currently active play sessions across all users plus online non-playing users."""
        pattern = f"{self.KEY_PREFIX}*"
        keys = [key async for key in async_cache.scan_iter(match=pattern)]

        entries: list[ActivityEntry] = []
        playing_user_ids: set[int] = set()

        if keys:
            for raw in await async_cache.mget(keys):
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                    entries.append(entry)
                    if entry.get("user_id"):
                        playing_user_ids.add(int(entry["user_id"]))
                except ValueError:
                    continue

        # Also collect online non-playing users
        online_pattern = f"{self.ONLINE_KEY_PREFIX}*"
        online_keys = [key async for key in async_cache.scan_iter(match=online_pattern)]
        if online_keys:
            for raw in await async_cache.mget(online_keys):
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                    user_id = entry.get("user_id")
                    # Only include if user is not currently playing a game
                    if user_id and int(user_id) not in playing_user_ids:
                        entries.append(entry)
                except ValueError:
                    continue

        return entries

    async def get_active_for_rom(self, rom_id: int) -> list[ActivityEntry]:
        """Get all active play sessions for a specific ROM."""
        rom_key = self._rom_index_key(rom_id)
        members = await async_cache.smembers(rom_key)
        entries: list[ActivityEntry] = []
        stale_members: list[str] = []

        for member in members:
            try:
                user_id_str, device_id = member.rsplit(":", 1)
                user_id = int(user_id_str)
            except (ValueError, AttributeError):
                stale_members.append(member)
                continue

            raw = await async_cache.get(self._activity_key(user_id, device_id))
            if not raw:
                # Key expired; clean up the stale set member.
                stale_members.append(member)
                continue
            try:
                entries.append(json.loads(raw))
            except ValueError:
                stale_members.append(member)

        if stale_members:
            await async_cache.srem(rom_key, *stale_members)

        return entries


activity_handler = ActivityHandler()

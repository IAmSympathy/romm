import re
from datetime import datetime, timezone

path = "/backend/endpoints/states.py"
content = open(path).read()

old_add_state_start = "@protected_route(router.post, \"\", [Scope.ASSETS_WRITE])"
old_add_state_end = "    # Set the last played time for the current user"

start_idx = content.find(old_add_state_start)
end_idx = content.find(old_add_state_end)

if start_idx != -1 and end_idx != -1:
    new_add_state = """@protected_route(router.post, "", [Scope.ASSETS_WRITE])
async def add_state(
    request: Request,
    rom_id: int,
    emulator: str | None = None,
    stateFile: UploadFile = STATE_FILE_UPLOAD,
    screenshotFile: UploadFile | None = STATE_SCREENSHOT_UPLOAD,
) -> StateSchema:
    check_asset_upload_size(stateFile, "State file")
    check_asset_upload_size(screenshotFile, "Screenshot file")

    rom = db_rom_handler.get_rom(rom_id)
    if not rom:
        raise RomNotFoundInDatabaseException(rom_id)

    log.info(f"Uploading state of {rom.name}")

    is_arcade = (rom.platform.fs_slug == "arcade")

    if is_arcade:
        sanitized_state_filename = sanitize_filename(f"{rom.name} (Public Highscore).state")
    else:
        if not stateFile.filename:
            log.error("State file has no filename")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="State file has no filename"
            )
        try:
            sanitized_state_filename = sanitize_filename(stateFile.filename)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid state filename: {str(exc)}",
            ) from exc

    log.info(
        f"Uploading state {hl(sanitized_state_filename)} for {hl(str(rom.name), color=BLUE)}"
    )

    states_path = fs_asset_handler.build_states_file_path(
        user=request.user,
        platform_fs_slug=rom.platform.fs_slug,
        rom_id=rom.id,
        emulator=emulator,
    )

    await fs_asset_handler.write_file(
        file=stateFile, path=states_path, filename=sanitized_state_filename
    )

    # Scan state
    scanned_state = await scan_state(
        file_name=sanitized_state_filename,
        user=request.user,
        platform_fs_slug=rom.platform.fs_slug,
        rom_id=rom_id,
        emulator=emulator,
    )

    if is_arcade:
        # ARCADE EMULATOR-DEPENDENT OVERRIDE ENGINE:
        # 1 single global highscore state per (ROM + Emulator Core) combination!
        from models.assets import State
        from decorators.database import sync_session
        with sync_session.begin() as db_session:
            existing_states = db_session.scalars(
                select(State).filter_by(rom_id=rom.id, emulator=emulator)
            ).all()

        if existing_states:
            db_state = existing_states[0]
            db_state = db_state_handler.update_state(
                db_state.id,
                {
                    "file_name": sanitized_state_filename,
                    "file_size_bytes": scanned_state.file_size_bytes,
                    "user_id": request.user.id,
                    "emulator": emulator,
                    "is_public": True,
                    "updated_at": datetime.now(timezone.utc),
                },
            )
            for extra_state in existing_states[1:]:
                db_state_handler.delete_state(extra_state.id)
        else:
            scanned_state.rom_id = rom.id
            scanned_state.user_id = request.user.id
            scanned_state.emulator = emulator
            scanned_state.is_public = True
            scanned_state.file_name = sanitized_state_filename
            db_state = db_state_handler.add_state(state=scanned_state)
    else:
        db_state = db_state_handler.get_state_by_filename(
            user_id=request.user.id, rom_id=rom.id, file_name=sanitized_state_filename
        )
        if db_state:
            db_state = db_state_handler.update_state(
                db_state.id,
                {
                    "file_size_bytes": scanned_state.file_size_bytes,
                    "is_public": db_state.is_public,
                },
            )
        else:
            scanned_state.rom_id = rom.id
            scanned_state.user_id = request.user.id
            scanned_state.emulator = emulator
            db_state = db_state_handler.add_state(state=scanned_state)

    if screenshotFile and screenshotFile.filename:
        if is_arcade:
            sanitized_screenshot_filename = sanitize_filename(f"{rom.name} (Public Highscore).png")
        else:
            try:
                sanitized_screenshot_filename = sanitize_filename(screenshotFile.filename)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid screenshot filename: {str(exc)}",
                ) from exc

        screenshots_path = fs_asset_handler.build_screenshots_file_path(
            user=request.user, platform_fs_slug=rom.platform_slug, rom_id=rom.id
        )

        await fs_asset_handler.write_file(
            file=screenshotFile,
            path=screenshots_path,
            filename=sanitized_screenshot_filename,
        )

        # Scan screenshot
        scanned_screenshot = await scan_screenshot(
            file_name=sanitized_screenshot_filename,
            user=request.user,
            platform_fs_slug=rom.platform_slug,
            rom_id=rom.id,
        )

        if is_arcade:
            from models.assets import Screenshot
            with sync_session.begin() as db_session:
                existing_ss = db_session.scalars(
                    select(Screenshot).filter_by(rom_id=rom.id)
                ).all()

            if existing_ss:
                db_screenshot = existing_ss[0]
                db_screenshot = db_screenshot_handler.update_screenshot(
                    db_screenshot.id,
                    {
                        "file_name": sanitized_screenshot_filename,
                        "file_name_no_ext": f"{rom.name} (Public Highscore)",
                        "file_size_bytes": scanned_screenshot.file_size_bytes,
                        "user_id": request.user.id,
                        "is_public": True,
                        "updated_at": datetime.now(timezone.utc),
                    },
                )
                for extra_ss in existing_ss[1:]:
                    db_screenshot_handler.delete_screenshot(extra_ss.id)
            else:
                scanned_screenshot.rom_id = rom.id
                scanned_screenshot.user_id = request.user.id
                scanned_screenshot.is_public = True
                scanned_screenshot.file_name = sanitized_screenshot_filename
                scanned_screenshot.file_name_no_ext = f"{rom.name} (Public Highscore)"
                db_screenshot = db_screenshot_handler.add_screenshot(
                    screenshot=scanned_screenshot
                )
        else:
            db_screenshot = db_screenshot_handler.get_screenshot(
                file_name=sanitized_screenshot_filename,
                rom_id=rom.id,
                user_id=request.user.id,
            )
            if db_screenshot:
                db_screenshot = db_screenshot_handler.update_screenshot(
                    db_screenshot.id,
                    {"file_size_bytes": scanned_screenshot.file_size_bytes},
                )
            else:
                scanned_screenshot.rom_id = rom.id
                scanned_screenshot.user_id = request.user.id
                db_screenshot = db_screenshot_handler.add_screenshot(
                    screenshot=scanned_screenshot
                )

"""
    content = content[:start_idx] + new_add_state + content[end_idx:]
    open(path, "w").write(content)
    print("  ✓ Arcade emulator-dependent single-state override patch applied to states.py")
else:
    print("  ✓ states.py already patched or pattern not found")

from unittest.mock import AsyncMock, patch

from fastapi import status
from fastapi.testclient import TestClient

from handler.activity_handler import activity_handler
from models.user import User


def test_presence_heartbeat_refreshes_authenticated_browser(
    client: TestClient, access_token: str, admin_user: User
):
    with patch.object(
        activity_handler, "set_online", new_callable=AsyncMock
    ) as set_online:
        response = client.post(
            "/api/activity/presence",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    set_online.assert_awaited_once_with(
        admin_user.id,
        admin_user.username,
        admin_user.avatar_path or "",
    )

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RetroAchievementsManager } from "./RetroAchievementsManager";
import type { RetroAchievementsClient } from "./RetroAchievementsClient";

vi.mock("./RetroAchievementsRuntime", () => ({
  raRuntime: {
    initialize: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

describe("RetroAchievementsManager Notification Logic", () => {
  let manager: RetroAchievementsManager;
  let mockClient: Partial<RetroAchievementsClient>;

  beforeEach(() => {
    mockClient = {
      getGameIdByHash: vi.fn(),
      getPatchData: vi.fn(),
      getUnlocks: vi.fn(),
    };
    manager = new RetroAchievementsManager(mockClient as RetroAchievementsClient);
  });

  it("triggers auth_failed notification if user credentials are missing", async () => {
    const success = await manager.initializeSession(null, { id: 1, name: "Test ROM" });
    expect(success).toBe(false);
    expect(manager.notifications.value).toHaveLength(1);
    expect(manager.notifications.value[0].type).toBe("auth_failed");
    expect(manager.notifications.value[0].title).toBe("Connexion RetroAchievements échouée");
  });

  it("triggers auth_success and rom_unknown notification when game ID is unrecognized", async () => {
    (mockClient.getGameIdByHash as any).mockResolvedValue(null);

    const user = { id: 1, ra_username: "PlayerOne", ra_token: "secret_token" };
    const rom = { id: 10, name: "Unknown ROM", files: [{ md5_hash: "12345" }] };

    const success = await manager.initializeSession(user, rom);
    expect(success).toBe(false);

    expect(manager.notifications.value).toHaveLength(2);
    expect(manager.notifications.value[0].type).toBe("rom_unknown");
    expect(manager.notifications.value[0].subtitle).toBe("Jeu non reconnu par RetroAchievements");
    expect(manager.notifications.value[1].type).toBe("auth_success");
  });

  it("triggers set_unsupported notification when game is known but has no active set", async () => {
    (mockClient.getGameIdByHash as any).mockResolvedValue(100);
    (mockClient.getPatchData as any).mockResolvedValue({
      gameId: 100,
      title: "Unsupported Game",
      achievements: [],
    });
    (mockClient.getUnlocks as any).mockResolvedValue(new Set());

    const user = { id: 1, ra_username: "PlayerOne", ra_token: "secret_token" };
    const rom = { id: 10, name: "Test ROM", files: [{ md5_hash: "12345" }] };

    const success = await manager.initializeSession(user, rom);
    expect(success).toBe(false);

    expect(manager.notifications.value[0].type).toBe("set_unsupported");
    expect(manager.notifications.value[0].subtitle).toBe("Ce jeu n'a pas de set RetroAchievements actif");
  });

  it("triggers game_detected notification with correct progress percentage", async () => {
    (mockClient.getGameIdByHash as any).mockResolvedValue(200);
    (mockClient.getPatchData as any).mockResolvedValue({
      gameId: 200,
      title: "Super Mario World",
      iconUrl: "/api/users/ra/badge/123.png",
      achievements: [
        { id: 1, title: "Ach 1", description: "Desc 1", points: 5, badgeName: "b1", unlocked: false },
        { id: 2, title: "Ach 2", description: "Desc 2", points: 10, badgeName: "b2", unlocked: false },
      ],
    });
    (mockClient.getUnlocks as any).mockResolvedValue(new Set([1]));

    const user = { id: 1, ra_username: "PlayerOne", ra_token: "secret_token" };
    const rom = { id: 10, name: "Super Mario World", files: [{ md5_hash: "12345" }] };

    const success = await manager.initializeSession(user, rom);
    expect(success).toBe(true);

    const gameNotif = manager.notifications.value.find((n) => n.type === "game_detected");
    expect(gameNotif).toBeDefined();
    expect(gameNotif?.title).toBe("Super Mario World");
    expect(gameNotif?.subtitle).toBe("1 / 2 achievements débloqués (50%)");
  });

  it("formats achievement unlock notification correctly without points in title", () => {
    manager.activePatch.value = {
      gameId: 200,
      title: "Test Game",
      achievements: [
        { id: 1, title: "Shrooooms...", description: "Collect 10 mushrooms", points: 5, badgeName: "b1", unlocked: false },
        { id: 2, title: "Master", description: "Beat the game", points: 20, badgeName: "b2", unlocked: false },
      ],
    };

    manager.triggerUnlock(1);

    const unlockNotif = manager.notifications.value[0];
    expect(unlockNotif.type).toBe("achievement_unlocked");
    expect(unlockNotif.title).toBe("Shrooooms...");
    expect(unlockNotif.subtitle).toBe("Collect 10 mushrooms");
    expect(unlockNotif.points).toBe(5);
  });

  it("triggers 100% completion notification when final achievement is unlocked", () => {
    manager.activePatch.value = {
      gameId: 200,
      title: "Test Game",
      achievements: [
        { id: 1, title: "Shrooooms...", description: "Collect 10 mushrooms", points: 5, badgeName: "b1", unlocked: true },
        { id: 2, title: "Master", description: "Beat the game", points: 20, badgeName: "b2", unlocked: false },
      ],
    };

    manager.triggerUnlock(2);

    expect(manager.notifications.value[0].type).toBe("set_completed");
    expect(manager.notifications.value[0].title).toBe("Set terminé à 100% !");
    expect(manager.notifications.value[0].subtitle).toBe("Félicitations, tous les achievements sont débloqués !");
  });
});

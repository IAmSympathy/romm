export interface RACredentials {
  username: string;
  token: string;
}

export interface RAAchievement {
  id: number;
  title: string;
  description: string;
  points: number;
  badgeName: string;
  badgeUrl?: string;
  unlocked: boolean;
  unlockedHardcore?: boolean;
}

export interface RAPatchData {
  gameId: number;
  title: string;
  achievements: RAAchievement[];
}

export type RANotificationType =
  | "auth_success"
  | "auth_failed"
  | "game_detected"
  | "rom_unknown"
  | "achievement_unlocked";

export interface RANotificationItem {
  id: string;
  type: RANotificationType;
  title: string;
  subtitle?: string;
  points?: number;
  badgeUrl?: string;
  icon?: string;
  duration?: number;
}

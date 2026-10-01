import type { Category } from "../types/recruitment";

export const DATA_CENTRE = {
  Aether: "Aether (NA)",
  Crystal: "Crystal (NA)",
  Dynamis: "Dynamis (NA)",
  Primal: "Primal (NA)",
  Chaos: "Chaos (EU)",
  Light: "Light (EU)",
  Elemental: "Elemental (JP)",
  Gaia: "Gaia (JP)",
  Mana: "Mana (JP)",
  Meteor: "Meteor (JP)",
  Materia: "Materia (OC)",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  DutyRoulette: "随机任务",
  Dungeons: "迷宫挑战",
  Guildhests: "行会令",
  Trials: "讨伐歼灭战",
  Raids: "大型任务",
  HighEndDuty: "高难度任务",
  Pvp: "对战",
  GoldSaucer: "金碟游乐场",
  Fates: "危命任务",
  TreasureHunt: "寻宝",
  TheHunt: "怪物狩猎",
  GatheringForays: "采集活动",
  DeepDungeons: "深层迷宫",
  AdventuringForays: "特殊场景探索",
  None: "其他",
  "V&C Dungeon Finder": "特殊迷宫探索",
};

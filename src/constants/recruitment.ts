import type { Category } from "../types/recruitment";

export const DATA_CENTRE_LABEL = {
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
} as const;

export const CATEGORIES = [
  "DutyRoulette",
  "Dungeons",
  "Guildhests",
  "Trials",
  "Raids",
  "HighEndDuty",
  "Pvp",
  "GoldSaucer",
  "Fates",
  "TreasureHunt",
  "TheHunt",
  "GatheringForays",
  "DeepDungeons",
  "AdventuringForays",
  "None",
  "V&C Dungeon Finder",
] as const satisfies readonly Category[];

export const RECRUITMENT_TAGS = [
  "None",
  "Duty Completion",
  "Practice",
  "Loot",
  "Duty Complete",
  "One Player per Job",
] as const;

export type RecruitmentTag = (typeof RECRUITMENT_TAGS)[number];

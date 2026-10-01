export interface Recruitment {
  id: string;
  duty: string; // 副本名称 (e.g., "Dancing Mad (Ultimate)")
  description: string; // 招募描述原文
  category: Category; // 分类 (e.g., "HighEndDuty")
  dataCentre: string; // 数据中心 (e.g., "Mana")
  minIlvl: string; // 最低装等
  slots: Slot[]; // 招募对象
  current: number; // 当前已招募人数
  total: number; // 队伍总人数
  creator: string; // 招募发起人 (e.g., "Rue Bergamot @ Chocobo")
  world: string; // 服务器 (e.g., "Chocobo")
  expires: string; // 剩余时间 (e.g., "in 2 minutes")
  rawText: string; // 用于正则匹配的拼接文本
}

export type Category =
  | "DutyRoulette"
  | "Dungeons"
  | "Guildhests"
  | "Trials"
  | "Raids"
  | "HighEndDuty"
  | "Pvp"
  | "GoldSaucer"
  | "Fates"
  | "TreasureHunt"
  | "TheHunt"
  | "GatheringForays"
  | "DeepDungeons"
  | "AdventuringForays"
  | "V&C Dungeon Finder"
  | "None";

export interface Slot {
  filled: boolean;
  role: SlotRole[]; // 可接受职业角色 (如 ["tank", "healer", "dps"])
  acceptedJobs: Job[]; // 空缺时列出可接受职业，如 ["PLD", "SMN", "RDM", "GNB"]；否则显示当前已填充的职业列表，如 ["PLD"]
}

export type SlotRole =
  | "tank"
  | "healer"
  | "dps"
  | "empty" // 任意职业，或团队小队占位符
  | "none"; // 团队空白占位符

export type Job =
  | "PLD"
  | "GLA"
  | "WAR"
  | "MRD"
  | "DRK"
  | "GNB"
  | "WHM"
  | "CNJ"
  | "SCH"
  | "AST"
  | "SGE"
  | "MNK"
  | "PGL"
  | "DRG"
  | "LNC"
  | "NIN"
  | "ROG"
  | "SAM"
  | "RPR"
  | "VPR"
  | "BSM"
  | "BRD"
  | "ARC"
  | "MCH"
  | "DNC"
  | "BLM"
  | "THM"
  | "SMN"
  | "ACN"
  | "RDM"
  | "PCT"
  | "BLU";

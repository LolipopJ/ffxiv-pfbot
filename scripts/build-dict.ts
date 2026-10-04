import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

import {
  normalizeDictionaryKey,
  TARGET_LANGUAGES,
} from "../src/locales/utils/config";

export interface DictSourceConfig {
  fileName: string;
  column: string;
  fieldName: string;
  // Filters receive the normalized English dictionary key.
  filter?: (key: string) => boolean;
}

export interface DictSource extends DictSourceConfig {
  englishCsv: string;
  targetCsv: string;
}

export interface DictStats {
  missing: number;
  conflicts: number;
  cleaned: number;
  unsupported: number;
}

// Add CSV sources here; later sources override earlier mappings.
const SOURCES: readonly DictSourceConfig[] = [
  { fileName: "ContentFinderCondition.csv", column: "43", fieldName: "Name" },
  { fileName: "ContentType.csv", column: "0", fieldName: "Name" },
  {
    fileName: "EventItem.csv",
    column: "0",
    fieldName: "Singular",
    filter: (key) =>
      key.endsWith("treasure map") || key.endsWith("thief's map"),
  },
];

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  csv = csv.replace(/^\uFEFF/, "");
  for (let index = 0; index < csv.length; index++) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && csv[index + 1] === "\n") index++;
    } else field += character;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field.");
  if (row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readTexts(csv: string, source: DictSourceConfig): Map<string, string> {
  const rows = parseCsv(csv);
  const keyIndex = rows[0]?.indexOf("key") ?? -1;
  const textIndex = rows[0]?.indexOf(source.column) ?? -1;
  if (
    keyIndex < 0 ||
    textIndex < 0 ||
    rows[1]?.[textIndex] !== source.fieldName
  ) {
    throw new Error(
      `${source.fileName} must contain key and column ${source.column} (${source.fieldName}).`,
    );
  }
  const texts = new Map<string, string>();
  // Skip column numbers, column names, offsets, and types.
  for (const row of rows.slice(4)) {
    const key = row[keyIndex];
    const text = row[textIndex];
    if (key === undefined || text === undefined || texts.has(key)) {
      throw new Error(
        `Incomplete or duplicate ${source.fileName} row: ${key}.`,
      );
    }
    texts.set(key, text);
  }
  return texts;
}

export function cleanGameText(text: string): string | null {
  // SeString macros: italic on/off, soft hyphen, and non-breaking space.
  // https://dalamud.dev/plugin-development/sestring/#macros
  const cleaned = text
    .replace(/<hex:021A020[12]03>|<hex:02160103>/gi, "")
    .replace(/<hex:021D0103>/gi, " ")
    .trim();
  return /<hex:/i.test(cleaned) ? null : cleaned;
}

function mapTexts(
  sources: readonly (DictSourceConfig & {
    englishTexts: Map<string, string>;
    targetTexts: Map<string, string>;
  })[],
  stats: DictStats,
): Record<string, string> {
  const entries = new Map<string, string>();
  for (const { englishTexts, targetTexts, filter } of sources) {
    for (const [key, english] of englishTexts) {
      const sourceText = cleanGameText(english);
      if (!sourceText) continue;
      const name = normalizeDictionaryKey(sourceText);
      if (filter && !filter(name)) continue;
      const target = targetTexts.get(key);
      if (!target?.trim()) {
        stats.missing++;
        continue;
      }
      const translated = cleanGameText(target);
      if (translated === null) {
        stats.unsupported++;
        continue;
      }
      if (!translated) {
        stats.missing++;
        continue;
      }
      if (target !== translated) stats.cleaned++;
      if (entries.has(name) && entries.get(name) !== translated)
        stats.conflicts++;
      entries.set(name, translated);
    }
  }
  // Sort without locale-dependent collation for reproducible output.
  return Object.fromEntries(
    [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

export function buildDict(
  sources: readonly DictSource[],
  stats: DictStats = { missing: 0, conflicts: 0, cleaned: 0, unsupported: 0 },
): Record<string, string> {
  return mapTexts(
    sources.map((source) => ({
      ...source,
      englishTexts: readTexts(source.englishCsv, source),
      targetTexts: readTexts(source.targetCsv, source),
    })),
    stats,
  );
}

if (import.meta.main) {
  const englishSources = await Promise.all(
    SOURCES.map(async (source) => ({
      ...source,
      englishTexts: readTexts(
        await readFile(
          new URL(`../ffxiv-data/en/${source.fileName}`, import.meta.url),
          "utf8",
        ),
        source,
      ),
    })),
  );
  // Finish parsing and formatting every language before replacing any output.
  const outputs = await Promise.all(
    TARGET_LANGUAGES.map(async (language) => {
      const sources = await Promise.all(
        englishSources.map(async (source) => ({
          ...source,
          targetTexts: readTexts(
            await readFile(
              new URL(
                `../ffxiv-data/${language.toLowerCase()}/${source.fileName}`,
                import.meta.url,
              ),
              "utf8",
            ),
            source,
          ),
        })),
      );
      const stats: DictStats = {
        missing: 0,
        conflicts: 0,
        cleaned: 0,
        unsupported: 0,
      };
      const dict = mapTexts(sources, stats);
      const output = new URL(
        `../src/locales/generated/${language.toLowerCase()}.ts`,
        import.meta.url,
      );
      const source = `// Generated by scripts/build-dict.ts. Do not edit manually.\nexport const DICT: Readonly<Record<string, string>> = ${JSON.stringify(dict, null, 2)};\nexport default DICT;\n`;
      const formatted = await format(source, {
        ...(await resolveConfig(fileURLToPath(output))),
        parser: "typescript",
      });
      return {
        language,
        output,
        formatted,
        mappings: Object.keys(dict).length,
        stats,
      };
    }),
  );
  await mkdir(new URL("../src/locales/generated/", import.meta.url), {
    recursive: true,
  });
  for (const { language, output, formatted, mappings, stats } of outputs) {
    await writeFile(output, formatted, "utf8");
    console.log(`${language}: ${mappings} mappings; ${JSON.stringify(stats)}.`);
  }
}

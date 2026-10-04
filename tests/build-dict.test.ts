import { expect, test } from "bun:test";

import {
  buildDict,
  cleanGameText,
  type DictSource,
  type DictStats,
} from "../scripts/build-dict";

function csv(entries: [string, string][], fieldName = "Name") {
  return (
    `\uFEFFkey,0\r\n#,${fieldName}\r\noffset,0\r\nInt32,String\r\n` +
    entries
      .map(
        ([key, text]) =>
          `${key},${JSON.stringify(text).replace(/\\"/g, '""').replace(/\\n/g, "\n")}`,
      )
      .join("\r\n")
  );
}

function source(
  english: [string, string][],
  target: [string, string][],
): DictSource {
  return {
    fileName: "Example.csv",
    column: "0",
    fieldName: "Name",
    englishCsv: csv(english),
    targetCsv: csv(target),
  };
}

test("dictionary joins row IDs and parses quoted commas, line breaks and escaped quotes", () => {
  const dict = buildDict([
    source(
      [
        ["1", ' Trial, "Extreme" '],
        ["2", "Another\nTrial"],
      ],
      [
        ["2", "Autre\nÉpreuve"],
        ["1", 'Défi, "Extrême"'],
      ],
    ),
  ]);
  expect(dict).toEqual({
    'trial, "extreme"': 'Défi, "Extrême"',
    "another\ntrial": "Autre\nÉpreuve",
  });
});

test("missing, blank and unsupported translations preserve earlier mappings and report stats", () => {
  const stats: DictStats = {
    missing: 0,
    conflicts: 0,
    cleaned: 0,
    unsupported: 0,
  };
  expect(
    buildDict(
      [
        source(
          [
            ["1", "Trial"],
            ["2", "Missing"],
            ["3", "Blank"],
          ],
          [
            ["1", "Défi"],
            ["3", " "],
          ],
        ),
        source(
          [
            ["1", "Trial"],
            ["2", "Unknown"],
          ],
          [
            ["1", ""],
            ["2", "<hex:FFFFFFFF>Text"],
          ],
        ),
      ],
      stats,
    ),
  ).toEqual({ trial: "Défi" });
  expect(stats).toMatchObject({ missing: 3, unsupported: 1, conflicts: 0 });
});

test("later nonempty mappings win, filters use normalized English, and output is sorted", () => {
  const stats: DictStats = {
    missing: 0,
    conflicts: 0,
    cleaned: 0,
    unsupported: 0,
  };
  const dict = buildDict(
    [
      source(
        [
          ["1", " Z Trial "],
          ["2", "A Trial"],
        ],
        [
          ["1", "First"],
          ["2", "Alpha"],
        ],
      ),
      {
        ...source(
          [
            ["1", "Z Trial"],
            ["2", "Item"],
          ],
          [
            ["1", "Last"],
            ["2", "Excluded"],
          ],
        ),
        filter: (key) => key.endsWith("trial"),
      },
    ],
    stats,
  );
  expect(dict).toEqual({ "a trial": "Alpha", "z trial": "Last" });
  expect(Object.keys(dict)).toEqual(["a trial", "z trial"]);
  expect(stats.conflicts).toBe(1);
});

test("game text removes formatting and soft hyphens but keeps non-breaking space separation", () => {
  expect(cleanGameText("For<hex:02160103>schungs<hex:02160103>labor")).toBe(
    "Forschungslabor",
  );
  expect(cleanGameText("Le Diadème<hex:021D0103>: exploration")).toBe(
    "Le Diadème : exploration",
  );
  expect(cleanGameText("<hex:021A020203>Italic<hex:021A020103>")).toBe(
    "Italic",
  );
  expect(cleanGameText("Bad<hex:ABCD>")).toBeNull();
});

test("malformed CSV, mismatched columns and duplicate row IDs fail the build", () => {
  const valid = source([["1", "Trial"]], [["1", "Défi"]]);
  expect(() =>
    buildDict([{ ...valid, targetCsv: valid.targetCsv + '\n2,"unfinished' }]),
  ).toThrow("Unterminated");
  expect(() =>
    buildDict([{ ...valid, targetCsv: csv([["1", "Défi"]], "Wrong") }]),
  ).toThrow("Name");
  expect(() =>
    buildDict([{ ...valid, targetCsv: valid.targetCsv + "\n2" }]),
  ).toThrow("Incomplete");
  expect(() =>
    buildDict([
      {
        ...valid,
        targetCsv: csv([
          ["1", "One"],
          ["1", "Two"],
        ]),
      },
    ]),
  ).toThrow("duplicate");
});

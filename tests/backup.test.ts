import { describe, it } from "node:test";
import assert from "node:assert";
import {
  safeFileName,
  boardDirectoryName,
  runDirectoryName,
  backoffDelays,
  planBackup
} from "../src/backup.js";
import type { MiroBoardSummary } from "../src/boards.ts";

const board = (overrides: Partial<MiroBoardSummary>): MiroBoardSummary => ({
  id: "uXjVEXAMPLE0=",
  title: "A board",
  description: "",
  url: "https://miro.com/app/board/uXjVEXAMPLE0=/",
  starred: false,
  trashed: false,
  owner: {},
  ...overrides
});

describe("safeFileName", () => {
  it("turns slashes into something a filesystem accepts", () => {
    assert.equal(
      safeFileName("Prod / Dev / QA / Demo Architecture"),
      "Prod-Dev-QA-Demo Architecture"
    );
    assert.equal(safeFileName("back\\slash"), "back-slash");
  });

  it("replaces the characters Windows reserves", () => {
    assert.equal(safeFileName('a<b>c:d"e|f?g*h'), "a-b-c-d-e-f-g-h");
  });

  it("strips control characters", () => {
    assert.equal(safeFileName("line\nbreak\ttab"), "line break tab");
  });

  it("does not end with a dot or space, which Windows silently drops", () => {
    assert.equal(safeFileName("Trailing dot."), "Trailing dot");
    assert.equal(safeFileName("  padded  "), "padded");
    assert.equal(safeFileName("dots..."), "dots");
  });

  it("keeps names that are already fine", () => {
    assert.equal(safeFileName("Product Roadmap"), "Product Roadmap");
  });

  it("falls back for names that sanitise away to nothing", () => {
    assert.equal(safeFileName(""), "untitled");
    assert.equal(safeFileName("///"), "untitled");
    assert.equal(safeFileName("   "), "untitled");
  });

  it("avoids names Windows reserves outright", () => {
    assert.equal(safeFileName("CON"), "CON-board");
    assert.equal(safeFileName("nul"), "nul-board");
    assert.equal(safeFileName("COM1"), "COM1-board");
    // only a problem on its own
    assert.equal(safeFileName("CONTROL"), "CONTROL");
  });

  it("shortens very long titles without leaving a trailing separator", () => {
    const name = safeFileName(`${"x".repeat(200)} / tail`);

    assert.ok(
      name.length <= 80,
      `expected <= 80 characters, got ${name.length}`
    );
    assert.ok(
      !/[-.\s]$/.test(name),
      `unexpected trailing separator in ${name}`
    );
  });

  it("collapses runs of separators", () => {
    assert.equal(safeFileName("a // b -- c"), "a-b-c");
  });
});

describe("boardDirectoryName", () => {
  it("combines the title with the board ID so titles can repeat", () => {
    // the ID is kept verbatim (padding "=" is legal in a path) so a directory
    // can still be matched back to its board
    assert.equal(
      boardDirectoryName({
        id: "uXjVEXAMPLE1=",
        title: "Design System"
      }),
      "Design System--uXjVEXAMPLE1="
    );
  });

  it("still produces a usable name for an untitled board", () => {
    assert.equal(
      boardDirectoryName({ id: "abc=", title: "" }),
      "untitled--abc="
    );
  });

  it("keeps two same-titled boards apart", () => {
    const first = boardDirectoryName({ id: "aaa=", title: "Domain" });
    const second = boardDirectoryName({ id: "bbb=", title: "Domain" });

    assert.notEqual(first, second);
  });
});

describe("runDirectoryName", () => {
  it("is sortable and free of characters Windows rejects", () => {
    const name = runDirectoryName(new Date("2026-08-14T12:15:30.123Z"));

    assert.equal(name, "2026-08-14T12-15-30Z");
    assert.ok(!name.includes(":"));
  });
});

describe("backoffDelays", () => {
  it("doubles the delay for each further attempt", () => {
    assert.deepEqual(backoffDelays(3, 15_000), [15_000, 30_000]);
    assert.deepEqual(backoffDelays(4, 1_000), [1_000, 2_000, 4_000]);
  });

  it("has no delays when only one attempt is allowed", () => {
    assert.deepEqual(backoffDelays(1, 15_000), []);
  });

  it("caps the wait so one bad board cannot stall a long run", () => {
    const delays = backoffDelays(10, 60_000);

    assert.ok(delays.every((delay) => delay <= 5 * 60_000));
    assert.equal(delays.at(-1), 5 * 60_000);
  });
});

describe("planBackup", () => {
  const boards = [
    board({ id: "1=", title: "Product scope" }),
    board({ id: "2=", title: "Product demo flows" }),
    board({ id: "3=", title: "Team Retro" })
  ];

  it("returns every board by default", () => {
    assert.equal(planBackup(boards, {}).length, 3);
  });

  it("filters by title, case insensitively", () => {
    assert.deepEqual(
      planBackup(boards, { query: "PRODUCT" }).map(({ id }) => id),
      ["1=", "2="]
    );
  });

  it("applies the limit after filtering", () => {
    assert.deepEqual(
      planBackup(boards, { query: "product", limit: 1 }).map(({ id }) => id),
      ["1="]
    );
  });

  it("ignores a limit larger than the number of boards", () => {
    assert.equal(planBackup(boards, { limit: 99 }).length, 3);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert";
import { listBoards } from "../src/boards.js";
import { MiroBoard } from "../src/index.js";
import { resolveToken } from "../src/env.js";

/**
 * Integration tests that talk to the real Miro API using the token from
 * MIRO_TOKEN (or a .env file). They are skipped when no token is available.
 */
const token = resolveToken();
const skip = token ? false : "MIRO_TOKEN is not set";

describe("listBoards (live)", { skip }, () => {
  it("lists the boards the token can access", async () => {
    const boards = await listBoards();

    assert.ok(Array.isArray(boards));
    assert.ok(boards.length > 0, "expected the token to have access to boards");

    for (const board of boards) {
      assert.ok(board.id, "every board should have an ID");
      assert.equal(typeof board.title, "string");
      assert.equal(board.url, `https://miro.com/app/board/${board.id}/`);
      assert.equal(board.trashed, false);
    }

    const ids = boards.map(({ id }) => id);
    assert.equal(new Set(ids).size, ids.length, "board IDs should be unique");
  });

  it("returns the same boards when paging in small pages", async () => {
    const [inOneGo, paged] = await Promise.all([
      listBoards(),
      listBoards({ pageSize: 25 })
    ]);

    const pagedIds = new Set(paged.map(({ id }) => id));

    assert.ok(paged.length > 0);
    for (const { id } of paged) {
      assert.ok(
        inOneGo.some((board) => board.id === id),
        `paged result ${id} missing from the full listing`
      );
    }
    assert.ok(pagedIds.size === paged.length);
  });

  it("rejects an invalid token", async () => {
    await assert.rejects(
      () => listBoards({ token: "not-a-real-token" }),
      /Miro rejected the token \(HTTP 401/
    );
  });

  it(
    "can open a listed board in the browser",
    { timeout: 180_000 },
    async () => {
      const boardId =
        process.env.MIRO_LIVE_BOARD_ID ?? (await listBoards())[0]?.id;
      assert.ok(boardId, "no board available to open");

      await using miroBoard = new MiroBoard({ boardId });

      const objects = await miroBoard.getBoardObjects({});
      assert.ok(Array.isArray(objects));
    }
  );
});

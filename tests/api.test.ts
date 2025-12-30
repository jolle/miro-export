import { describe, it, after } from "node:test";
import assert from "node:assert";
import { MiroBoard } from "../src";

const boardId = process.env.TEST_BOARD_ID;
const inaccessibleBoardId = process.env.PRIVATE_TEST_BOARD_ID;
const buggyBoardId = process.env.BUGGY_TEST_BOARD_ID;

if (!boardId) {
  console.error("TEST_BOARD_ID environment variable is required.");
  process.exit(1);
}

if (!inaccessibleBoardId) {
  console.error("PRIVATE_TEST_BOARD_ID environment variable is required.");
  process.exit(1);
}

if (!buggyBoardId) {
  console.error("BUGGY_TEST_BOARD_ID environment variable is required.");
  process.exit(1);
}

describe("Miro integration", async () => {
  const miroBoard = new MiroBoard({ boardId });

  after(async () => {
    await miroBoard.dispose();
  });

  await it("should get all objects", async () => {
    const objects = await miroBoard.getBoardObjects({});

    assert.ok(
      objects.find(
        (obj) => obj.type === "sticky_note" && obj.content === "<p>Test 1</p>"
      )
    );
  });

  await it("should filter objects by type = 'frame'", async () => {
    const frames = await miroBoard.getBoardObjects({ type: "frame" });

    assert.ok(frames.length > 0);
    assert.ok(frames.every((frame) => frame.type === "frame"));
  });

  await it("should filter objects by title = 'Frame 1'", async () => {
    const objects = await miroBoard.getBoardObjects({}, { title: "Frame 1" });

    assert.ok(
      objects.find((obj) => obj.type === "frame" && obj.title === "Frame 1")
    );
  });

  await it("should get SVG for entire board", async () => {
    const svg = await miroBoard.getSvg();

    assert.ok(svg.includes("<svg"));
    assert.ok(svg.includes("Card text"));
    assert.ok(svg.includes("STAR"));
    assert.ok(svg.length > 50_000);
  });

  await it("should get SVG for specific frame", async () => {
    const frames = await miroBoard.getBoardObjects(
      { type: "frame" },
      { title: "Frame 2" }
    );
    const frameId = frames[0].id;
    assert.ok(frameId);

    const svg = await miroBoard.getSvg([frameId]);

    assert.ok(svg.includes("<svg"));
    assert.ok(!svg.includes("Card text"));
    assert.ok(svg.includes("STAR"));
    assert.ok(svg.length > 10_000);
  });
});

await it("should throw error for a non-public board", async () => {
  try {
    const miroBoard = new MiroBoard({ boardId: inaccessibleBoardId });
    await miroBoard.getBoardObjects({});
    assert.fail();
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.equal(
      err.message,
      "Miro board requires authentication. Check board access settings to allow anonymous access or supply a token."
    );
  }
});

await it("should be able to export SVG of a buggy Miro board", async () => {
  // this is a flaky issue on Miro; around 10% of the time the board loads fine
  // so let's repeat this test a couple of times just to be sure
  for (let i = 0; i < 3; i++) {
    const miroBoard = new MiroBoard({
      boardId: buggyBoardId,
      boardLoadTimeoutMs: 30_000
    });
    try {
      const svg = await miroBoard.getSvg();
      const hasSvgContents = svg.includes("What should we do next?");
      assert.ok(hasSvgContents);
    } finally {
      await miroBoard.dispose();
    }
  }
});

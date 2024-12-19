import { describe, it, after } from "node:test";
import assert from "node:assert";
import { MiroBoard } from "../src";

const boardId = process.env.TEST_BOARD_ID;

if (!boardId) {
  console.error("TEST_BOARD_ID environment variable is required.");
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

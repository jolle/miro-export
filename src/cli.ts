import { writeFile } from "fs/promises";
import { program } from "@commander-js/extra-typings";
import { MiroBoard } from "./index.js";
import type { FrameBoardObject } from "./miro-types.ts";

const { token, boardId, frameNames, outputFile, exportFormat, loadTimeout } =
  program
    .option("-t, --token <token>", "Miro token")
    .requiredOption("-b, --board-id <boardId>", "The board ID")
    .option(
      "-f, --frame-names <frameNames...>",
      "The frame name(s), leave empty to export entire board"
    )
    .option(
      "-o, --output-file <filename>",
      "A file to output the SVG to (stdout if not specified)"
    )
    .option("-e, --export-format <format>", "'svg' or 'json'", "svg")
    .option(
      "-l, --load-timeout <milliseconds>",
      "Timeout for loading the board in milliseconds",
      (arg) => parseInt(arg, 10),
      15000
    )
    .parse()
    .opts();

(async () => {
  try {
    await using miroBoard = new MiroBoard({
      token,
      boardId,
      boardLoadTimeoutMs: loadTimeout
    });

    async function getFrames(frameNames: string[]) {
      const frames = await miroBoard.getBoardObjects(
        { type: "frame" as const },
        { title: frameNames }
      );

      if (frames && frames.length !== frameNames.length) {
        throw Error(
          `${
            frameNames.length - frames.length
          } frame(s) could not be found on the board.`
        );
      }

      return frames;
    }

    async function getSvg(frames?: FrameBoardObject[]) {
      return await miroBoard.getSvg(
        frames?.map(({ id }) => id).filter((id): id is string => !!id)
      );
    }

    async function getJson(frames?: FrameBoardObject[]) {
      if (frames) {
        const frameChildren = await miroBoard.getBoardObjects({
          id: frames.flatMap((frame) => frame.childrenIds)
        });

        const groupChildren = await miroBoard.getBoardObjects({
          id: frameChildren
            .filter((child) => child.type === "group")
            .flatMap((child) => child.itemsIds)
        });

        return JSON.stringify([...frames, ...frameChildren, ...groupChildren]);
      }

      return JSON.stringify(await miroBoard.getBoardObjects({}));
    }

    const getFn = exportFormat === "json" ? getJson : getSvg;

    if (outputFile?.includes("{frameName}")) {
      if (!frameNames) {
        throw Error(
          "Expected frame names to be given when the output file name format expects a frame name."
        );
      }

      for (const frameName of frameNames) {
        const output = await getFn(await getFrames([frameName]));
        await writeFile(outputFile.replace("{frameName}", frameName), output);
      }
    } else {
      const svg = await getFn(frameNames && (await getFrames(frameNames)));
      if (outputFile) {
        await writeFile(outputFile, svg);
      } else {
        process.stdout.write(svg);
      }
    }
  } catch (err) {
    const RED = "\x1b[31m";
    const RESET = "\x1b[0m";
    const GRAY = "\x1b[38;5;248m";
    console.error(
      `❌ ${RED}Error:${RESET} ${err instanceof Error ? err.message : err}`
    );
    console.error(GRAY);
    console.error(err);
    console.error(RESET);
  }
})();

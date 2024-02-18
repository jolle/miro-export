import { writeFile } from "fs/promises";
import puppeteer from "puppeteer";
import { program } from "@commander-js/extra-typings";

declare global {
  interface Window {
    miro: {
      board: {
        get(opts: {
          type: "frame"[];
        }): Promise<{ title: string; id: string }[]>;
        select(opts: { id: string }): Promise<void>;
        deselect(): Promise<void>;
      };
    };
    cmd: {
      board: {
        api: {
          export: {
            makeVector: () => Promise<string>;
          };
        };
      };
    };
  }
}

const { token, boardId, frameNames, outputFile } = program
  .requiredOption("-t, --token <token>", "Miro token")
  .requiredOption("-b, --board-id <boardId>", "The board ID")
  .option(
    "-f, --frame-names <frameNames...>",
    "The frame name(s), leave empty to export entire board"
  )
  .option(
    "-o, --output-file <filename>",
    "A file to output the SVG to (stdout if not supplied)"
  )
  .parse()
  .opts();

(async () => {
  const browser = await puppeteer.launch({ headless: true });

  const page = await browser.newPage();

  await page.setCookie({
    name: "token",
    value: token,
    domain: "miro.com"
  });

  await page.setViewport({ width: 1080, height: 1024 });

  await page.goto(`https://miro.com/app/board/${boardId}/`, {
    waitUntil: "domcontentloaded"
  });

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          try {
            if (typeof window.miro?.board !== "undefined") {
              resolve();
              clearInterval(interval);
            }
          } catch (e) {
            // ignored
          }
        }, 100);
      })
  );

  const getSvgForFrames = (frameNames: string[] | undefined) =>
    page.evaluate(async (frameNames) => {
      if (frameNames) {
        const frames = await window.miro.board.get({ type: ["frame"] });

        const selectedFrames = frames.filter((frame) =>
          frameNames.includes(frame.title)
        );

        if (selectedFrames.length !== frameNames.length) {
          throw Error(
            `${
              frameNames.length - selectedFrames.length
            } frame(s) could not be found on the board.`
          );
        }

        await window.miro.board.deselect();

        for (const { id } of selectedFrames) {
          await window.miro.board.select({ id });
        }
      }

      return await window.cmd.board.api.export.makeVector();
    }, frameNames);

  if (outputFile?.includes("{frameName}")) {
    if (!frameNames) {
      throw Error(
        "Expected frame names to be given when the output file name format expects a frame name."
      );
    }

    for (const frameName of frameNames) {
      const svg = await getSvgForFrames([frameName]);
      await writeFile(outputFile.replace("{frameName}", frameName), svg);
    }
  } else {
    const svg = await getSvgForFrames(frameNames);
    if (outputFile) {
      await writeFile(outputFile, svg);
    } else {
      process.stdout.write(svg);
    }
  }

  await page.close();
  await browser.close();
})();

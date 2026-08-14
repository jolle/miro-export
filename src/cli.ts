import { readFile, writeFile } from "fs/promises";
import { program, InvalidArgumentError } from "@commander-js/extra-typings";
import { MiroBoard, listBoards, toDrawio, backupBoards } from "./index.js";
import { BACKUP_FORMATS } from "./backup.js";
import type { BackupFormat, BackupProgress } from "./backup.ts";
import type { MiroBoardSummary } from "./boards.ts";
import type { BoardObject, FrameBoardObject } from "./miro-types.ts";

const TOKEN_DESCRIPTION =
  "Miro token (defaults to the MIRO_TOKEN environment variable)";

program
  .name("miro-export")
  .description("Export Miro boards and/or frames as SVG or JSON");

program
  .command("export", { isDefault: true })
  .description("Export a board or its frames (default command)")
  .option("-t, --token <token>", TOKEN_DESCRIPTION)
  .requiredOption("-b, --board-id <boardId>", "The board ID")
  .option(
    "-f, --frame-names <frameNames...>",
    "The frame name(s), leave empty to export entire board"
  )
  .option(
    "-o, --output-file <filename>",
    "A file to output the SVG to (stdout if not specified)"
  )
  .option("-e, --export-format <format>", "'svg', 'json' or 'drawio'", "svg")
  .option(
    "-l, --load-timeout <milliseconds>",
    "Timeout for loading the board in milliseconds",
    parseMilliseconds,
    15000
  )
  .option(
    "-s, --sdk-timeout <milliseconds>",
    "Timeout for the Miro SDK to become available in milliseconds",
    parseMilliseconds,
    30000
  )
  .action((options) => run(() => exportBoard(options)));

program
  .command("list-boards")
  .description("List the boards the token has access to")
  .option("-t, --token <token>", TOKEN_DESCRIPTION)
  .option(
    "-o, --output-file <filename>",
    "A file to output the list to (stdout if not specified)"
  )
  .option("-e, --export-format <format>", "'table', 'json' or 'ids'", "table")
  .option(
    "-q, --query <text>",
    "Only list boards whose title contains this text"
  )
  .option("--include-trashed", "Include boards that are in the trash")
  .action((options) => run(() => printBoardList(options)));

program
  .command("convert")
  .description(
    "Convert a previously exported JSON board file to draw.io, without contacting Miro"
  )
  .requiredOption(
    "-i, --input-file <filename>",
    "A JSON file exported with -e json"
  )
  .option(
    "-o, --output-file <filename>",
    "A file to output the diagram to (stdout if not specified)"
  )
  .option("-n, --name <name>", "Diagram name shown on the draw.io page tab")
  .option(
    "--scale <factor>",
    "Factor applied to all coordinates and sizes",
    parsePositiveNumber,
    1
  )
  .action((options) => run(() => convertFile(options)));

program
  .command("backup")
  .description(
    "Export every board the token can reach into a timestamped directory"
  )
  .option("-t, --token <token>", TOKEN_DESCRIPTION)
  .option(
    "-d, --output-dir <directory>",
    "Directory the timestamped run directory is created in",
    "exports"
  )
  .option(
    "-e, --export-format <formats>",
    "Comma separated list of 'json', 'svg' and 'drawio'",
    parseFormats,
    ["json", "svg"] as BackupFormat[]
  )
  .option("-n, --limit <count>", "Only back up the first N boards", parseCount)
  .option(
    "-q, --query <text>",
    "Only back up boards whose title contains this text"
  )
  .option("--include-trashed", "Include boards that are in the trash")
  .option(
    "--delay <milliseconds>",
    "Pause between boards",
    parseMilliseconds,
    5000
  )
  .option("--retries <count>", "Attempts per board", parseCount, 3)
  .option(
    "--retry-delay <milliseconds>",
    "Delay before the first retry, doubled for each further attempt",
    parseMilliseconds,
    15000
  )
  .option(
    "-l, --load-timeout <milliseconds>",
    "Timeout for loading each board in milliseconds",
    parseMilliseconds,
    15000
  )
  .option(
    "-s, --sdk-timeout <milliseconds>",
    "Timeout for the Miro SDK to become available in milliseconds",
    parseMilliseconds,
    30000
  )
  .option(
    "--resume <directory>",
    "Continue a previous run, skipping boards it already exported"
  )
  .option("--dry-run", "List what would be exported without contacting Miro")
  .action((options) => run(() => runBackup(options)));

program.parse();

interface ExportOptions {
  token?: string;
  boardId: string;
  frameNames?: string[];
  outputFile?: string;
  exportFormat: string;
  loadTimeout: number;
  sdkTimeout: number;
}

async function exportBoard({
  token,
  boardId,
  frameNames,
  outputFile,
  exportFormat,
  loadTimeout,
  sdkTimeout
}: ExportOptions) {
  await using miroBoard = new MiroBoard({
    token,
    boardId,
    boardLoadTimeoutMs: loadTimeout,
    sdkLoadTimeoutMs: sdkTimeout
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
    return JSON.stringify(await getObjects(frames));
  }

  async function getDrawio(frames?: FrameBoardObject[]) {
    return toDrawio(await getObjects(frames), { name: boardId });
  }

  async function getObjects(frames?: FrameBoardObject[]) {
    return frames
      ? await withFrameContents(frames)
      : ((await miroBoard.getBoardObjects({})) as BoardObject[]);
  }

  async function withFrameContents(frames: FrameBoardObject[]) {
    const frameChildren = await miroBoard.getBoardObjects({
      id: frames.flatMap((frame) => frame.childrenIds)
    });

    const groupChildren = await miroBoard.getBoardObjects({
      id: frameChildren
        .filter((child) => child.type === "group")
        .flatMap((child) => child.itemsIds)
    });

    return [...frames, ...frameChildren, ...groupChildren] as BoardObject[];
  }

  const getFn =
    exportFormat === "json"
      ? getJson
      : exportFormat === "drawio"
        ? getDrawio
        : getSvg;

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
    await output(svg, outputFile);
  }
}

interface ListBoardsCliOptions {
  token?: string;
  outputFile?: string;
  exportFormat: string;
  query?: string;
  includeTrashed?: boolean;
}

async function printBoardList({
  token,
  outputFile,
  exportFormat,
  query,
  includeTrashed
}: ListBoardsCliOptions) {
  const allBoards = await listBoards({ token, includeTrashed });

  const boards = query
    ? allBoards.filter(({ title }) =>
        title.toLowerCase().includes(query.toLowerCase())
      )
    : allBoards;

  if (exportFormat === "json") {
    return await output(`${JSON.stringify(boards, null, 2)}\n`, outputFile);
  }

  if (exportFormat === "ids") {
    return await output(boards.map(({ id }) => `${id}\n`).join(""), outputFile);
  }

  await output(`${formatBoardTable(boards)}\n`, outputFile);
}

interface BackupCliOptions {
  token?: string;
  outputDir: string;
  exportFormat: BackupFormat[];
  limit?: number;
  query?: string;
  includeTrashed?: boolean;
  delay: number;
  retries: number;
  retryDelay: number;
  loadTimeout: number;
  sdkTimeout: number;
  resume?: string;
  dryRun?: boolean;
}

async function runBackup(options: BackupCliOptions) {
  const manifest = await backupBoards({
    token: options.token,
    outputDir: options.outputDir,
    formats: options.exportFormat,
    limit: options.limit,
    query: options.query,
    includeTrashed: options.includeTrashed,
    delayMs: options.delay,
    retries: options.retries,
    retryDelayMs: options.retryDelay,
    boardLoadTimeoutMs: options.loadTimeout,
    sdkLoadTimeoutMs: options.sdkTimeout,
    resumeDir: options.resume,
    dryRun: options.dryRun,
    onProgress: reportBackupProgress
  });

  const { totals } = manifest;
  console.log(
    `\n${totals.exported} exported, ${totals.skipped} skipped, ${totals.failed} failed -> ${manifest.directory}`
  );

  for (const board of manifest.boards.filter(
    ({ status }) => status === "failed"
  )) {
    console.log(`  failed: ${board.title || board.id} - ${board.error}`);
  }

  if (totals.failed > 0) {
    process.exitCode = 1;
  }
}

function reportBackupProgress(event: BackupProgress) {
  switch (event.type) {
    case "planned":
      console.log(`${event.total} board(s) -> ${event.directory}`);
      break;
    case "start":
      console.log(
        `[${event.index + 1}/${event.total}] ${event.board.title || event.board.id}`
      );
      break;
    case "done": {
      const sizes = Object.entries(event.entry.bytes)
        .map(([format, bytes]) => `${format} ${formatBytes(bytes)}`)
        .join(", ");
      console.log(
        `    done in ${Math.round((event.entry.durationMs ?? 0) / 1000)}s (${sizes})`
      );
      break;
    }
    case "skipped":
      console.log(
        `[${event.index + 1}/${event.total}] skipped ${event.entry.title}`
      );
      break;
    case "retry":
      console.log(
        `    attempt ${event.attempt} failed (${event.error}); retrying in ${Math.round(event.delayMs / 1000)}s`
      );
      break;
    case "failed":
      console.log(`    giving up: ${event.entry.error}`);
      break;
  }
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)}MB`;
  }
  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)}KB`;
  }
  return `${bytes}B`;
}

interface ConvertOptions {
  inputFile: string;
  outputFile?: string;
  name?: string;
  scale: number;
}

async function convertFile({
  inputFile,
  outputFile,
  name,
  scale
}: ConvertOptions) {
  const contents = await readFile(inputFile, "utf8");

  let objects: BoardObject[];
  try {
    objects = JSON.parse(contents) as BoardObject[];
  } catch {
    throw Error(`${inputFile} does not contain valid JSON.`);
  }

  if (!Array.isArray(objects)) {
    throw Error(
      `${inputFile} does not look like a board export: expected an array of board objects.`
    );
  }

  await output(toDrawio(objects, { name, scale }), outputFile);
}

function formatBoardTable(boards: MiroBoardSummary[]) {
  if (boards.length === 0) {
    return "No boards found.";
  }

  const idWidth = Math.max(...boards.map(({ id }) => id.length));

  return boards
    .map(
      (board) =>
        `${board.id.padEnd(idWidth)}  ${formatDate(board.updatedAt)}  ${
          board.title || "(untitled)"
        }`
    )
    .join("\n");
}

function formatDate(date?: string) {
  return date?.slice(0, 10) ?? "?".repeat(10);
}

async function output(contents: string, outputFile?: string) {
  if (outputFile) {
    await writeFile(outputFile, contents);
  } else {
    process.stdout.write(contents);
  }
}

function parseFormats(value: string) {
  const formats = value
    .split(",")
    .map((format) => format.trim().toLowerCase())
    .filter(Boolean);

  const unknown = formats.filter(
    (format) => !BACKUP_FORMATS.includes(format as BackupFormat)
  );

  if (formats.length === 0 || unknown.length > 0) {
    throw new InvalidArgumentError(
      `Expected a comma separated list of ${BACKUP_FORMATS.join(", ")}.`
    );
  }

  return formats as BackupFormat[];
}

function parseCount(value: string) {
  const count = parseInt(value, 10);

  if (!Number.isFinite(count) || count <= 0) {
    throw new InvalidArgumentError("Expected a positive whole number.");
  }

  return count;
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Expected a positive number.");
  }

  return parsed;
}

function parseMilliseconds(value: string) {
  const milliseconds = parseInt(value, 10);

  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new InvalidArgumentError(
      "Expected a positive number of milliseconds."
    );
  }

  return milliseconds;
}

async function run(action: () => Promise<void>) {
  try {
    await action();
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
    process.exitCode = 1;
  }
}

import { mkdir, writeFile, access } from "fs/promises";
import { join } from "path";
import { MiroBoard } from "./index.js";
import { listBoards } from "./boards.js";
import { toDrawio } from "./drawio.js";
import { resolveToken } from "./env.js";
import type { MiroBoardSummary } from "./boards.ts";
import type { BoardObject } from "./miro-types.ts";

export type BackupFormat = "json" | "svg" | "drawio";

export const BACKUP_FORMATS: BackupFormat[] = ["json", "svg", "drawio"];

const DEFAULT_OUTPUT_DIR = "exports";
const DEFAULT_DELAY_MS = 5_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 15_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

/**
 * Longest a single name component may get. Keeps whole paths clear of the
 * Windows 260 character limit even when the output directory is deep.
 */
const MAX_NAME_LENGTH = 80;

/**
 * Names Windows refuses to use for a file or directory, whatever the
 * extension.
 */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export interface BackupOptions {
  token?: string;
  /**
   * Directory the timestamped run directory is created in. Default "exports".
   */
  outputDir?: string;
  /**
   * Which artifacts to write per board. Default is JSON and SVG.
   */
  formats?: BackupFormat[];
  /**
   * Only back up the first N boards, after filtering. Useful for a trial run.
   */
  limit?: number;
  /**
   * Only back up boards whose title contains this text.
   */
  query?: string;
  includeTrashed?: boolean;
  /**
   * Pause between boards, in milliseconds. Default is 5 seconds. Miro is not
   * a documented API here, so the default errs on the polite side.
   */
  delayMs?: number;
  /**
   * How many times each board is attempted before it is recorded as failed.
   * Default is 3.
   */
  retries?: number;
  /**
   * Delay before the first retry, doubled for each further attempt and
   * capped at five minutes. Default is 15 seconds.
   */
  retryDelayMs?: number;
  boardLoadTimeoutMs?: number;
  sdkLoadTimeoutMs?: number;
  /**
   * Continue a previous run by writing into its directory and skipping the
   * boards it already produced files for, instead of starting a new one.
   */
  resumeDir?: string;
  /**
   * Report what would be written without contacting Miro or writing anything.
   */
  dryRun?: boolean;
  /**
   * Clock used for the run directory name. Injectable so runs are repeatable.
   */
  now?: Date;
  onProgress?: (event: BackupProgress) => void;
}

export type BackupProgress =
  | { type: "planned"; total: number; directory: string }
  | { type: "start"; index: number; total: number; board: MiroBoardSummary }
  | { type: "done"; index: number; total: number; entry: BackupEntry }
  | { type: "skipped"; index: number; total: number; entry: BackupEntry }
  | {
      type: "retry";
      index: number;
      board: MiroBoardSummary;
      attempt: number;
      delayMs: number;
      error: string;
    }
  | { type: "failed"; index: number; total: number; entry: BackupEntry };

export interface BackupEntry {
  id: string;
  title: string;
  url: string;
  directory: string;
  status: "exported" | "skipped" | "failed";
  attempts: number;
  files: Partial<Record<BackupFormat, string>>;
  bytes: Partial<Record<BackupFormat, number>>;
  durationMs?: number;
  error?: string;
}

export interface BackupManifest {
  startedAt: string;
  finishedAt: string;
  directory: string;
  formats: BackupFormat[];
  totals: {
    boards: number;
    exported: number;
    skipped: number;
    failed: number;
  };
  boards: BackupEntry[];
}

/**
 * Exports every board the token can reach into a timestamped directory, one
 * directory per board. Boards are done one at a time with a pause in between,
 * and each is retried with an exponential backoff, so a long run stays gentle
 * on Miro and survives the occasional board that fails to load.
 */
export async function backupBoards(
  options: BackupOptions = {}
): Promise<BackupManifest> {
  const token = resolveToken(options.token);
  const formats: BackupFormat[] = options.formats?.length
    ? options.formats
    : ["json", "svg"];
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const retries = Math.max(1, options.retries ?? DEFAULT_RETRIES);
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const startedAt = options.now ?? new Date();

  const directory =
    options.resumeDir ??
    join(options.outputDir ?? DEFAULT_OUTPUT_DIR, runDirectoryName(startedAt));

  const boards = planBackup(
    await listBoards({
      token,
      includeTrashed: options.includeTrashed
    }),
    options
  );

  options.onProgress?.({
    type: "planned",
    total: boards.length,
    directory
  });

  const entries: BackupEntry[] = [];

  if (!options.dryRun) {
    await mkdir(directory, { recursive: true });
  }

  for (const [index, board] of boards.entries()) {
    const boardDirectory = join(directory, boardDirectoryName(board));
    const entry: BackupEntry = {
      id: board.id,
      title: board.title,
      url: board.url,
      directory: boardDirectory,
      status: "failed",
      attempts: 0,
      files: {},
      bytes: {}
    };

    if (options.dryRun) {
      entry.status = "skipped";
      entry.files = Object.fromEntries(
        formats.map((format) => [
          format,
          join(boardDirectory, `board.${format}`)
        ])
      );
      entries.push(entry);
      options.onProgress?.({
        type: "skipped",
        index,
        total: boards.length,
        entry
      });
      continue;
    }

    if (options.resumeDir && (await hasAllFormats(boardDirectory, formats))) {
      entry.status = "skipped";
      entry.files = Object.fromEntries(
        formats.map((format) => [
          format,
          join(boardDirectory, `board.${format}`)
        ])
      );
      entries.push(entry);
      options.onProgress?.({
        type: "skipped",
        index,
        total: boards.length,
        entry
      });
      continue;
    }

    options.onProgress?.({
      type: "start",
      index,
      total: boards.length,
      board
    });

    const startedBoardAt = Date.now();

    try {
      await withRetries(
        async () => {
          entry.attempts++;
          await mkdir(boardDirectory, { recursive: true });
          await exportBoard(board, boardDirectory, formats, entry, {
            token,
            boardLoadTimeoutMs: options.boardLoadTimeoutMs,
            sdkLoadTimeoutMs: options.sdkLoadTimeoutMs
          });
        },
        {
          retries,
          retryDelayMs,
          onRetry: (attempt, delay, error) =>
            options.onProgress?.({
              type: "retry",
              index,
              board,
              attempt,
              delayMs: delay,
              error: messageOf(error)
            })
        }
      );

      entry.status = "exported";
      entry.durationMs = Date.now() - startedBoardAt;
      entries.push(entry);
      options.onProgress?.({
        type: "done",
        index,
        total: boards.length,
        entry
      });
    } catch (err) {
      entry.status = "failed";
      entry.error = messageOf(err);
      entry.durationMs = Date.now() - startedBoardAt;
      entries.push(entry);
      options.onProgress?.({
        type: "failed",
        index,
        total: boards.length,
        entry
      });
    }

    const isLast = index === boards.length - 1;
    if (!isLast && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const manifest: BackupManifest = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    directory,
    formats,
    totals: {
      boards: entries.length,
      exported: entries.filter(({ status }) => status === "exported").length,
      skipped: entries.filter(({ status }) => status === "skipped").length,
      failed: entries.filter(({ status }) => status === "failed").length
    },
    boards: entries
  };

  if (!options.dryRun) {
    await writeFile(
      join(directory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
  }

  return manifest;
}

async function exportBoard(
  board: MiroBoardSummary,
  directory: string,
  formats: BackupFormat[],
  entry: BackupEntry,
  options: {
    token?: string;
    boardLoadTimeoutMs?: number;
    sdkLoadTimeoutMs?: number;
  }
) {
  await using miroBoard = new MiroBoard({
    token: options.token,
    boardId: board.id,
    boardLoadTimeoutMs: options.boardLoadTimeoutMs,
    sdkLoadTimeoutMs: options.sdkLoadTimeoutMs
  });

  const write = async (format: BackupFormat, contents: string) => {
    const path = join(directory, `board.${format}`);
    await writeFile(path, contents);
    entry.files[format] = path;
    entry.bytes[format] = Buffer.byteLength(contents);
  };

  // JSON and draw.io come from the same read, so only fetch the objects once
  if (formats.includes("json") || formats.includes("drawio")) {
    const objects = (await miroBoard.getBoardObjects({})) as BoardObject[];

    if (formats.includes("json")) {
      await write("json", JSON.stringify(objects));
    }
    if (formats.includes("drawio")) {
      await write(
        "drawio",
        toDrawio(objects, { name: board.title || board.id })
      );
    }
  }

  if (formats.includes("svg")) {
    await write("svg", await miroBoard.getSvg());
  }
}

/**
 * Applies the title filter and the limit, in that order, so that --limit
 * always means "this many of the boards I asked for".
 */
export function planBackup(
  boards: MiroBoardSummary[],
  options: Pick<BackupOptions, "query" | "limit">
) {
  const query = options.query?.toLowerCase();

  const matching = query
    ? boards.filter(({ title }) => title.toLowerCase().includes(query))
    : boards;

  return options.limit && options.limit > 0
    ? matching.slice(0, options.limit)
    : matching;
}

/**
 * Directory name for a run, as a sortable timestamp that is legal on Windows
 * (where colons are not allowed in paths).
 */
export function runDirectoryName(date: Date) {
  return date
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-");
}

/**
 * Per-board directory: a readable version of the title, plus the board ID so
 * that two boards sharing a title never collide.
 */
export function boardDirectoryName(
  board: Pick<MiroBoardSummary, "id" | "title">
) {
  return `${safeFileName(board.title || "untitled")}--${safeFileName(board.id)}`;
}

/**
 * Turns arbitrary board titles into something every filesystem accepts.
 * Slashes, control characters and the characters Windows reserves all become
 * hyphens, and the result is trimmed to a sane length.
 */
export function safeFileName(name: string) {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[/\\]/g, "-")
    .replace(/[<>:"|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-+\s*/g, "-")
    .replace(/^[-.\s]+|[-.\s]+$/g, "")
    .slice(0, MAX_NAME_LENGTH)
    // slicing can leave a trailing separator behind
    .replace(/[-.\s]+$/g, "");

  if (!cleaned) {
    return "untitled";
  }

  // a reserved name is only a problem on its own, so make it not be one
  return RESERVED_NAMES.test(cleaned) ? `${cleaned}-board` : cleaned;
}

/**
 * Delays before each retry: doubling, and capped so a long run cannot stall
 * for an unbounded time on one bad board.
 */
export function backoffDelays(retries: number, retryDelayMs: number) {
  return Array.from({ length: Math.max(0, retries - 1) }, (_, attempt) =>
    Math.min(retryDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS)
  );
}

async function withRetries(
  action: () => Promise<void>,
  options: {
    retries: number;
    retryDelayMs: number;
    onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  }
) {
  const delays = backoffDelays(options.retries, options.retryDelayMs);
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;

      const delay = delays[attempt - 1];
      if (delay === undefined) {
        break;
      }

      options.onRetry?.(attempt, delay, err);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function hasAllFormats(directory: string, formats: BackupFormat[]) {
  const present = await Promise.all(
    formats.map((format) => exists(join(directory, `board.${format}`)))
  );
  return present.every(Boolean);
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { resolveToken } from "./env.js";

const MIRO_ORIGIN = "https://miro.com";

/**
 * Miro's board listing endpoint only reports a `nextLink` for small page
 * sizes, and its offset-based paging is unreliable, so the whole list is
 * requested in one go by default. `nextLink` is still followed when present.
 */
const DEFAULT_PAGE_SIZE = 1000;

/**
 * Safety net so that a misbehaving `nextLink` chain cannot loop forever.
 */
const MAX_PAGES = 50;

export interface ListBoardsOptions {
  /**
   * The Miro authentication token. Defaults to the `MIRO_TOKEN` environment
   * variable (which may be defined in a `.env` file).
   */
  token?: string;
  /**
   * Whether boards in the trash should be included. Default is false.
   */
  includeTrashed?: boolean;
  /**
   * How many boards to request per page. Default is 1000.
   */
  pageSize?: number;
  /**
   * Signal used to abort the underlying requests.
   */
  signal?: AbortSignal;
  /**
   * Custom fetch implementation. Mainly useful for testing.
   */
  fetch?: typeof globalThis.fetch;
}

export interface MiroBoardSummary {
  /**
   * The board ID, as used by {@link MiroBoard} and the `-b` CLI switch.
   */
  id: string;
  title: string;
  description: string;
  /**
   * Link to the board in the Miro web app.
   */
  url: string;
  createdAt?: string;
  updatedAt?: string;
  /**
   * When the current user last opened the board, if ever.
   */
  lastViewedAt?: string;
  starred: boolean;
  trashed: boolean;
  owner: {
    id?: string;
    name?: string;
    email?: string;
  };
  /**
   * The team (called "account" by the Miro API) the board belongs to.
   */
  team?: {
    id?: string;
    title?: string;
  };
  thumbnailUrl?: string;
}

interface MiroBoardListEntry {
  id: string;
  title?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  lastViewedByMeDate?: string;
  starred?: boolean;
  trashed?: boolean;
  owner?: { id?: string; name?: string };
  ownerName?: string;
  ownerEmail?: string;
  account?: { id?: string; title?: string };
  thumbnail?: string;
}

interface MiroBoardListResponse {
  data?: MiroBoardListEntry[];
  nextLink?: string;
}

/**
 * Lists the boards that the token's user has access to.
 *
 * This uses the same private endpoint as the Miro dashboard and does not
 * require a browser, so it is considerably faster than the export functions.
 * A token is always required: there is no anonymous board listing.
 */
export async function listBoards(
  options: ListBoardsOptions = {}
): Promise<MiroBoardSummary[]> {
  const token = resolveToken(options.token);

  if (!token) {
    throw Error(
      "A Miro token is required to list boards. Pass one explicitly, use the --token switch, or set MIRO_TOKEN in the environment or in a .env file."
    );
  }

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  const boardsById = new Map<string, MiroBoardSummary>();

  let url: string | undefined =
    `${MIRO_ORIGIN}/api/v1/boards?limit=${pageSize}`;

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const response = await fetchImplementation(url, {
      headers: {
        cookie: `token=${token}`,
        accept: "application/json"
      },
      signal: options.signal
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    const body = (await response.json()) as MiroBoardListResponse;

    for (const entry of body.data ?? []) {
      const board = toBoardSummary(entry);
      if (!boardsById.has(board.id)) {
        boardsById.set(board.id, board);
      }
    }

    // only follow links back to Miro itself, and only forwards
    url =
      body.nextLink?.startsWith(`${MIRO_ORIGIN}/`) && body.nextLink !== url
        ? body.nextLink
        : undefined;
  }

  const boards = [...boardsById.values()];

  return options.includeTrashed
    ? boards
    : boards.filter(({ trashed }) => !trashed);
}

function toBoardSummary(entry: MiroBoardListEntry): MiroBoardSummary {
  return {
    id: entry.id,
    title: entry.title ?? "",
    description: entry.description ?? "",
    url: `${MIRO_ORIGIN}/app/board/${entry.id}/`,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastViewedAt: entry.lastViewedByMeDate,
    starred: entry.starred ?? false,
    trashed: entry.trashed ?? false,
    owner: {
      id: entry.owner?.id,
      name: entry.owner?.name ?? entry.ownerName,
      email: entry.ownerEmail
    },
    team: entry.account && {
      id: entry.account.id,
      title: entry.account.title
    },
    thumbnailUrl: entry.thumbnail
  };
}

async function createApiError(response: Response) {
  const message = await readErrorMessage(response);
  const suffix = message ? `: ${message}` : "";

  if (response.status === 401 || response.status === 403) {
    return Error(
      `Miro rejected the token (HTTP ${response.status}${suffix}). Copy a fresh value of the "token" cookie from a logged-in Miro session.`
    );
  }

  return Error(`Miro API request failed (HTTP ${response.status}${suffix}).`);
}

async function readErrorMessage(response: Response) {
  const body = await response.text().catch(() => "");

  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string };
      message?: string;
    };
    return parsed.error?.message ?? parsed.message ?? "";
  } catch {
    return body.slice(0, 200);
  }
}

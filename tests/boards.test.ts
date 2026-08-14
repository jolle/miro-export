import { describe, it } from "node:test";
import assert from "node:assert";
import { listBoards } from "../src/boards.js";
import { loadEnvFile, MIRO_TOKEN_ENV_VAR } from "../src/env.js";

/**
 * A board entry shaped like the ones Miro's board listing endpoint returns,
 * trimmed down to the fields the library actually reads.
 */
function rawBoard(overrides: Record<string, unknown> = {}) {
  return {
    id: "uXjVEXAMPLE1=",
    title: "Product Roadmap",
    description: "",
    createdAt: "2026-07-21T08:44:21.841Z",
    updatedAt: "2026-07-22T10:12:00.000Z",
    lastViewedByMeDate: "2026-07-23T08:59:56.209Z",
    starred: false,
    trashed: false,
    owner: { id: "3458764500000000001", name: "Alex Example" },
    ownerName: "Alex Example",
    ownerEmail: "alex@example.com",
    account: { id: "3458764500000000002", title: "Example Team" },
    thumbnail: "https://mirostatic.com/board-image-assets/BOARD.png",
    ...overrides
  };
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

/**
 * Builds a fetch stub that serves the given responses by URL, and records
 * every call made to it.
 */
function stubFetch(responses: Record<string, unknown>, status = 200) {
  const calls: FetchCall[] = [];

  const fetchImplementation = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const url = String(input);
    calls.push({ url, init });

    const body = responses[url];
    assert.ok(body !== undefined, `unexpected request to ${url}`);

    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    });
  }) as typeof globalThis.fetch;

  return { fetch: fetchImplementation, calls };
}

const FIRST_PAGE_URL = "https://miro.com/api/v1/boards?limit=1000";

describe("listBoards", () => {
  it("requires a token", async () => {
    // any .env file is consumed first so that it cannot re-supply the token
    loadEnvFile();
    const previousToken = process.env[MIRO_TOKEN_ENV_VAR];
    delete process.env[MIRO_TOKEN_ENV_VAR];

    try {
      await assert.rejects(
        () => listBoards({ fetch: stubFetch({}).fetch }),
        /A Miro token is required/
      );
    } finally {
      if (previousToken !== undefined) {
        process.env[MIRO_TOKEN_ENV_VAR] = previousToken;
      }
    }
  });

  it("sends the token as a cookie and normalizes the response", async () => {
    const { fetch, calls } = stubFetch({
      [FIRST_PAGE_URL]: { data: [rawBoard()], size: 1 }
    });

    const boards = await listBoards({ token: "test-token", fetch });

    assert.equal(calls.length, 1);
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers.cookie, "token=test-token");
    assert.equal(headers.accept, "application/json");

    assert.deepEqual(boards, [
      {
        id: "uXjVEXAMPLE1=",
        title: "Product Roadmap",
        description: "",
        url: "https://miro.com/app/board/uXjVEXAMPLE1=/",
        createdAt: "2026-07-21T08:44:21.841Z",
        updatedAt: "2026-07-22T10:12:00.000Z",
        lastViewedAt: "2026-07-23T08:59:56.209Z",
        starred: false,
        trashed: false,
        owner: {
          id: "3458764500000000001",
          name: "Alex Example",
          email: "alex@example.com"
        },
        team: { id: "3458764500000000002", title: "Example Team" },
        thumbnailUrl: "https://mirostatic.com/board-image-assets/BOARD.png"
      }
    ]);
  });

  it("uses the token from the environment when none is given", async () => {
    const previousToken = process.env[MIRO_TOKEN_ENV_VAR];
    process.env[MIRO_TOKEN_ENV_VAR] = "token-from-env";

    try {
      const { fetch, calls } = stubFetch({
        [FIRST_PAGE_URL]: { data: [rawBoard()] }
      });

      await listBoards({ fetch });

      const headers = calls[0].init?.headers as Record<string, string>;
      assert.equal(headers.cookie, "token=token-from-env");
    } finally {
      if (previousToken === undefined) {
        delete process.env[MIRO_TOKEN_ENV_VAR];
      } else {
        process.env[MIRO_TOKEN_ENV_VAR] = previousToken;
      }
    }
  });

  it("honours a custom page size", async () => {
    const url = "https://miro.com/api/v1/boards?limit=25";
    const { fetch, calls } = stubFetch({ [url]: { data: [] } });

    await listBoards({ token: "test-token", pageSize: 25, fetch });

    assert.equal(calls[0].url, url);
  });

  it("follows nextLink and de-duplicates boards across pages", async () => {
    const secondPageUrl =
      "https://miro.com/api/v1/boards?filter=DEFAULT&limit=1000&offset=1000";

    const { fetch, calls } = stubFetch({
      [FIRST_PAGE_URL]: {
        data: [rawBoard({ id: "a=" }), rawBoard({ id: "b=" })],
        nextLink: secondPageUrl
      },
      [secondPageUrl]: {
        // Miro sometimes repeats entries across pages
        data: [rawBoard({ id: "b=" }), rawBoard({ id: "c=" })]
      }
    });

    const boards = await listBoards({ token: "test-token", fetch });

    assert.equal(calls.length, 2);
    assert.deepEqual(
      boards.map(({ id }) => id),
      ["a=", "b=", "c="]
    );
  });

  it("does not follow a nextLink that points away from Miro", async () => {
    const { fetch, calls } = stubFetch({
      [FIRST_PAGE_URL]: {
        data: [rawBoard()],
        nextLink: "https://example.com/api/v1/boards"
      }
    });

    const boards = await listBoards({ token: "test-token", fetch });

    assert.equal(calls.length, 1);
    assert.equal(boards.length, 1);
  });

  it("excludes trashed boards unless asked for them", async () => {
    const responses = {
      [FIRST_PAGE_URL]: {
        data: [
          rawBoard({ id: "live=" }),
          rawBoard({ id: "gone=", trashed: true })
        ]
      }
    };

    const withoutTrashed = await listBoards({
      token: "test-token",
      fetch: stubFetch(responses).fetch
    });
    assert.deepEqual(
      withoutTrashed.map(({ id }) => id),
      ["live="]
    );

    const withTrashed = await listBoards({
      token: "test-token",
      includeTrashed: true,
      fetch: stubFetch(responses).fetch
    });
    assert.deepEqual(
      withTrashed.map(({ id }) => id),
      ["live=", "gone="]
    );
  });

  it("copes with missing optional fields", async () => {
    const { fetch } = stubFetch({
      [FIRST_PAGE_URL]: { data: [{ id: "bare=" }] }
    });

    const [board] = await listBoards({ token: "test-token", fetch });

    assert.equal(board.id, "bare=");
    assert.equal(board.title, "");
    assert.equal(board.description, "");
    assert.equal(board.url, "https://miro.com/app/board/bare=/");
    assert.equal(board.starred, false);
    assert.equal(board.trashed, false);
    assert.deepEqual(board.owner, {
      id: undefined,
      name: undefined,
      email: undefined
    });
    assert.equal(board.team, undefined);
  });

  it("explains an invalid token", async () => {
    const { fetch } = stubFetch(
      {
        [FIRST_PAGE_URL]: {
          error: { message: "Your session token is incorrect" }
        }
      },
      401
    );

    await assert.rejects(() => listBoards({ token: "bad-token", fetch }), {
      message:
        'Miro rejected the token (HTTP 401: Your session token is incorrect). Copy a fresh value of the "token" cookie from a logged-in Miro session.'
    });
  });

  it("surfaces other API failures", async () => {
    const { fetch } = stubFetch(
      { [FIRST_PAGE_URL]: { error: { message: "Internal error" } } },
      500
    );

    await assert.rejects(() => listBoards({ token: "test-token", fetch }), {
      message: "Miro API request failed (HTTP 500: Internal error)."
    });
  });
});

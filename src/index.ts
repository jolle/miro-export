import puppeteer, { Browser, Page } from "puppeteer";
import type { BoardObject } from "./miro-types.ts";
import type { GetBoardsFilter } from "./miro-runtime.ts";

interface InitialMiroBoardOptions {
  /**
   * The Miro authentication token with access to load the board.
   * Optional if anonymous users may access the board without
   * logging in.
   */
  token?: string;
  /**
   * The Miro board ID.
   */
  boardId: string;
  /**
   * Optional custom Puppeteer launch options.
   */
  puppeteerOptions?: puppeteer.LaunchOptions;
  /**
   * Timeout until it is determined that the Miro board could
   * not be loaded for some reason, in milliseconds. Default
   * is 15 seconds (15,000 milliseconds).
   */
  boardLoadTimeoutMs?: number;
}

const DEFAULT_BOARD_LOAD_TIMEOUT_MS = 15_000;

type AdditionalFilter<T> = Partial<T> | Partial<{ [K in keyof T]: T[K][] }>;

type FilteredResultsByType<
  F extends string | string[] | undefined,
  T
> = F extends string ? Extract<BoardObject, { type: F }>[] : T[]; // TODO: F extends string[]

export class MiroBoard {
  private context = Promise.withResolvers<{ browser: Browser; page: Page }>();

  constructor(options: InitialMiroBoardOptions) {
    this.initialize(options);
  }

  private async initialize(options: InitialMiroBoardOptions) {
    const browser = await puppeteer.launch({
      headless: true,
      ...(options.puppeteerOptions ?? {})
    });
    const page = await browser.newPage();

    if (options.token) {
      await browser.browserContexts()[0].setCookie({
        name: "token",
        value: options.token,
        domain: "miro.com",
        path: "/",
        expires: -1,
        sameParty: false,
        httpOnly: false,
        secure: false
      });
    }

    await page.setViewport({ width: 1080, height: 1024 });

    await page.goto(`https://miro.com/app/board/${options.boardId}/`, {
      waitUntil: "domcontentloaded"
    });

    try {
      await page.evaluate(
        (timeoutDuration) =>
          new Promise<void>((resolve, reject) => {
            if (window.miro) {
              resolve();
            }

            const timeout = setTimeout(() => {
              reject(
                new Error(
                  `Miro board could not be loaded: application instance not available after ${timeoutDuration} ms. Check your network connection, access token and board access.`
                )
              );
            }, timeoutDuration);

            const authModalChecker = setInterval(() => {
              if (
                document.querySelector('[data-testid="signup-popup-container"]')
              ) {
                reject(
                  new Error(
                    `Miro board requires authentication. Check board access settings to allow anonymous access or supply a token.`
                  )
                );
              }
            }, 250);

            let miroValue: (typeof window)["miro"];
            Object.defineProperty(window, "miro", {
              get() {
                return miroValue;
              },
              set(value) {
                clearTimeout(timeout);
                clearInterval(authModalChecker);
                miroValue = value;
                resolve();
              }
            });
          }),
        options.boardLoadTimeoutMs ?? DEFAULT_BOARD_LOAD_TIMEOUT_MS
      );
    } catch (err) {
      await browser.close();
      this.context.reject(err);
      return;
    }

    this.context.resolve({ browser, page });
  }

  async dispose() {
    await (await this.browser).close();
  }

  async [Symbol.asyncDispose]() {
    await this.dispose();
  }

  private get browser() {
    return this.context.promise.then(({ browser }) => browser);
  }

  private get page() {
    return this.context.promise.then(({ page }) => page);
  }

  async getBoardObjects<F extends GetBoardsFilter>(
    filter: F,
    additionalFilter?: AdditionalFilter<BoardObject>
  ): Promise<FilteredResultsByType<F["type"], BoardObject>> {
    return (await this.page).evaluate(
      async (filter, additionalFilter) => {
        // @ts-expect-error - https://github.com/evanw/esbuild/issues/2605#issuecomment-2050808084
        window.__name = (func: unknown) => func;

        const objectFilterMatches = (
          filter: AdditionalFilter<Record<string, unknown>>,
          target: object
        ) => {
          for (const key in filter) {
            if (!(key in target)) {
              return false;
            }

            const targetValue = target[key as keyof typeof target];
            if (Array.isArray(filter[key])) {
              if (!filter[key].includes(targetValue)) {
                return false;
              }
            } else if (targetValue !== filter[key]) {
              return false;
            }
          }

          return true;
        };

        const objects = await window.miro.board.get(filter);

        const filteredObjects = additionalFilter
          ? objects.filter((object) =>
              objectFilterMatches(additionalFilter, object)
            )
          : objects;

        return filteredObjects as FilteredResultsByType<F["type"], BoardObject>;
      },
      filter,
      additionalFilter
    );
  }

  async getSvg(objectsIds?: string[]) {
    return (await this.page).evaluate(async (objectsIds) => {
      await window.miro.board.deselect();

      if (objectsIds) {
        for (const id of objectsIds) {
          await window.miro.board.select({ id });
        }
      }

      return await window.cmd.board.api.export.makeVector();
    }, objectsIds);
  }
}

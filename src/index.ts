import puppeteer, { Browser, Page, type LaunchOptions } from "puppeteer";
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
  puppeteerOptions?: LaunchOptions;
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
  private isDisposed = false;

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
            if (window.cmd?.board?.api) {
              resolve();
            }

            const timeout = setTimeout(() => {
              reject(
                new Error(
                  `Miro board could not be loaded: application instance not available after ${timeoutDuration} ms. Check your network connection, access token and board access.`
                )
              );
            }, timeoutDuration);

            const interval = setInterval(() => {
              if (
                document.querySelector('[data-testid="signup-popup-container"]')
              ) {
                clearInterval(interval);
                clearTimeout(timeout);
                reject(
                  new Error(
                    `Miro board requires authentication. Check board access settings to allow anonymous access or supply a token.`
                  )
                );
              } else if (window.cmd?.board?.api) {
                clearTimeout(timeout);
                clearInterval(interval);
                resolve();
              }
            }, 250);
          }),
        options.boardLoadTimeoutMs ?? DEFAULT_BOARD_LOAD_TIMEOUT_MS
      );
    } catch (err) {
      await browser.close();
      this.context.reject(err);
      this.isDisposed = true;
      return;
    }

    this.context.resolve({ browser, page });
  }

  async dispose() {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
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

  /**
   * Checks that all widgets have been loaded. Times out to 5 seconds due to bug
   * in Miro where certain boards fail to load all widgets if SDK is not required
   * for this function call.
   */
  private async checkAllWidgetsLoaded(mustHaveSdk: boolean = false) {
    await (
      await this.page
    ).evaluate(
      (mustHaveSdk, timeoutDuration) =>
        new Promise<void>((resolve, reject) => {
          let startTime = Date.now();
          const interval = setInterval(() => {
            if (
              window.cmd?.board?.api?.isAllWidgetsLoaded() &&
              (!mustHaveSdk || window.miro)
            ) {
              clearInterval(interval);
              resolve();
            }

            if (Date.now() - startTime >= timeoutDuration) {
              clearInterval(interval);
              if (mustHaveSdk) {
                reject(
                  new Error(
                    `Miro SDK failed to load in ${timeoutDuration} ms. This is likely caused by a Miro-internal issue. Check that the board is accessible using an incognito browser window.`
                  )
                );
              } else {
                resolve();
              }
            }
          }, 150);
        }),
      mustHaveSdk,
      3_000
    );
  }

  async getBoardObjects<F extends GetBoardsFilter>(
    filter: F,
    additionalFilter?: AdditionalFilter<BoardObject>
  ): Promise<FilteredResultsByType<F["type"], BoardObject>> {
    await this.checkAllWidgetsLoaded(true);

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
    await this.checkAllWidgetsLoaded(objectsIds !== undefined);

    return (await this.page).evaluate(async (objectsIds) => {
      window.cmd.board.api.clearSelection();

      if (objectsIds) {
        for (const id of objectsIds) {
          await window.miro.board.select({ id });
        }
      }

      return await window.cmd.board.api.export.makeVector();
    }, objectsIds);
  }
}

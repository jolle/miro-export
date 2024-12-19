import { BoardObject, BoardObjectType } from "./miro-types";

interface GetBoardsFilter {
  type?: BoardObjectType[] | BoardObjectType;
  id?: string[] | string;
  tags?: string[] | string;
}

declare global {
  interface Window {
    miro: {
      board: {
        get(opts: GetBoardsFilter): Promise<BoardObject[]>;
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

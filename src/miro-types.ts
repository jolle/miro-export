export type BoardObjectType =
  | "text"
  | "sticky_note"
  | "shape"
  | "image"
  | "frame"
  | "preview"
  | "card"
  | "app_card"
  | "usm"
  | "kanban"
  | "document"
  | "mockup"
  | "curve"
  | "webscreen"
  | "table"
  | "svg"
  | "emoji"
  | "embed"
  | "connector"
  | "unsupported"
  | "table_text"
  | "rallycard"
  | "stencil"
  | "tag"
  | "code"
  | "red"
  | "stamp"
  | "pipmatrix"
  | "demo_1d_layout"
  | "page"
  | "action_button"
  | "external_diagram"
  | "slide_container"
  | "sdk_custom_widget"
  | "group"
  | "struct_doc"
  | "mindmap_node";

export interface BoardObjectBase {
  title: string;
  id: string;
  type: BoardObjectType;
}

export interface FrameBoardObject extends BoardObjectBase {
  type: "frame";
  title: string;
  childrenIds: string[];
}

export interface GroupBoardObject extends BoardObjectBase {
  type: "group";
  itemsIds: string[];
}

export interface StickyNoteBoardObject extends BoardObjectBase {
  type: "sticky_note";
}

export interface TextBoardObject extends BoardObjectBase {
  type: "text";
}

export type BoardObject =
  | FrameBoardObject
  | GroupBoardObject
  | StickyNoteBoardObject
  | TextBoardObject;

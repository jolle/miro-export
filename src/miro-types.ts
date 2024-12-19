type TextAlignment = "left" | "center" | "right";
type TextVerticalAlignment = "top" | "middle" | "bottom";

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
  | "mindmap";

export interface BoardItemBase {
  id?: string;
  type: BoardObjectType;
}

interface BoardObjectBase {
  origin: "center";
  linkedTo?: string;
  connectorIds?: string[];
  groupId?: string;
  relativeTo: "canvas_center" | "parent_top_left" | "parent_center";
  parentId?: string | null;
  createdAt: string;
  createdBy: string;
  modifiedAt: string;
  modifiedBy: string;
}

interface BoardObjectWithCoordinates {
  x: number;
  y: number;
}

interface BoardObjectWithDimensions {
  width: number;
  height: number;
}

export interface PreviewBoardObject
  extends BoardItemBase,
    BoardObjectBase,
    BoardObjectWithDimensions {
  type: "preview";
  url: string;
}

export interface FrameBoardObject
  extends Omit<BoardItemBase, "connectorIds">,
    BoardObjectBase,
    BoardObjectWithDimensions,
    BoardObjectWithCoordinates {
  type: "frame";
  title: string;
  childrenIds: string[];
  showContent: boolean;
  style: {
    fillColor: string;
  };
}

export interface GroupBoardItem extends BoardItemBase {
  type: "group";
  itemsIds: string[];
}

export interface StickyNoteBoardObject
  extends BoardItemBase,
    BoardObjectBase,
    BoardObjectWithCoordinates,
    BoardObjectWithDimensions {
  type: "sticky_note";
  tagIds: string[];
  content: string;
  shape: string;
  style: {
    fillColor: string;
    textAlign: TextAlignment;
    textAlignVertical: TextVerticalAlignment;
  };
}

export interface TextBoardObject
  extends BoardItemBase,
    BoardObjectBase,
    BoardObjectWithCoordinates,
    BoardObjectWithDimensions {
  type: "text";
  content: string;
  rotation: number;
  style: {
    fillColor: string;
    fillOpacity: number;
    fontFamily: string;
    fontSize: number;
    textAlign: TextAlignment;
    color: string;
  };
}

export interface ImageBoardObject
  extends BoardItemBase,
    BoardObjectBase,
    BoardObjectWithDimensions,
    BoardObjectWithCoordinates {
  type: "image";
  rotation: number;
  title: string;
  url: string;
  alt?: string;
}

interface TableStyle {
  borderColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  textColor?: string;
  textAlign: TextAlignment;
  textAlignVertical: TextVerticalAlignment;
  textBold?: boolean;
  textItalic?: boolean;
  textUnderline?: boolean;
  textStrike?: boolean;
  textHighlight: null | string;
  fontFamily?: string;
  fontSize?: number;
  writingMode?: "sideways" | "horizontal";
}

export interface TableBoardObject
  extends BoardItemBase,
    BoardObjectWithDimensions,
    BoardObjectWithCoordinates {
  type: "image";
  rotation: number;
  cols?: number | { width: number }[];
  rows?: number | { height: number }[];
  cells?: {
    text: string;
    rowspan?: number;
    colspan?: number;
    style: TableStyle;
  }[][];
  style: TableStyle;
}

export interface StructDocBoardObject
  extends BoardItemBase,
    BoardObjectBase,
    BoardObjectWithDimensions,
    BoardObjectWithCoordinates {
  type: "struct_doc";
  title: string;
  content: string;
}

export interface EmbedBoardObject
  extends BoardItemBase,
    BoardObjectBase,
    BoardObjectWithCoordinates {
  type: "struct_doc";
  url: string;
  previewUrl: string;
  mode: "inline" | "modal";
  width?: number;
  height?: number;
}

export interface ShapeBoardObject
  extends BoardItemBase,
    BoardObjectBase,
    BoardObjectWithCoordinates,
    BoardObjectWithDimensions {
  type: "shape";
  content: string;
  shape: string;
  rotation: number;
  style: {
    fillColor: string;
    fontFamily: string;
    fontSize: number;
    textAlign: TextAlignment;
    textAlignVertical: TextVerticalAlignment;
    borderStyle: "dashed" | "normal" | "dotted";
    borderOpacity: number;
    borderColor: string;
    borderWidth: number;
    fillOpacity: number;
    color: string;
  };
}

interface CardBase extends BoardObjectBase, BoardObjectWithDimensions {
  rotation: number;
  title: string;
  description: string;
  fields: {
    fillColor?: string;
    textColor?: string;
    iconUrl?: string;
    iconShape?: "round" | "square";
    tooltip?: string;
    value: string;
  }[];
  style: {
    cardTheme: string;
    fillBackground: boolean;
  };

  /** coordinates may be null if card is part of a Kanban board */
  x: number | null;
  y: number | null;
}

export interface CardBoardObject extends BoardItemBase, CardBase {
  type: "card";
  assignee?: { userId: string };
  dueDate?: string;
  startDate?: string;
  taskStatus: "to-do" | "in-progress" | "done" | "none";
  tagIds: string[];
}

export interface AppCardBoardObject extends BoardItemBase, CardBase {
  type: "app_card";
  owned: boolean;
  status: "disabled" | "disconnected" | "connected";
}

export interface TagBoardItem extends BoardItemBase {
  type: "tag";
  title: string;
  color: string;
}

export interface KanbanBoardObject
  extends BoardItemBase,
    BoardObjectBase,
    BoardObjectWithCoordinates,
    BoardObjectWithDimensions {
  type: "kanban";
}

export interface UnsupportedBoardObject
  extends BoardItemBase,
    BoardObjectBase,
    BoardObjectWithCoordinates,
    BoardObjectWithDimensions {
  type: "unsupported";
}

export type BoardObject =
  | PreviewBoardObject
  | FrameBoardObject
  | GroupBoardItem
  | StickyNoteBoardObject
  | TextBoardObject
  | ImageBoardObject
  | TableBoardObject
  | StructDocBoardObject
  | EmbedBoardObject
  | ShapeBoardObject
  | CardBoardObject
  | AppCardBoardObject
  | TagBoardItem
  | KanbanBoardObject
  | UnsupportedBoardObject;

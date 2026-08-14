import type { BoardObject } from "./miro-types.ts";

export interface ToDrawioOptions {
  /**
   * Name shown on the diagram's page tab. Default is "Board".
   */
  name?: string;
  /**
   * Factor applied to all coordinates and sizes. Default is 1, which keeps
   * Miro's own units.
   */
  scale?: number;
  /**
   * How cells are stacked. "area" (the default) emits the largest objects
   * first so that big background shapes end up behind their contents;
   * "source" keeps the order of the exported objects.
   */
  zOrder?: "area" | "source";
}

/* eslint-disable @typescript-eslint/naming-convention -- keys mirror Miro's own vocabulary */

/**
 * Miro's named sticky note colours, which the board objects reference by name
 * rather than by value. Shapes and text carry real hex colours instead.
 */
const STICKY_COLORS: Record<string, string> = {
  gray: "#b3b3b3",
  light_yellow: "#fff9b1",
  yellow: "#f5d128",
  orange: "#ff9d48",
  light_green: "#d5f692",
  green: "#c9df56",
  dark_green: "#8fd14f",
  cyan: "#67c6c0",
  light_blue: "#a6ccf5",
  blue: "#2d9bf0",
  dark_blue: "#6881ff",
  violet: "#9510ac",
  red: "#f24726",
  light_pink: "#ffcee0",
  pink: "#ea94bb",
  black: "#1a1a1a",
  white: "#ffffff"
};

const SHAPE_STYLES: Record<string, string> = {
  rectangle: "rounded=0;",
  round_rectangle: "rounded=1;",
  circle: "ellipse;perimeter=ellipsePerimeter;",
  ellipse: "ellipse;perimeter=ellipsePerimeter;",
  triangle: "triangle;perimeter=trianglePerimeter;direction=north;",
  rhombus: "rhombus;perimeter=rhombusPerimeter;",
  octagon: "shape=mxgraph.basic.octagon;",
  hexagon: "shape=hexagon;perimeter=hexagonPerimeter2;",
  star: "shape=mxgraph.basic.star;",
  cloud: "ellipse;shape=cloud;",
  cross: "shape=cross;",
  can: "shape=cylinder3;boundedLbl=1;",
  parallelogram: "shape=parallelogram;perimeter=parallelogramPerimeter;",
  trapezoid: "shape=trapezoid;perimeter=trapezoidPerimeter;",
  arrow_right: "shape=singleArrow;direction=east;",
  arrow_left: "shape=singleArrow;direction=west;"
};

/**
 * Miro stroke caps mapped onto the closest draw.io arrow head.
 */
const ARROW_CAPS: Record<string, string> = {
  none: "none",
  stealth: "block",
  rounded_stealth: "block",
  arrow: "classic",
  filled_triangle: "classic",
  triangle: "classicThin",
  oval: "oval",
  filled_oval: "oval",
  diamond: "diamondThin",
  filled_diamond: "diamond",
  erd_one: "ERone",
  erd_many: "ERmany"
};

/**
 * Inline formatting Miro can store, mapped to the tags draw.io renders in an
 * HTML label. Everything else is dropped.
 */
const RICH_TAGS: Record<string, string> = {
  b: "b",
  strong: "b",
  i: "i",
  em: "i",
  u: "u",
  s: "s",
  del: "s"
};

/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Private-use characters standing in for kept formatting tags while the text
 * is stripped, decoded and escaped, so that real angle brackets in the
 * content cannot be confused for markup.
 */
const MARKER_OPEN = "\uE000";
const MARKER_CLOSE = "\uE001";
const MARKER_PATTERN = /\uE000(\/?)([a-z]+)\uE001/g;

/**
 * Rough metrics used to emulate Miro's automatic text fitting.
 */
const AVERAGE_GLYPH_WIDTH = 0.55;
const LINE_HEIGHT = 1.25;
const AUTO_FIT_PADDING = 0.86;
const AUTO_FIT_MIN = 8;
const AUTO_FIT_MAX = 288;
/**
 * Ceiling on how much of a shape's height a single line may take up, so that
 * very short labels ("QA") do not swell to fill the whole note.
 */
const AUTO_FIT_MAX_HEIGHT_RATIO = 0.4;

type AnyBoardObject = Record<string, unknown>;

/**
 * Converts exported Miro board objects into an uncompressed draw.io (mxGraph)
 * document. Shapes, sticky notes, text and frames become native draw.io cells
 * and connectors become real edges, so everything stays editable in draw.io.
 */
export function toDrawio(
  objects: BoardObject[],
  options: ToDrawioOptions = {}
): string {
  const items = objects as unknown as AnyBoardObject[];
  const scale = options.scale ?? 1;

  const byId = new Map<string, AnyBoardObject>();
  for (const item of items) {
    const id = asString(item.id);
    if (id) {
      byId.set(id, item);
    }
  }

  const connectors = items.filter((item) => item.type === "connector");
  const vertices = items.filter(
    (item) => item.type !== "connector" && hasGeometry(item)
  );

  // draw.io paints in document order, so anything emitted later sits on top.
  // Miro's export order is not a z-order, which leaves large shapes used as
  // backdrops covering their own contents. Emitting biggest-first restores the
  // intended stacking.
  if ((options.zOrder ?? "area") === "area") {
    vertices.sort((a, b) => area(b) - area(a));
  }

  // Miro positions objects by their centre; draw.io uses top-left corners.
  // Top-level objects are relative to the canvas centre, so shift the whole
  // board into positive space.
  let offsetX = 0;
  let offsetY = 0;
  const topLevel = vertices.filter((item) => !isChild(item, byId));
  if (topLevel.length > 0) {
    offsetX = Math.min(...topLevel.map((item) => left(item)));
    offsetY = Math.min(...topLevel.map((item) => top(item)));
  }

  const cells: string[] = [];
  const emitted = new Set<string>();

  const emit = (item: AnyBoardObject) => {
    const id = asString(item.id);
    if (!id || emitted.has(id)) {
      return;
    }
    emitted.add(id);

    const parentId = childParentId(item, byId);
    if (parentId) {
      const parent = byId.get(parentId);
      // a parent must appear before its children
      if (parent) {
        emit(parent);
      }
    }

    cells.push(vertexCell(item, parentId, offsetX, offsetY, scale));
  };

  // frames first so containers are declared before anything lands in them
  for (const item of vertices.filter((item) => item.type === "frame")) {
    emit(item);
  }
  for (const item of vertices) {
    emit(item);
  }

  for (const connector of connectors) {
    const cell = edgeCell(connector, byId);
    if (cell) {
      cells.push(cell);
    }
  }

  const name = escapeXml(options.name ?? "Board");

  return [
    '<mxfile host="miro-export">',
    `  <diagram id="miro-board" name="${name}">`,
    '    <mxGraphModel dx="0" dy="0" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0">',
    "      <root>",
    '        <mxCell id="0" />',
    '        <mxCell id="1" parent="0" />',
    ...cells.map((cell) => `        ${cell}`),
    "      </root>",
    "    </mxGraphModel>",
    "  </diagram>",
    "</mxfile>",
    ""
  ].join("\n");
}

function vertexCell(
  item: AnyBoardObject,
  parentId: string | undefined,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const { width, height } = visibleSize(item);

  // children are already positioned relative to their parent's top-left
  const x = parentId ? left(item) : left(item) - offsetX;
  const y = parentId ? top(item) : top(item) - offsetY;

  const style = styleFor(item);
  const value = labelFor(item);
  const parent = parentId ? cellId(parentId) : "1";

  return (
    `<mxCell id="${cellId(asString(item.id) ?? "")}" value="${value}" style="${style}" vertex="1" parent="${parent}">` +
    `<mxGeometry x="${round(x * scale)}" y="${round(y * scale)}" width="${round(width * scale)}" height="${round(height * scale)}" as="geometry" /></mxCell>`
  );
}

function edgeCell(
  connector: AnyBoardObject,
  byId: Map<string, AnyBoardObject>
) {
  const start = connector.start as ConnectorEnd | undefined;
  const end = connector.end as ConnectorEnd | undefined;
  const source = start?.item;
  const target = end?.item;

  // an edge with no endpoints left in the export cannot be placed meaningfully
  if (!source || !target || !byId.has(source) || !byId.has(target)) {
    return undefined;
  }

  const style = connector.style as Record<string, unknown> | undefined;
  const shape = asString(connector.shape);

  const parts: string[] = ["html=1;"];

  if (shape === "curved") {
    // Miro stores no waypoints, and draw.io can only curve through the points
    // of a route. Without a routing style there is nothing to bend, so a bare
    // curved=1 comes out as a straight line.
    parts.push("edgeStyle=orthogonalEdgeStyle;curved=1;");
  } else if (shape === "straight") {
    parts.push("edgeStyle=none;");
  } else {
    parts.push("edgeStyle=orthogonalEdgeStyle;rounded=0;");
  }

  // Miro records where a connector attaches to its shapes; draw.io calls the
  // same thing exit/entry points. Without them draw.io re-decides the sides
  // and the routing drifts away from the original layout.
  parts.push(anchorStyle("exit", start));
  parts.push(anchorStyle("entry", end));

  parts.push(
    `startArrow=${ARROW_CAPS[asString(style?.startStrokeCap) ?? ""] ?? "none"};`
  );
  parts.push(
    `endArrow=${ARROW_CAPS[asString(style?.endStrokeCap) ?? ""] ?? "classic"};`
  );

  const strokeColor = asString(style?.strokeColor);
  if (strokeColor) {
    parts.push(`strokeColor=${strokeColor};`);
  }
  const strokeWidth = asNumber(style?.strokeWidth);
  if (strokeWidth) {
    parts.push(`strokeWidth=${round(strokeWidth)};`);
  }
  const strokeStyle = asString(style?.strokeStyle);
  if (strokeStyle === "dashed") {
    parts.push("dashed=1;");
  } else if (strokeStyle === "dotted") {
    parts.push("dashed=1;dashPattern=1 4;");
  }
  const fontColor = asString(style?.color);
  if (fontColor) {
    parts.push(`fontColor=${fontColor};`);
  }

  const captions = connector.captions as { content?: unknown }[] | undefined;
  const value = escapeLabel(markedText(captions?.[0]?.content));

  return (
    `<mxCell id="${cellId(asString(connector.id) ?? "")}" value="${value}" style="${parts.join("")}" edge="1" parent="1" source="${cellId(source)}" target="${cellId(target)}">` +
    `<mxGeometry relative="1" as="geometry" /></mxCell>`
  );
}

interface ConnectorEnd {
  item?: string;
  position?: { x?: number; y?: number };
  snapTo?: string;
}

/**
 * Sides a connector can snap to, as the equivalent normalised anchor point.
 */
const SNAP_POSITIONS: Record<string, { x: number; y: number }> = {
  left: { x: 0, y: 0.5 },
  right: { x: 1, y: 0.5 },
  top: { x: 0.5, y: 0 },
  bottom: { x: 0.5, y: 1 }
};

/**
 * Builds the draw.io exit/entry style for one end of a connector. Miro gives
 * either an explicit normalised position or just the side it snapped to;
 * "auto" means Miro decides, which is draw.io's default too.
 */
function anchorStyle(kind: "exit" | "entry", end: ConnectorEnd | undefined) {
  const explicit = end?.position;
  const point =
    asNumber(explicit?.x) !== undefined && asNumber(explicit?.y) !== undefined
      ? { x: explicit?.x as number, y: explicit?.y as number }
      : SNAP_POSITIONS[end?.snapTo ?? ""];

  if (!point) {
    return "";
  }

  return `${kind}X=${round(point.x)};${kind}Y=${round(point.y)};${kind}Dx=0;${kind}Dy=0;`;
}

function styleFor(item: AnyBoardObject) {
  const style = item.style as Record<string, unknown> | undefined;
  const parts: string[] = ["html=1;whiteSpace=wrap;"];

  const fill = fillColorFor(item, style);
  const fontColor =
    asString(style?.color) ?? (fill ? contrastColor(fill) : undefined);

  switch (item.type) {
    case "frame":
      parts.push(
        "rounded=0;container=1;collapsible=0;verticalAlign=top;align=left;spacingLeft=6;spacingTop=2;fontStyle=1;strokeColor=#b3b3b3;"
      );
      parts.push(`fillColor=${fill ?? "#f5f5f5"};`);
      parts.push("fontColor=#333333;");
      break;

    case "sticky_note":
      parts.push("rounded=0;strokeColor=none;shadow=1;");
      parts.push(`fillColor=${fill ?? "#fff9b1"};`);
      parts.push(`fontColor=${fontColor ?? "#1a1a1a"};`);
      break;

    case "text":
      parts.push("text;strokeColor=none;fillColor=none;");
      parts.push(`fontColor=${asString(style?.color) ?? "#1a1a1a"};`);
      break;

    case "image":
      // the JSON export carries no image data, so keep a labelled placeholder
      parts.push(
        "rounded=0;dashed=1;strokeColor=#9a9a9a;fillColor=#f5f5f5;fontColor=#666666;verticalAlign=middle;"
      );
      break;

    case "shape":
      parts.push(SHAPE_STYLES[asString(item.shape) ?? ""] ?? "rounded=0;");
      parts.push(`fillColor=${fill ?? "none"};`);
      parts.push(`fontColor=${fontColor ?? "#1a1a1a"};`);
      {
        const border = asString(style?.borderColor);
        parts.push(`strokeColor=${border ?? "#1a1a1a"};`);
        const borderWidth = asNumber(style?.borderWidth);
        if (borderWidth) {
          parts.push(`strokeWidth=${round(borderWidth)};`);
        }
        const borderStyle = asString(style?.borderStyle);
        if (borderStyle === "dashed") {
          parts.push("dashed=1;");
        } else if (borderStyle === "dotted") {
          parts.push("dashed=1;dashPattern=1 4;");
        }
      }
      break;

    default:
      parts.push(
        "rounded=0;dashed=1;strokeColor=#9a9a9a;fillColor=#fafafa;fontColor=#666666;"
      );
      break;
  }

  const fontSize = asNumber(style?.fontSize) ?? impliedFontSize(item);
  if (fontSize) {
    parts.push(`fontSize=${round(fontSize)};`);
  }

  const align = asString(style?.textAlign);
  if (align === "left" || align === "center" || align === "right") {
    parts.push(`align=${align};`);
  }

  const verticalAlign = asString(style?.textAlignVertical);
  if (
    verticalAlign === "top" ||
    verticalAlign === "middle" ||
    verticalAlign === "bottom"
  ) {
    parts.push(`verticalAlign=${verticalAlign};`);
  }

  return parts.join("");
}

function labelFor(item: AnyBoardObject) {
  if (item.type === "frame") {
    return escapeLabel(plainText(item.title));
  }

  if (item.type === "image") {
    const alt = plainText(item.alt) || plainText(item.title);
    return escapeLabel(alt ? `[image] ${alt}` : "[image]");
  }

  if (item.type === "stencil") {
    return escapeLabel("[stencil]");
  }

  // keep the bold/italic Miro recorded, which draw.io renders via html=1
  const content = markedText(item.content);
  if (content) {
    return escapeLabel(content);
  }

  return escapeLabel(markedText(item.title));
}

function fillColorFor(
  item: AnyBoardObject,
  style: Record<string, unknown> | undefined
) {
  const fill = asString(style?.fillColor);
  if (!fill || fill === "transparent") {
    return undefined;
  }
  if (fill.startsWith("#")) {
    return fill;
  }
  return STICKY_COLORS[fill] ?? undefined;
}

/**
 * Miro stores no font size for sticky notes or frame titles: it scales sticky
 * text to fill the note, and draws frame titles as chrome. draw.io needs a
 * real size, and without one everything falls back to its 12pt default, which
 * makes a whole board look uniformly tiny. These approximate what Miro shows.
 */
function impliedFontSize(item: AnyBoardObject) {
  // text has to fit the box that is drawn, not the one that is declared
  const { width, height } = visibleSize(item);

  if (item.type === "frame") {
    // frame titles read as headings, scaled to the frame they label
    return clamp(width / 25, 12, 120);
  }

  const text = plainText(item.content);
  if (!text || width <= 0 || height <= 0) {
    return undefined;
  }

  return fittedFontSize(text, width, height);
}

/**
 * Largest font size at which `text` still fits inside a `width` x `height`
 * box, assuming greedy word wrapping and average sans-serif glyph metrics.
 */
function fittedFontSize(text: string, width: number, height: number) {
  const innerWidth = width * AUTO_FIT_PADDING;
  const innerHeight = height * AUTO_FIT_PADDING;
  const paragraphs = text
    .split("\n")
    .map((line) => line.split(/\s+/).filter(Boolean));

  // text only breaks at spaces, so the longest word sets the width floor: an
  // unbreakable word wider than the shape spills out of it instead of wrapping
  const longestWord = Math.max(
    1,
    ...paragraphs.flat().map((word) => word.length)
  );

  let best = AUTO_FIT_MIN;
  for (let size = AUTO_FIT_MAX; size >= AUTO_FIT_MIN; size -= 1) {
    const charsPerLine = Math.floor(innerWidth / (size * AVERAGE_GLYPH_WIDTH));

    if (charsPerLine < longestWord) {
      continue;
    }

    const lines = paragraphs.reduce(
      (total, words) => total + wrappedLineCount(words, charsPerLine),
      0
    );

    if (lines * size * LINE_HEIGHT <= innerHeight) {
      best = size;
      break;
    }
  }

  // never let a single short word swell to fill a large shape
  return clamp(best, AUTO_FIT_MIN, height * AUTO_FIT_MAX_HEIGHT_RATIO);
}

/**
 * Lines that `words` occupy when wrapped greedily at `charsPerLine`.
 */
function wrappedLineCount(words: string[], charsPerLine: number) {
  if (words.length === 0) {
    return 1;
  }

  let lines = 1;
  let used = 0;

  for (const word of words) {
    const needed = used === 0 ? word.length : used + 1 + word.length;
    if (needed <= charsPerLine) {
      used = needed;
    } else {
      lines++;
      used = word.length;
    }
  }

  return lines;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Picks a readable text colour for a filled shape, since Miro leaves the
 * colour implicit on sticky notes.
 */
function contrastColor(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return "#1a1a1a";
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

/**
 * Turns Miro's HTML content into text, keeping paragraph and line breaks as
 * newlines and the inline formatting Miro supports as private-use markers.
 * Markers survive XML escaping, so {@link escapeLabel} can turn them back
 * into the only tags draw.io needs to see.
 */
function markedText(content: unknown) {
  return String(content ?? "")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<(\/?)(b|strong|i|em|u|s|del)(\s[^>]*)?>/gi,
      (_, closing: string, tag: string) =>
        `${MARKER_OPEN}${closing ? "/" : ""}${RICH_TAGS[tag.toLowerCase()]}${MARKER_CLOSE}`
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[\u200b-\u200d\ufeff\u00ad]/g, "")
    .trim();
}

/**
 * The visible text only, used when measuring how much has to fit in a shape.
 */
function plainText(content: unknown) {
  return markedText(content).replace(MARKER_PATTERN, "");
}

/**
 * Labels are rendered as HTML (every style sets html=1) and then live inside
 * an XML attribute, so they are escaped twice: once so that text like
 * "a <b> tag" stays text instead of turning bold, and once for the attribute.
 * Only the tags reconstructed from markers survive as real markup.
 */
function escapeLabel(text: string) {
  const html = escapeHtml(text)
    .replace(/\r?\n/g, "<br>")
    .replace(
      MARKER_PATTERN,
      (_, closing: string, tag: string) => `<${closing}${tag}>`
    );

  return escapeXml(html);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasGeometry(item: AnyBoardObject) {
  return (
    asNumber(item.x) !== undefined &&
    asNumber(item.y) !== undefined &&
    asNumber(item.width) !== undefined &&
    asNumber(item.height) !== undefined
  );
}

function isChild(item: AnyBoardObject, byId: Map<string, AnyBoardObject>) {
  return childParentId(item, byId) !== undefined;
}

/**
 * Miro nests objects inside frames, and only then are their coordinates
 * relative to the parent. Other parents (groups) carry no geometry, so their
 * children stay on the top level.
 */
function childParentId(
  item: AnyBoardObject,
  byId: Map<string, AnyBoardObject>
) {
  const parentId = asString(item.parentId);
  if (!parentId || item.relativeTo !== "parent_top_left") {
    return undefined;
  }
  const parent = byId.get(parentId);
  return parent && hasGeometry(parent) ? parentId : undefined;
}

/**
 * The box Miro actually draws, which is not always the one it reports.
 *
 * A square sticky note declares a box 14.57% taller than it is wide: the extra
 * height is reserve for text that overflows the note, not part of the note
 * itself. Measured against Miro's own rendering, a 212.93 x 243.96 note is
 * drawn as a ~195 unit square. Taking the declared box at face value makes
 * vertically adjacent notes overlap by ~13 units even though Miro shows a gap
 * between them.
 */
function visibleSize(item: AnyBoardObject) {
  const width = asNumber(item.width) ?? 0;
  const height = asNumber(item.height) ?? 0;

  if (item.type === "sticky_note" && item.shape === "square") {
    return { width, height: width };
  }

  return { width, height };
}

function area(item: AnyBoardObject) {
  const { width, height } = visibleSize(item);
  return width * height;
}

function left(item: AnyBoardObject) {
  return (asNumber(item.x) ?? 0) - visibleSize(item).width / 2;
}

function top(item: AnyBoardObject) {
  return (asNumber(item.y) ?? 0) - visibleSize(item).height / 2;
}

function cellId(id: string) {
  return `o${id}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

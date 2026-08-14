import { describe, it } from "node:test";
import assert from "node:assert";
import { toDrawio } from "../src/drawio.js";
import type { BoardObject } from "../src/miro-types.ts";

/**
 * Board objects are shaped like the JSON export: positioned by their centre,
 * relative to the canvas centre unless nested in a frame.
 */
const board = (objects: Record<string, unknown>[]) =>
  toDrawio(objects as unknown as BoardObject[]);

const cellFor = (xml: string, id: string) => {
  const match = xml.match(new RegExp(`<mxCell id="o${id}"[^>]*>`));
  return match?.[0] ?? "";
};

const geometryFor = (xml: string, id: string) => {
  const match = xml.match(
    new RegExp(`<mxCell id="o${id}"[^>]*><mxGeometry([^>]*)>`)
  );
  const attrs = match?.[1] ?? "";
  const read = (name: string) => {
    const value = attrs.match(new RegExp(`${name}="([^"]+)"`))?.[1];
    return value === undefined ? undefined : Number(value);
  };
  return {
    x: read("x"),
    y: read("y"),
    width: read("width"),
    height: read("height")
  };
};

describe("toDrawio", () => {
  it("emits the reserved root cells and a well-formed envelope", () => {
    const xml = board([]);

    assert.match(xml, /^<mxfile host="miro-export">/);
    assert.match(xml, /<mxCell id="0" \/>/);
    assert.match(xml, /<mxCell id="1" parent="0" \/>/);
    assert.match(xml, /<\/mxfile>\n$/);
    assert.ok(!xml.includes("<!--"), "must not contain XML comments");
  });

  it("converts centre coordinates to top-left and shifts the board to the origin", () => {
    const xml = board([
      {
        id: "1001",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: -100,
        y: -50,
        width: 200,
        height: 100
      },
      {
        id: "1002",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 100,
        y: 50,
        width: 200,
        height: 100
      }
    ]);

    // top-lefts are (-200,-100) and (0,0); the board shifts by (200,100)
    assert.deepEqual(geometryFor(xml, "1001"), {
      x: 0,
      y: 0,
      width: 200,
      height: 100
    });
    assert.deepEqual(geometryFor(xml, "1002"), {
      x: 200,
      y: 100,
      width: 200,
      height: 100
    });
  });

  it("nests frame children with parent-relative geometry", () => {
    const xml = board([
      {
        id: "2000",
        type: "frame",
        title: "Frame A",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 1000,
        height: 800
      },
      {
        id: "2001",
        type: "sticky_note",
        content: "<p>Inside</p>",
        parentId: "2000",
        relativeTo: "parent_top_left",
        x: 500,
        y: 400,
        width: 100,
        height: 100,
        style: { fillColor: "yellow" }
      }
    ]);

    assert.match(cellFor(xml, "2001"), /parent="o2000"/);
    // parent-relative coordinates are used as-is, only re-based to top-left
    assert.deepEqual(geometryFor(xml, "2001"), {
      x: 450,
      y: 350,
      width: 100,
      height: 100
    });
    assert.match(cellFor(xml, "2000"), /container=1/);
    // the frame is declared before the child that references it
    assert.ok(xml.indexOf('id="o2000"') < xml.indexOf('id="o2001"'));
  });

  it("turns connectors into edges between the referenced cells", () => {
    const xml = board([
      {
        id: "10",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 10,
        height: 10
      },
      {
        id: "20",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 50,
        y: 0,
        width: 10,
        height: 10
      },
      {
        id: "30",
        type: "connector",
        shape: "elbowed",
        start: { item: "10" },
        end: { item: "20" },
        style: {
          strokeColor: "#333333",
          strokeWidth: 2,
          endStrokeCap: "rounded_stealth"
        },
        captions: [{ content: "<p>DEPLOYMENT</p>" }]
      }
    ]);

    const edge = cellFor(xml, "30");
    assert.match(edge, /edge="1"/);
    assert.match(edge, /source="o10"/);
    assert.match(edge, /target="o20"/);
    assert.match(edge, /value="DEPLOYMENT"/);
    assert.match(edge, /edgeStyle=orthogonalEdgeStyle/);
    assert.match(edge, /strokeColor=#333333/);
    assert.match(edge, /endArrow=block/);
    assert.match(xml, /<mxGeometry relative="1" as="geometry" \/>/);
  });

  it("routes curved connectors so draw.io has bends to smooth", () => {
    const xml = board([
      {
        id: "10",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 10,
        height: 10
      },
      {
        id: "20",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 50,
        y: 0,
        width: 10,
        height: 10
      },
      {
        id: "31",
        type: "connector",
        shape: "curved",
        start: { item: "10" },
        end: { item: "20" }
      }
    ]);

    const edge = cellFor(xml, "31");
    assert.match(edge, /curved=1/);
    // a curve with no route to follow renders as a straight line
    assert.match(edge, /edgeStyle=orthogonalEdgeStyle/);
  });

  it("carries Miro's connector anchor points over as exit/entry points", () => {
    const xml = board([
      {
        id: "10",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 10,
        height: 10
      },
      {
        id: "20",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 50,
        y: 0,
        width: 10,
        height: 10
      },
      {
        id: "32",
        type: "connector",
        shape: "curved",
        start: { item: "10", position: { x: 1, y: 0.5 }, snapTo: "right" },
        end: { item: "20", snapTo: "top" }
      }
    ]);

    const edge = cellFor(xml, "32");
    assert.match(edge, /exitX=1;exitY=0.5;/);
    // no explicit position, so the snapped side supplies the anchor
    assert.match(edge, /entryX=0.5;entryY=0;/);
  });

  it("leaves anchors to draw.io when Miro snapped automatically", () => {
    const xml = board([
      {
        id: "10",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 10,
        height: 10
      },
      {
        id: "20",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 50,
        y: 0,
        width: 10,
        height: 10
      },
      {
        id: "33",
        type: "connector",
        start: { item: "10", snapTo: "auto" },
        end: { item: "20", snapTo: "auto" }
      }
    ]);

    const edge = cellFor(xml, "33");
    assert.ok(!edge.includes("exitX="));
    assert.ok(!edge.includes("entryX="));
  });

  it("drops connectors whose endpoints are not in the export", () => {
    const xml = board([
      {
        id: "10",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 10,
        height: 10
      },
      {
        id: "40",
        type: "connector",
        start: { item: "10" },
        end: { item: "missing" }
      }
    ]);

    assert.ok(!xml.includes('id="o40"'));
    assert.ok(!xml.includes('edge="1"'));
  });

  it("converts Miro HTML content into an escaped single-line label", () => {
    const xml = board([
      {
        id: "50",
        type: "sticky_note",
        content: "<p>First &amp; best</p><p>Second &#64;line</p>",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        style: { fillColor: "light_yellow" }
      }
    ]);

    // escaped once for the HTML label, then again for the XML attribute
    assert.match(
      cellFor(xml, "50"),
      /value="First &amp;amp; best&lt;br&gt;Second @line"/
    );
  });

  it("keeps bold and italic formatting from the content", () => {
    const xml = board([
      {
        id: "51",
        type: "sticky_note",
        content:
          "<p><strong>&#64;example.com</strong></p><p>plain and <em>italic</em></p>",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        style: { fillColor: "light_yellow" }
      }
    ]);

    assert.match(
      cellFor(xml, "51"),
      /value="&lt;b&gt;@example.com&lt;\/b&gt;&lt;br&gt;plain and &lt;i&gt;italic&lt;\/i&gt;"/
    );
    assert.match(cellFor(xml, "51"), /html=1/);
  });

  it("does not treat angle brackets in the text as markup", () => {
    const xml = board([
      {
        id: "52",
        type: "sticky_note",
        content: "<p>a &lt;b&gt; tag</p>",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        style: { fillColor: "light_yellow" }
      }
    ]);

    assert.match(cellFor(xml, "52"), /value="a &amp;lt;b&amp;gt; tag"/);
  });

  it("sizes text on what is visible, not on the formatting markup", () => {
    const plain = board([
      {
        id: "53",
        type: "sticky_note",
        content: "<p>Alpha</p>",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        style: { fillColor: "light_yellow" }
      }
    ]);
    const bold = board([
      {
        id: "53",
        type: "sticky_note",
        content: "<p><strong>Alpha</strong></p>",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        style: { fillColor: "light_yellow" }
      }
    ]);

    const sizeOf = (xml: string) =>
      cellFor(xml, "53").match(/fontSize=([0-9.]+)/)?.[1];

    assert.equal(sizeOf(plain), sizeOf(bold));
  });

  it("shrinks text so an unbreakable word fits its shape", () => {
    const xml = board([
      {
        id: "54",
        type: "sticky_note",
        content: "<p>UnbreakableWord</p>",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 213,
        height: 244,
        style: { fillColor: "green" }
      }
    ]);

    const size = Number(cellFor(xml, "54").match(/fontSize=([0-9.]+)/)?.[1]);
    // 12 characters have to sit on one line inside 213 units
    assert.ok(
      size * 12 * 0.55 <= 213,
      `"UnbreakableWord" at ${size} would overflow its note`
    );
  });

  it("draws square sticky notes square, not as tall as Miro declares them", () => {
    // Miro declares a square note ~14.57% taller than it is wide; the extra
    // height is reserve for overflowing text, so adjacent notes would overlap
    const xml = board([
      {
        id: "400",
        type: "sticky_note",
        shape: "square",
        content: "<p>Top</p>",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 212.93,
        height: 243.96,
        style: { fillColor: "green" }
      },
      {
        id: "401",
        type: "sticky_note",
        shape: "square",
        content: "<p>Below</p>",
        relativeTo: "canvas_center",
        x: 0,
        y: 230.84,
        width: 212.93,
        height: 243.96,
        style: { fillColor: "green" }
      }
    ]);

    const top = geometryFor(xml, "400");
    const below = geometryFor(xml, "401");

    assert.equal(top.width, 212.93);
    assert.equal(top.height, 212.93);
    // the notes are 230.84 apart, so a 243.96-tall box would overlap
    assert.ok(
      below.y! >= top.y! + top.height!,
      `notes overlap: first ends at ${top.y! + top.height!}, second starts at ${below.y}`
    );
  });

  it("leaves non-square sticky notes and other shapes at their declared size", () => {
    const xml = board([
      {
        id: "410",
        type: "sticky_note",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 374.5,
        height: 244,
        style: { fillColor: "green" }
      },
      {
        id: "411",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 300,
        height: 100
      }
    ]);

    assert.equal(geometryFor(xml, "410").height, 244);
    assert.equal(geometryFor(xml, "411").height, 100);
  });

  it("resolves Miro's named sticky colours and keeps hex colours as given", () => {
    const xml = board([
      {
        id: "60",
        type: "sticky_note",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        style: { fillColor: "light_yellow" }
      },
      {
        id: "61",
        type: "shape",
        shape: "circle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        style: { fillColor: "#ffffff", borderColor: "#1a1a1a" }
      }
    ]);

    assert.match(cellFor(xml, "60"), /fillColor=#fff9b1/);
    assert.match(cellFor(xml, "61"), /fillColor=#ffffff/);
    assert.match(cellFor(xml, "61"), /ellipse;perimeter=ellipsePerimeter/);
  });

  it("uses a readable font colour on dark sticky notes", () => {
    const xml = board([
      {
        id: "70",
        type: "sticky_note",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        style: { fillColor: "black" }
      }
    ]);

    assert.match(cellFor(xml, "70"), /fontColor=#ffffff/);
  });

  it("skips objects that carry no geometry", () => {
    const xml = board([
      { id: "80", type: "tag", title: "Alpha", color: "light_green" },
      { id: "81", type: "group", itemsIds: ["82"] }
    ]);

    assert.ok(!xml.includes('id="o80"'));
    assert.ok(!xml.includes('id="o81"'));
  });

  it("applies a scale factor to coordinates and sizes", () => {
    const xml = toDrawio(
      [
        {
          id: "90",
          type: "shape",
          shape: "rectangle",
          relativeTo: "canvas_center",
          x: 0,
          y: 0,
          width: 200,
          height: 100
        }
      ] as unknown as BoardObject[],
      { scale: 0.5 }
    );

    assert.deepEqual(geometryFor(xml, "90"), {
      x: 0,
      y: 0,
      width: 100,
      height: 50
    });
  });

  it("keeps an explicit font size and derives one when Miro omits it", () => {
    const xml = board([
      {
        id: "100",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: "<p>Explicit</p>",
        style: { fontSize: 26 }
      },
      {
        // Miro stores no font size on sticky notes; it fits text to the note
        id: "101",
        type: "sticky_note",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 213,
        height: 244,
        content: "<p>MASTER BRANCH (RELEASE BRANCHES)</p>",
        style: { fillColor: "blue" }
      }
    ]);

    assert.match(cellFor(xml, "100"), /fontSize=26;/);

    const derived = Number(
      cellFor(xml, "101").match(/fontSize=([0-9.]+)/)?.[1]
    );
    assert.ok(
      derived > 12,
      `expected a derived size above the default, got ${derived}`
    );
    assert.ok(
      derived <= 244 * 0.4,
      `expected the size to stay within the note, got ${derived}`
    );
  });

  it("stacks larger objects first so backdrops sit behind their contents", () => {
    const xml = board([
      {
        id: "200",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 50,
        height: 50
      },
      {
        id: "201",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 1000,
        height: 1000
      }
    ]);

    // the big backdrop must be declared first so draw.io paints it underneath
    assert.ok(xml.indexOf('id="o201"') < xml.indexOf('id="o200"'));
  });

  it("can keep the exported order instead of stacking by area", () => {
    const objects = [
      {
        id: "300",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 50,
        height: 50
      },
      {
        id: "301",
        type: "shape",
        shape: "rectangle",
        relativeTo: "canvas_center",
        x: 0,
        y: 0,
        width: 1000,
        height: 1000
      }
    ] as unknown as BoardObject[];

    const xml = toDrawio(objects, { zOrder: "source" });

    assert.ok(xml.indexOf('id="o300"') < xml.indexOf('id="o301"'));
  });

  it("escapes the diagram name", () => {
    const xml = toDrawio([], { name: 'A & B <"x">' });

    assert.match(xml, /name="A &amp; B &lt;&quot;x&quot;&gt;"/);
  });
});

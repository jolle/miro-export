# Miro board exporter

Exports Miro frames as full-detail SVGs or JSON using a headless Puppeteer browser.

- [Authentication](#authentication)
- [CLI](#cli)
- [Listing boards](#listing-boards)
- [draw.io export](#drawio-export)
- [Backing up every board](#backing-up-every-board)
- [Programmatic usage](#programmatic-usage)

## Authentication

If accessing a private board, a personal token is required. To get a token, log in to Miro using a regular web browser, and then copy the value of the "token" cookie from developer tools. This is the token that should be used. If the board can be accessed without an account using a public link, the token is optional.

### Supplying the token from the environment

Instead of passing `--token` (or the `token` option) every time, the token can be
put in the `MIRO_TOKEN` environment variable. A `.env` file in the working
directory is picked up automatically:

```sh
# .env
MIRO_TOKEN=your-token-cookie-value
```

An explicitly passed token always wins over the environment, and a variable that
is already set in the real environment wins over the `.env` file. See
[.env.example](.env.example) for a template.

> [!WARNING]
> The token grants access to everything your Miro account can see. `.env` is
> git-ignored — keep it that way.

## CLI

You can use this tool as a command-line tool.

### Prerequisites

- [Node.js >=22](https://nodejs.org/en/download)
- npm (built-in to Node.js), yarn, or pnpm

### Installation

The CLI can be ran using [npx](https://docs.npmjs.com/cli/v8/commands/npx) with `npx miro-export [options]` (see options below). Alternatively, it's possible to install the package to the global scope with, for example, `npm i -g miro-export`.

### Usage

```
Commands:
  export [options]                   Export a board or its frames (default command)
  list-boards [options]              List the boards the token has access to

Options for export (may be given without naming the command):
  -t, --token <token>                Miro token (defaults to the MIRO_TOKEN environment variable)
  -b, --board-id <boardId>           The board ID
  -f, --frame-names <frameNames...>  The frame name(s), leave empty to export entire board
  -o, --output-file <filename>       A file to output the SVG to (stdout if not specified)
  -e, --export-format <format>       'svg' or 'json' (default: "svg")
  -l, --load-timeout <milliseconds>  Timeout for loading the board in milliseconds (default: 15000)
  -s, --sdk-timeout <milliseconds>   Timeout for the Miro SDK to become available in milliseconds (default: 30000)
  -h, --help                         display help for command
```

### Examples

```sh
# export "Frame 2" to the file "My Frame 2.svg"
miro-export -t XYZ -b uMoVLkx8gIc= -f "Frame 2" -o "My Frame 2.svg"

# using npx
npx miro-export -t XYZ -b uMoVLkx8gIc= -f "Frame 2" -o "My Frame 2.svg"

# export entire board to stdout
miro-export -t XYZ -b uMoVLkx8gIc=

# export "Frame 2" and "Frame 3" to "Frame 2.svg" and "Frame 3.svg" respectively
miro-export -t XYZ -b uMoVLkx8gIc= -f "Frame 2" "Frame 3" -o "{frameName}.svg"

# export JSON representation of "Frame 2"
miro-export -t XYZ -b uMoVLkx8gIc= -f "Frame 2" -e json

# with MIRO_TOKEN set (e.g. in .env), the token can be left out
miro-export -b uMoVLkx8gIc=
```

### Capturing multiple frames at once

It is possible to give multiple frames to the `-f` switch, e.g., `-f "Frame 2" "Frame 3"`. However, for SVG export, this will capture all content that is within the outer bounding box when all frames have been selected, so content between the frames will be captured as well. If you want separate SVGs for each frame (and thus avoiding capturing content in between), use the output file switch with `{frameName}` in the file name, e.g., `-o "Export - {frameName}.svg"`. It is not possible to export separate SVGs without the output file specified (i.e., to stdout).

### JSON export

The JSON export format is a Miro-internal representation of all the board objects. It is not a documented format, but it is quite easy to understand. The exported format is always an array of objects that have the field `type` as a discriminator. Depending on the type, fields change. Some of the types have been documented as TypeScript interfaces at [miro-types.ts](src/miro-types.ts). For example, a `sticky_note` object could look like this:

```json
{
  "type": "sticky_note",
  "shape": "square",
  "content": "<p>Test content</p>",
  "style": {
    "fillColor": "cyan",
    "textAlign": "center",
    "textAlignVertical": "middle"
  },
  "tagIds": [],
  "id": "3458764564249021457",
  "parentId": "3458764564247784511",
  "origin": "center",
  "relativeTo": "parent_top_left",
  "createdAt": "2023-09-11T12:45:00.041Z",
  "createdBy": "3458764537906310005",
  "modifiedAt": "2023-09-11T12:46:01.041Z",
  "modifiedBy": "3458764537906310005",
  "connectorIds": [],
  "x": 129.29101113436059,
  "y": 201.25587788616645,
  "width": 101.46000000000001,
  "height": 125.12
}
```

## Listing boards

To find out which board IDs are available, use the `list-boards` command. Unlike
exporting, this talks to Miro's board listing endpoint directly and does not
start a browser, so it returns in about a second. A token is always required —
there is no anonymous board listing.

```
Options:
  -t, --token <token>           Miro token (defaults to the MIRO_TOKEN environment variable)
  -o, --output-file <filename>  A file to output the list to (stdout if not specified)
  -e, --export-format <format>  'table', 'json' or 'ids' (default: "table")
  -q, --query <text>            Only list boards whose title contains this text
  --include-trashed             Include boards that are in the trash
  -h, --help                    display help for command
```

```sh
# list every board, one per line: ID, last modified date, title
miro-export list-boards

# find a board by (part of) its title
miro-export list-boards -q "product"

# full details as JSON
miro-export list-boards -e json

# export every board whose title mentions "product"
miro-export list-boards -q product -e ids | while read -r id; do
  miro-export -b "$id" -o "$id.svg"
done
```

## draw.io export

Boards can be converted to native [draw.io](https://www.drawio.com/) diagrams.
This is a real conversion, not an embedded picture: sticky notes, shapes, text
and frames become draw.io cells, and Miro connectors become draw.io edges with
proper `source`/`target` references, so everything stays selectable and
editable. The output is uncompressed mxGraph XML.

```sh
# straight from Miro
miro-export -b uMoVLkx8gIc= -e drawio -o board.drawio

# or convert a JSON export you already have, without contacting Miro
miro-export convert -i board.json -o board.drawio -n "My board"
```

```
Options for convert:
  -i, --input-file <filename>   A JSON file exported with -e json
  -o, --output-file <filename>  A file to output the diagram to (stdout if not specified)
  -n, --name <name>             Diagram name shown on the draw.io page tab
  --scale <factor>              Factor applied to all coordinates and sizes (default: 1)
```

Converting from a saved JSON export is preferred when doing many boards: the
JSON is the complete record of the board, and converting it costs nothing on
Miro's side.

### What carries over

| Miro           | draw.io                                                      |
| -------------- | ------------------------------------------------------------ |
| `frame`        | container cell, titled, with its children nested inside      |
| `sticky_note`  | filled rectangle, Miro's named colours resolved to hex       |
| `shape`        | matching draw.io shape, with fill, border and font styling   |
| `text`         | label-only cell                                              |
| `connector`    | edge with `source`/`target`, arrow heads, stroke and caption |
| `image`        | labelled placeholder — see below                             |
| `tag`, `group` | dropped; they carry no geometry                              |

> [!NOTE]
> Miro's JSON export does not include image data or a usable image URL, so
> images become dashed placeholders labelled with their alt text. Connectors
> whose endpoints are not part of the export are dropped rather than emitted
> as dangling edges.

Miro positions objects by their centre while draw.io uses top-left corners, so
coordinates are translated and the whole board is shifted into positive space.
Frame children keep their parent-relative positions.

### Fidelity notes

A few things do not survive a literal translation, and are reconstructed:

- **Stacking.** draw.io paints in document order and Miro's export order is not
  a z-order, so large shapes used as backdrops would cover their own contents.
  Cells are emitted largest-first. Pass `zOrder: "source"` to keep the exported
  order instead.
- **Font sizes.** Miro stores no font size for sticky notes or frame titles —
  it fits sticky text to the note and draws frame titles as chrome. Left alone,
  every one of them falls back to draw.io's 12pt default and the whole board
  reads as one size. Sizes are instead derived by wrapping the text at spaces
  and finding the largest size that still fits the shape; because text only
  breaks at spaces, the longest single word sets the ceiling. Shapes and text
  keep the size Miro recorded. The metrics used for the estimate are the
  constants at the top of [drawio.ts](src/drawio.ts).
- **Bold and italic** are kept as draw.io HTML labels. Labels are escaped
  twice — once for the HTML label, once for the XML attribute — so content
  that merely looks like markup stays text.
- **Curved connectors.** Miro records no waypoints, and draw.io can only curve
  through the points of a route, so `curved=1` on its own draws a straight
  line. Curved connectors are given an orthogonal route for draw.io to smooth.
- **Square sticky notes** declare a box 14.57% taller than it is wide. The
  extra height is reserve for text that overflows the note rather than part of
  the note, so vertically adjacent notes' declared boxes overlap even though
  Miro draws a gap between them. They are emitted square. (Miro insets the
  note by roughly a further 9% in both directions; that is left alone, since
  it only affects spacing, not overlap.)
- **Connector anchors.** Where Miro recorded which point or side a connector
  attaches to, it is carried over as draw.io `exitX`/`entryX` so the routing
  keeps the original shape rather than being re-decided.

## Backing up every board

`backup` walks the whole board list and writes each board into its own
directory under a timestamped run directory.

```sh
# see what would be exported, without contacting Miro
miro-export backup --dry-run

# try it on five boards first
miro-export backup -n 5 -e json,svg,drawio

# the real thing
miro-export backup -e json,svg,drawio

# pick up where an interrupted run left off
miro-export backup -e json,svg,drawio --resume exports/2026-08-14T10-23-43Z
```

```
Options:
  -t, --token <token>                Miro token (defaults to the MIRO_TOKEN environment variable)
  -d, --output-dir <directory>       Directory the run directory is created in (default: "exports")
  -e, --export-format <formats>      Comma separated list of 'json', 'svg' and 'drawio' (default: json,svg)
  -n, --limit <count>                Only back up the first N boards
  -q, --query <text>                 Only back up boards whose title contains this text
  --include-trashed                  Include boards that are in the trash
  --delay <milliseconds>             Pause between boards (default: 5000)
  --retries <count>                  Attempts per board (default: 3)
  --retry-delay <milliseconds>       Delay before the first retry, doubled each attempt (default: 15000)
  -l, --load-timeout <milliseconds>  Timeout for loading each board (default: 15000)
  -s, --sdk-timeout <milliseconds>   Timeout for the Miro SDK to become available (default: 30000)
  --resume <directory>               Continue a previous run, skipping boards it already exported
  --dry-run                          List what would be exported without contacting Miro
```

### Output

```
exports/
  2026-08-14T10-23-43Z/
    manifest.json
    Product Roadmap--uXjVEXAMPLE1=/
      board.json
      board.svg
      board.drawio
    Team Retro-Q3--uXjVEXAMPLE2=/
      ...
```

Board titles become directory names, so slashes, colons and the other
characters Windows reserves are replaced, control characters are stripped,
trailing dots and spaces are removed, names Windows reserves outright (`CON`,
`NUL`, `COM1`…) are suffixed, and long titles are shortened. The board ID is
appended so that boards sharing a title — there are usually several called
"Untitled" — never collide.

`manifest.json` records every board with its status, attempt count, output
paths, file sizes and duration, so a run can be audited afterwards. The command
exits non-zero if any board failed.

### Pacing and failures

Boards are done one at a time, in a fresh browser each time, with a pause in
between — the cost is per board (roughly 10–45 seconds of browser work each),
not per API call, since the board list is a single request. A failed board is
retried with a doubling backoff, capped at five minutes, and after the last
attempt it is recorded in the manifest and the run moves on rather than
aborting. Re-run with `--resume <directory>` to fill in whatever failed: boards
that already have all their files are skipped without touching Miro.

## Programmatic usage

```ts
import { MiroBoard, listBoards, toDrawio } from "miro-export";

// list the boards the token can access; the token defaults to MIRO_TOKEN
const boards = await listBoards({ token: "..." /* optional */ });
console.log(boards.map(({ id, title }) => `${id} ${title}`));

// convert board objects to a native draw.io diagram
const diagram = toDrawio(await miroBoard.getBoardObjects({}), {
  name: "My board"
});

await using miroBoard = new MiroBoard({
  boardId: "uMoVLkx8gIc=", // required
  token: "..." // optional, defaults to MIRO_TOKEN
});

// get all board objects of type frame and with title "Frame 1"
const framesWithTitleFrame1 = await miroBoard.getBoardObjects(
  { type: "frame" }, // required (but empty object is OK too), limited field support
  { title: "Frame 1" } // optional additional filters
);

// get SVG of the first frame found above
const svgOfFrame1 = await miroBoard.getSvg([framesWithTitleFrame1[0].id]);

// if you can't use "await using" for disposal, you can also dispose manually:
// await miroBoard.dispose()
// this can also be used to close the browser at the middle of the current scope
```

> [!WARNING]  
> Remember to dispose the instance to make sure the browser is closed and the process
> can exit. `await using` (as shown above) does this automatically, but is not supported
> in all environments and may not be the optimal choice in every case. Alternatively,
> `miroBoard.dispose()` may be called at any time to dispose of the instance manually.

Types for many of the common board object types has been provided in [miro-types.ts](src/miro-types.ts).

## Tests

```sh
pnpm run test:unit   # no network or token needed
pnpm run test:live   # listBoards against the real API; skipped unless MIRO_TOKEN is set
pnpm test            # everything, including the board fixtures below
```

`test:board-object-types` and `test:api` need `TEST_BOARD_ID`,
`PRIVATE_TEST_BOARD_ID` and `BUGGY_TEST_BOARD_ID` to point at boards set up as
the assertions in [tests/api.test.ts](tests/api.test.ts) expect. All of these
may be set in `.env`.

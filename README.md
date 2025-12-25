# Miro board exporter

Exports Miro frames as full-detail SVGs or JSON using a headless Puppeteer browser.

- [Authentication](#authentication)
- [CLI](#cli)
- [Programmatic usage](#programmatic-usage)

## Authentication

If accessing a private board, a personal token is required. To get a token, log in to Miro using a regular web browser, and then copy the value of the "token" cookie from developer tools. This is the token that should be used. If the board can be accessed without an account using a public link, the token is optional.

## CLI

You can use this tool as a command-line tool.

### Prerequisites

- [Node.js >=22](https://nodejs.org/en/download)
- npm (built-in to Node.js), yarn, or pnpm

### Installation

The CLI can be ran using [npx](https://docs.npmjs.com/cli/v8/commands/npx) with `npx miro-export [options]` (see options below). Alternatively, it's possible to install the package to the global scope with, for example, `npm i -g miro-export`.

### Usage

```
Options:
  -t, --token <token>                Miro token
  -b, --board-id <boardId>           The board ID
  -f, --frame-names <frameNames...>  The frame name(s), leave empty to export entire board
  -o, --output-file <filename>       A file to output the SVG to (stdout if not specified)
  -e, --export-format <format>       'svg' or 'json' (default: "svg")
  -l, --load-timeout <milliseconds>  Timeout for loading the board in milliseconds (default: 15000)
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

## Programmatic usage

```ts
import { MiroBoard } from "miro-export";

await using miroBoard = new MiroBoard({
  boardId: "uMoVLkx8gIc=", // required
  token: "..." // optional
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
> in all environments and may not be the optimal choise in every case. Alternatively,
> `miroBoard.dispose()` may be called at any time to dispose of the instance manually.

Types for many of the common board object types has been provided in [miro-types.ts](src/miro-types.ts).

# Miro board exporter

Exports Miro frames as full-detail SVGs or JSON using a headless Puppeteer browser. Requires a personal Miro token.

## Getting the Miro token

Log in to Miro using your regular web browser, and then copy the value of the "token" cookie from developer tools. This is the token that this tool requires.

## Usage

```
Options:
  -t, --token <token>                Miro token
  -b, --board-id <boardId>           The board ID
  -f, --frame-names <frameNames...>  The frame name(s), leave empty to export entire board
  -o, --output-file <filename>       A file to output the SVG to (stdout if not supplied)
  -e, --export-format <format>       'svg' or 'json' (default: 'svg')
  -h, --help                         display help for command
```

## Examples

```sh
# export "Frame 2" to the file "My Frame 2.svg"
miro-export -t XYZ -b uMoVLkx8gIc= -f "Frame 2" -o "My Frame 2.svg"

# export entire board to stdout
miro-export -t XYZ -b uMoVLkx8gIc=

# export "Frame 2" and "Frame 3" to "Frame 2.svg" and "Frame 3.svg" respectively
miro-export -t XYZ -b uMoVLkx8gIc= -f "Frame 2" "Frame 3" -o "{frameName}.svg"

# export JSON representation of "Frame 2"
miro-export -t XYZ -b uMoVLkx8gIc= -f "Frame 2" -e json
```

## Capturing multiple frames at once

It is possible to supply multiple frames to the `-f` switch, e.g., `-f "Frame 2" "Frame 3"`. However, for SVG export, this will capture all content that is within the outer bounding box when all frames have been selected, so content between the frames will be captured as well. If you want separate SVGs for each frame, use the output file switch with `{frameName}` in the file name, e.g., `-o "Export - {frameName}.svg"`. It is not possible to export separate SVGs without the output file specified (i.e., to stdout).

## JSON export

The JSON export format is a Miro-internal representation of all the board objects. It is not a documented format, but it is quite easy to understand. The exported format is always an array of objects that have the field `type` as a discriminator. Depending on the type, fields change, but there is always at least an `id` field. For example, a `sticky_note` object could look like this:

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

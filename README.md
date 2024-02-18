# Miro board exporter

Exports Miro frames as full-detail SVGs using a headless Puppeteer browser. Requires a personal Miro token.

## Getting the Miro token

Log in to Miro using your regular web browser, and then copy the value of the "token" cookie from developer tools. This is the token that this tool requires.

## Usage

```
Options:
  -t, --token <token>                Miro token
  -b, --board-id <boardId>           The board ID
  -f, --frame-names <frameNames...>  The frame name(s), leave empty to export entire board
  -o, --output-file <filename>       A file to output the SVG to (stdout if not supplied)
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
```

## Capturing multiple frames at once

It is possible to supply multiple frames to the `-f` switch, e.g., `-f "Frame 2" "Frame 3"`. However, this will capture all content that is within the outer bounding box when all frames have been selected, so content between the frames will be captured as well. If you want separate SVGs for each frame, use the output file switch with `{frameName}` in the file name, e.g., `-o "Export - {frameName}.svg"`. It is not possible to export separate SVGs without the output file specified (i.e., to stdout).

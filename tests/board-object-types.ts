import { resolve } from "path";
import { MiroBoard } from "../src";
import * as tsj from "ts-json-schema-generator";
import Ajv from "ajv";

(async () => {
  const config = {
    path: resolve(import.meta.dirname, "../src/miro-types.ts"),
    tsconfig: resolve(import.meta.dirname, "../tsconfig.json"),
    type: "BoardObject"
  };
  const schema = tsj.createGenerator(config).createSchema(config.type);

  const boardId = process.env.TEST_BOARD_ID;

  if (!boardId) {
    console.error("TEST_BOARD_ID environment variable is required.");
    process.exit(1);
  }

  const miroBoard = new MiroBoard({ boardId });
  const objects = await miroBoard.getBoardObjects({});
  await miroBoard.dispose();

  for (const object of objects) {
    const ajv = new Ajv();
    if (!ajv.validate(schema, object)) {
      console.log(
        "Failed to validate object: ",
        JSON.stringify(
          object,
          process.env.CI
            ? (key, value) => {
                if (key === "type") {
                  return value;
                }

                if (typeof value === "string") {
                  return "string";
                } else if (typeof value === "number") {
                  return 0;
                } else {
                  return value;
                }
              }
            : undefined,
          2
        )
      );
      console.error(ajv.errors);
      process.exit(1);
    }
  }
})();

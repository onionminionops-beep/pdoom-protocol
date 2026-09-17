import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format } from "prettier";
import { expect, it } from "vitest";
import { renderContractReference } from "./helpers/contracts";

it("keeps the generated contract reference synchronized with Zod", async () => {
  const path = resolve("docs/CONTRACTS.md");
  const document = readFileSync(path, "utf8");
  const start = "<!-- generated-contracts:start -->";
  const end = "<!-- generated-contracts:end -->";
  const expected = await format(`${start}\n\n${renderContractReference()}\n\n${end}\n`, {
    parser: "markdown",
    printWidth: 100,
  });
  const pattern = /<!-- generated-contracts:start -->[\s\S]*<!-- generated-contracts:end -->\n/;
  expect(document).toMatch(pattern);
  if (process.env.UPDATE_CONTRACTS === "1") {
    writeFileSync(path, document.replace(pattern, expected));
  }
  expect(readFileSync(path, "utf8").match(pattern)?.[0]).toBe(expected);
});

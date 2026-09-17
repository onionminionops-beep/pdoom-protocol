import { z } from "zod";
import {
  ApiErrorSchema,
  DecisionRequestSchema,
  DecisionResponseSchema,
  SessionResponseSchema,
} from "../../../src/game/contracts/decision";
import { GameObservationV1Schema } from "../../../src/game/contracts/observation";
import { PlayerInputV1Schema } from "../../../src/game/contracts/input";

type Schema = z.core.JSONSchema.JSONSchema;

function describe(schema: Schema): string {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(", ");
  if (schema.anyOf) return schema.anyOf.map(describe).join(" or ");
  const item = schema.items;
  const type =
    item && typeof item === "object" && !Array.isArray(item)
      ? `array<${describe(item)}>`
      : typeof schema.additionalProperties === "object"
        ? `record<string, ${describe(schema.additionalProperties)}>`
        : (schema.type ?? "record");
  const constraints = [
    schema.minLength !== undefined ? `minLength=${schema.minLength}` : "",
    schema.maxLength !== undefined ? `maxLength=${schema.maxLength}` : "",
    schema.minimum !== undefined ? `min=${schema.minimum}` : "",
    schema.maximum !== undefined ? `max=${schema.maximum}` : "",
    schema.maxItems !== undefined ? `maxItems=${schema.maxItems}` : "",
  ].filter(Boolean);
  return [type, ...constraints].join("; ");
}

function fields(schema: Schema, prefix = ""): string[] {
  return Object.entries(schema.properties ?? {}).flatMap(([key, field]) => {
    if (typeof field === "boolean") throw new Error("Unsupported boolean schema");
    const path = prefix ? `${prefix}.${key}` : key;
    const row = `| \`${path}\` | ${schema.required?.includes(key) ? "yes" : "no"} | \`${describe(field)}\` |`;
    const item = field.items;
    const children = item && typeof item === "object" && !Array.isArray(item) ? item : field;
    return [row, ...fields(children, item ? `${path}[]` : path)];
  });
}

export function renderContractReference(): string {
  const schemas = {
    PlayerInputV1Schema,
    GameObservationV1Schema,
    DecisionRequestSchema,
    DecisionResponseSchema,
    SessionResponseSchema,
    ApiErrorSchema,
  };
  return Object.entries(schemas)
    .map(([name, schema]) => {
      return [
        `### ${name}`,
        "",
        "| Field | Required | Type / constraints |",
        "| --- | --- | --- |",
        ...fields(z.toJSONSchema(schema)),
      ].join("\n");
    })
    .join("\n\n");
}

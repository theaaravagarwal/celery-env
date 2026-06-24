import type { Spec } from "./index.js";
export type GenerateValidatorOptions = { functionName?: string; processDefault?: boolean; minify?: boolean; failFast?: boolean; optimize?: "default" | "speed"; splitLarge?: boolean; splitLargeThreshold?: number };
export type GenerateJsonSchemaOptions = { title?: string; additionalProperties?: boolean };
export function generateValidator(schema: Record<string, Spec<unknown>>, options?: GenerateValidatorOptions): string;
export function generateTypes(schema: Record<string, Spec<unknown>>, options?: { functionName?: string; processDefault?: boolean }): string;
export function generateExample(schema: Record<string, Spec<unknown>>): string;
export function generateJsonSchema(schema: Record<string, Spec<unknown>>, options?: GenerateJsonSchemaOptions): Record<string, unknown>;

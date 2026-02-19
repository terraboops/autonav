/**
 * Generate a human-readable description of the NavigatorConfigSchema.
 *
 * Introspects the Zod schema dynamically so the description stays in sync
 * with the actual config structure. Used to inject config awareness into
 * navigator system prompts (chat and interview modes).
 */

import { z } from 'zod';
import { NavigatorConfigSchema } from './config.js';

// ── Zod introspection types ─────────────────────────────────────────────────

interface FieldInfo {
  type: string;
  description: string;
  optional: boolean;
  defaultValue?: unknown;
  children?: Record<string, FieldInfo>;
  arrayItemChildren?: Record<string, FieldInfo>;
  enumValues?: string[];
}

// ── Schema analysis ─────────────────────────────────────────────────────────

function analyzeZodField(schema: z.ZodTypeAny): FieldInfo {
  const def = schema._def as Record<string, unknown>;
  const typeName = def.typeName as string;

  // Unwrap wrapper types (order matters: optional/default/nullable are outermost)
  if (typeName === 'ZodOptional') {
    const inner = analyzeZodField(def.innerType as z.ZodTypeAny);
    inner.optional = true;
    if (!inner.description && def.description) inner.description = def.description as string;
    return inner;
  }

  if (typeName === 'ZodDefault') {
    const inner = analyzeZodField(def.innerType as z.ZodTypeAny);
    inner.optional = true; // has default → not required in JSON
    inner.defaultValue = (def.defaultValue as () => unknown)();
    if (!inner.description && def.description) inner.description = def.description as string;
    return inner;
  }

  if (typeName === 'ZodNullable') {
    const inner = analyzeZodField(def.innerType as z.ZodTypeAny);
    inner.type += ' | null';
    if (!inner.description && def.description) inner.description = def.description as string;
    return inner;
  }

  // Base types
  const description = (def.description as string) || '';

  if (typeName === 'ZodString') {
    return { type: 'string', description, optional: false };
  }
  if (typeName === 'ZodNumber') {
    return { type: 'number', description, optional: false };
  }
  if (typeName === 'ZodBoolean') {
    return { type: 'boolean', description, optional: false };
  }
  if (typeName === 'ZodEnum') {
    return {
      type: 'enum',
      description,
      optional: false,
      enumValues: def.values as string[],
    };
  }
  if (typeName === 'ZodRecord') {
    return { type: 'object (key-value pairs)', description, optional: false };
  }
  if (typeName === 'ZodArray') {
    const itemType = def.type as z.ZodTypeAny;
    const itemInfo = analyzeZodField(itemType);
    if (itemInfo.children) {
      return {
        type: 'array of objects',
        description,
        optional: false,
        arrayItemChildren: itemInfo.children,
      };
    }
    return { type: `${itemInfo.type}[]`, description, optional: false };
  }
  if (typeName === 'ZodObject') {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const children: Record<string, FieldInfo> = {};
    for (const [key, childField] of Object.entries(shape)) {
      children[key] = analyzeZodField(childField as z.ZodTypeAny);
    }
    return { type: 'object', description, optional: false, children };
  }

  return { type: 'unknown', description, optional: false };
}

// ── Formatting ──────────────────────────────────────────────────────────────

function formatField(key: string, info: FieldInfo, depth: number): string {
  const indent = '  '.repeat(depth);
  const parts: string[] = [];

  // Type string (use enum values inline if present)
  let typeStr = info.type;
  if (info.enumValues) {
    typeStr = info.enumValues.map((v) => `"${v}"`).join(' | ');
  }

  // Build the main line
  let line = `${indent}- ${key} (${typeStr}`;
  if (info.optional) line += ', optional';
  if (info.defaultValue !== undefined) {
    const defStr = JSON.stringify(info.defaultValue);
    // Only show defaults that are short enough to be readable
    if (defStr.length <= 40) line += `, default: ${defStr}`;
  }
  line += ')';
  if (info.description) line += `: ${info.description}`;
  parts.push(line);

  // Recurse into children (nested objects)
  if (info.children) {
    for (const [childKey, childInfo] of Object.entries(info.children)) {
      parts.push(formatField(childKey, childInfo, depth + 1));
    }
  }

  // Recurse into array item children
  if (info.arrayItemChildren) {
    parts.push(`${indent}  Each item:`);
    for (const [childKey, childInfo] of Object.entries(info.arrayItemChildren)) {
      parts.push(formatField(childKey, childInfo, depth + 2));
    }
  }

  return parts.join('\n');
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a human-readable description of the navigator config.json schema.
 *
 * Dynamically introspects NavigatorConfigSchema so the description
 * automatically reflects any schema changes.
 */
export function describeConfigSchema(): string {
  const lines: string[] = [];

  for (const [key, field] of Object.entries(NavigatorConfigSchema.shape)) {
    lines.push(formatField(key, analyzeZodField(field as z.ZodTypeAny), 0));
  }

  return lines.join('\n');
}

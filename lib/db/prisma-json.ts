import { Prisma } from '@prisma/client';

type JsonPrimitive = string | number | boolean | null;
type JsonLike = JsonPrimitive | JsonLike[] | { [key: string]: JsonLike | undefined };

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)]),
    ) as T;
  }

  return value;
}

export function toPrismaJson(value: JsonLike | unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return stripUndefinedDeep(value) as Prisma.InputJsonValue;
}

export function toNullablePrismaJson(value: JsonLike | unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return stripUndefinedDeep(value) as Prisma.InputJsonValue;
}

export function toOptionalPrismaJson(value: JsonLike | unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  return toPrismaJson(value);
}

export function normalizeJsonObject(value: unknown): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return stripUndefinedDeep(value) as Prisma.InputJsonObject;
}

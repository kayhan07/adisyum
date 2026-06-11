import { prisma } from '@/lib/db/prisma';
import { toPrismaJson } from '@/lib/db/prisma-json';

function json(value: unknown) {
  return toPrismaJson(value ?? {});
}

export async function listOperatorMemory(operatorId: string, kind?: string) {
  return prisma.operatorMemory.findMany({
    where: { operatorId, kind },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
}

export async function upsertOperatorMemory(input: {
  operatorId: string;
  kind: string;
  key: string;
  label?: string | null;
  payload?: unknown;
}) {
  return prisma.operatorMemory.upsert({
    where: { operatorId_kind_key: { operatorId: input.operatorId, kind: input.kind, key: input.key } },
    update: { label: input.label ?? null, payload: json(input.payload) },
    create: {
      operatorId: input.operatorId,
      kind: input.kind,
      key: input.key,
      label: input.label ?? null,
      payload: json(input.payload),
    },
  });
}

export async function deleteOperatorMemory(input: { operatorId: string; kind: string; key: string }) {
  return prisma.operatorMemory.delete({
    where: { operatorId_kind_key: input },
  });
}




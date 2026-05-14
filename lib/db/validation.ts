import { z } from 'zod';

export const tenantIdSchema = z.string().trim().min(1).max(64);

export const paginationSchema = z.object({
  take: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(180),
  categoryId: z.string().uuid().optional().nullable(),
  sku: z.string().trim().max(80).optional().nullable(),
  barcode: z.string().trim().max(80).optional().nullable(),
  price: z.coerce.number().nonnegative(),
  vatRate: z.coerce.number().int().refine((value) => [1, 10, 20].includes(value)),
  unitType: z.string().trim().min(1).max(32).default('adet'),
});

export const syncEventSchema = z.object({
  deviceId: z.string().trim().max(120).optional(),
  eventId: z.string().trim().min(1).max(160),
  eventType: z.string().trim().min(1).max(120),
  payload: z.unknown(),
  updatedAt: z.coerce.date().optional(),
});

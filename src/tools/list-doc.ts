import { z } from 'zod';
import { SQLiteStorage } from '../storage/sqlite.js';
import { createErrorResponse, createSuccessResponse } from './utils.js';

export const listDocSchema = z.object({
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
  sort: z.enum(['created_at', 'updated_at']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional()
});

export const listDocHandler = (storage: SQLiteStorage, args: unknown) => {
  try {
    const params = listDocSchema.parse(args || {});
    // Filter out "status" as our MVP schema doesn't have status, but we accept it per spec
    const docs = storage.listDocuments({
      type: params.type,
      tags: params.tags,
      sort: params.sort,
      limit: params.limit,
      offset: params.offset
    });
    return createSuccessResponse(docs);
  } catch (e) {
    const error = e as any;
    if (error instanceof z.ZodError) {
      return createErrorResponse(`Validation Error: ${error.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`).join(', ')}`);
    }
    return createErrorResponse(error?.message || 'Unknown error list-doc');
  }
};

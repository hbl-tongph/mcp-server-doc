import { z } from 'zod';
import { SQLiteStorage } from '../storage/sqlite.js';
import { createErrorResponse, createSuccessResponse } from './utils.js';

export const updateDocSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional()
});

export const updateDocHandler = (storage: SQLiteStorage, args: unknown) => {
  try {
    const params = updateDocSchema.parse(args || {});
    
    const hasUpdate =
      params.title !== undefined ||
      params.content !== undefined ||
      params.type !== undefined ||
      params.tags !== undefined;
    if (!hasUpdate) {
      return createErrorResponse('No fields to update provided');
    }
    
    const updates = {
      ...(params.title !== undefined && { title: params.title }),
      ...(params.content !== undefined && { content: params.content }),
      ...(params.type !== undefined && { type: params.type }),
      ...(params.tags !== undefined && { tags: params.tags })
    };
    
    const updated = storage.updateDocument(params.id, updates);
    return createSuccessResponse(updated);
  } catch (e) {
    const error = e as any;
    if (error instanceof z.ZodError) {
      return createErrorResponse(`Validation Error: ${error.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`).join(', ')}`);
    }
    return createErrorResponse(error?.message || 'Unknown error update-doc');
  }
};

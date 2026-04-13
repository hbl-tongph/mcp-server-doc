import { z } from 'zod';
import { SQLiteStorage } from '../storage/sqlite.js';
import { createErrorResponse, createSuccessResponse } from './utils.js';

export const getDocSchema = z.object({
  id: z.string().min(1)
});

export const getDocHandler = (storage: SQLiteStorage, args: unknown) => {
  try {
    const params = getDocSchema.parse(args || {});
    const doc = storage.getDocument(params.id);
    
    if (!doc) {
      return createErrorResponse(`Document with ID ${params.id} not found`);
    }
    
    return createSuccessResponse(doc);
  } catch (e) {
    const error = e as any;
    if (error instanceof z.ZodError) {
      return createErrorResponse(`Validation Error: ${error.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`).join(', ')}`);
    }
    return createErrorResponse(error?.message || 'Unknown error get-doc');
  }
};

import { z } from 'zod';
import { SQLiteStorage } from '../storage/sqlite.js';
import { createErrorResponse, createSuccessResponse } from './utils.js';

export const deleteDocSchema = z.object({
  id: z.string().min(1),
  confirm: z.boolean().refine(val => val === true, {
    message: "confirm flag must be true to delete"
  })
});

export const deleteDocHandler = (storage: SQLiteStorage, args: unknown) => {
  try {
    const params = deleteDocSchema.parse(args || {});
    
    const deleted = storage.deleteDocument(params.id);
    if (!deleted) {
      return createErrorResponse(`Document with ID ${params.id} not found`);
    }
    
    return createSuccessResponse({ success: true, message: `Document ${params.id} deleted successfully.` });
  } catch (e) {
    const error = e as any;
    if (error instanceof z.ZodError) {
      return createErrorResponse(`Validation Error: ${error.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`).join(', ')}`);
    }
    return createErrorResponse(error?.message || 'Unknown error delete-doc');
  }
};

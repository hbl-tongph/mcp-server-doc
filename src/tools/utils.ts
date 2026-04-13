export function createErrorResponse(message: string) {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

export function createSuccessResponse(data: unknown) {
  return {
    isError: false,
    content: [{ type: "text", text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }]
  };
}

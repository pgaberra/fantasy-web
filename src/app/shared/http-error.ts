import { HttpErrorResponse } from '@angular/common/http';

export const SERVER_UNREACHABLE_MESSAGE =
  "We can't reach the server right now. Please try again in a moment.";

export function isConnectivityError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
}

export function messageForError(error: unknown, causeMessage: string): string {
  return isConnectivityError(error) ? SERVER_UNREACHABLE_MESSAGE : causeMessage;
}

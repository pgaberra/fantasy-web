import { HttpErrorResponse } from '@angular/common/http';

export const SERVER_UNREACHABLE_MESSAGE = "Can't reach the server. Try again in a moment.";

export function isConnectivityError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
}

export function messageForError(error: unknown, causeMessage: string): string {
  return isConnectivityError(error) ? SERVER_UNREACHABLE_MESSAGE : causeMessage;
}

/**
 * The little of Node the specs reach for. The app never does — it runs in a browser — so the
 * repo carries no `@types/node`, and declaring the two functions a golden-vector file is read
 * and written with is cheaper than a dependency the app would then be able to import.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string, encoding: 'utf8'): void;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}

declare const process: {
  cwd(): string;
  readonly env: Record<string, string | undefined>;
};

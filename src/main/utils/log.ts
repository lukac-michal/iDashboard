// ============================================================
// Timestamped logging utility
// ============================================================

function ts(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

export function log(tag: string, ...args: unknown[]): void {
  console.log(`[${ts()}] [${tag}]`, ...args);
}

export function warn(tag: string, ...args: unknown[]): void {
  console.warn(`[${ts()}] [${tag}]`, ...args);
}

export function error(tag: string, ...args: unknown[]): void {
  console.error(`[${ts()}] [${tag}]`, ...args);
}

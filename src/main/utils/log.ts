// ============================================================
// Timestamped logging utility
// ============================================================

import type { LogCollector } from '@main/services/log-collector';

let collector: LogCollector | null = null;

export function setLogCollector(lc: LogCollector): void {
  collector = lc;
}

function ts(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

function argsToString(args: unknown[]): string {
  return args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
}

export function log(tag: string, ...args: unknown[]): void {
  console.log(`[${ts()}] [${tag}]`, ...args);
  collector?.append('log', tag, argsToString(args));
}

export function warn(tag: string, ...args: unknown[]): void {
  console.warn(`[${ts()}] [${tag}]`, ...args);
  collector?.append('warn', tag, argsToString(args));
}

export function error(tag: string, ...args: unknown[]): void {
  console.error(`[${ts()}] [${tag}]`, ...args);
  collector?.append('error', tag, argsToString(args));
}

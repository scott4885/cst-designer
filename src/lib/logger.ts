/**
 * Centralized scoped logger.
 *
 * Replaces ad-hoc `console.error / console.warn / console.log` calls
 * scattered across stores, page components, and route handlers. Every
 * call carries a `scope` (typically the module or feature name) so logs
 * can be filtered, and every call passes through a single chokepoint
 * that can later be wired to Sentry / Datadog / OpenTelemetry without
 * touching call sites.
 *
 * Behaviour:
 * - In development (`NODE_ENV !== 'production'`): all levels print to
 *   the browser/Node console with a `[scope]` prefix.
 * - In production: `error` and `warn` always print (so server logs
 *   surface real failures); `info` and `debug` are silenced unless
 *   `process.env.NEXT_PUBLIC_LOG_LEVEL === 'debug'`.
 * - Errors with a stack-bearing `Error` instance get the full stack
 *   in dev and the message-only summary in prod.
 *
 * Usage:
 *   import { log } from '@/lib/logger';
 *   log.error('office-store', 'failed to fetch', err);
 *   log.warn('export.excel', 'fell back to legacy format');
 *   log.info('advisory', 'gate opened at 80%');
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
const debugEnabled =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_LOG_LEVEL === 'debug';

function shouldEmit(level: LogLevel): boolean {
  if (isDev) return true;
  if (level === 'error' || level === 'warn') return true;
  return debugEnabled;
}

function formatPrefix(scope: string, level: LogLevel): string {
  return `[${level}][${scope}]`;
}

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  context?: unknown,
): void {
  if (!shouldEmit(level)) return;
  const prefix = formatPrefix(scope, level);
  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'info'
          ? console.info
          : console.debug;
  if (context === undefined) {
    fn.call(console, prefix, message);
  } else if (context instanceof Error) {
    if (isDev) {
      fn.call(console, prefix, message, context);
    } else {
      fn.call(console, prefix, message, context.message);
    }
  } else {
    fn.call(console, prefix, message, context);
  }
}

export const log = {
  error: (scope: string, message: string, context?: unknown) =>
    emit('error', scope, message, context),
  warn: (scope: string, message: string, context?: unknown) =>
    emit('warn', scope, message, context),
  info: (scope: string, message: string, context?: unknown) =>
    emit('info', scope, message, context),
  debug: (scope: string, message: string, context?: unknown) =>
    emit('debug', scope, message, context),
};

export type Logger = typeof log;

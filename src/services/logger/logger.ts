import pino from 'pino';
import { env } from '@/config';

const isProduction = env.NODE_ENV === 'production';

const pinoLogger = pino({
  level: env.LOG_LEVEL || 'info',
  // In production, we output raw JSON (fast). In development, we use pino-pretty for readable console logs.
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
  redact: {
    // Automatically mask sensitive data in logs to prevent accidental leaks
    paths: [
      'password', 
      'token', 
      'accessToken', 
      'authorization', 
      'apiKey', 
      'secret', 
      'email'
    ],
    censor: '***REDACTED***'
  }
});

export interface ILogger {
  info(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
  warn(msg: string, meta?: any): void;
  debug(msg: string, meta?: any): void;
}

// Wrapper to enforce the (message, meta) signature used across the codebase
export const logger: ILogger = {
  info: (msg: string, meta?: any) => { meta ? pinoLogger.info(meta, msg) : pinoLogger.info(msg); },
  error: (msg: string, meta?: any) => { meta ? pinoLogger.error(meta, msg) : pinoLogger.error(msg); },
  warn: (msg: string, meta?: any) => { meta ? pinoLogger.warn(meta, msg) : pinoLogger.warn(msg); },
  debug: (msg: string, meta?: any) => { meta ? pinoLogger.debug(meta, msg) : pinoLogger.debug(msg); },
};

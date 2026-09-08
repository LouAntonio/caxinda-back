import * as winston from 'winston';
import 'winston-daily-rotate-file';
import type { LoggerOptions } from 'winston';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const LOG_LEVEL =
	(process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'http' | 'debug') ??
	'info';
const LOG_DIR = process.env.LOG_DIR ?? 'logs';
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE ?? '20m';
const LOG_MAX_FILES = process.env.LOG_MAX_FILES ?? '14d';
const LOG_PRETTY = process.env.NODE_ENV !== 'production';

const safe = (value: unknown): string => {
	if (typeof value === 'string') return value;
	if (value instanceof Error) return value.message;
	if (value === undefined || value === null) return '';
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value) ?? '';
		} catch {
			return '';
		}
	}
	if (typeof value === 'symbol') return value.toString();
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'function') return value.name || 'function';
	if (typeof value === 'number' || typeof value === 'boolean') {
		return `${value}`;
	}
	return '';
};

const prettyFormat = combine(
	errors({ stack: true }),
	timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
	printf((info) => {
		const { level, message, timestamp: ts, stack, ...meta } = info;
		const metaKeys = Object.keys(meta).filter(
			(key) => meta[key] !== undefined,
		);
		const metaStr = metaKeys.length
			? ` ${metaKeys.map((key) => `${key}=${safe(meta[key])}`).join(' ')}`
			: '';
		const stackStr = typeof stack === 'string' ? `\n${stack}` : '';
		return `${safe(ts)} [${level}]: ${safe(message)}${metaStr}${stackStr}`;
	}),
);

const jsonFormat = combine(errors({ stack: true }), timestamp(), json());

const consoleFormat = LOG_PRETTY
	? combine(colorize({ all: true }), prettyFormat)
	: jsonFormat;

export const buildLoggerOptions = (): LoggerOptions => ({
	level: LOG_LEVEL,
	levels: winston.config.npm.levels,
	format: consoleFormat,
	transports: [
		new winston.transports.Console(),
		new winston.transports.DailyRotateFile({
			dirname: LOG_DIR,
			filename: 'application-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			level: 'info',
			maxSize: LOG_MAX_SIZE,
			maxFiles: LOG_MAX_FILES,
			zippedArchive: true,
		}),
		new winston.transports.DailyRotateFile({
			dirname: LOG_DIR,
			filename: 'error-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			level: 'error',
			maxSize: LOG_MAX_SIZE,
			maxFiles: LOG_MAX_FILES,
			zippedArchive: true,
		}),
	],
	exceptionHandlers: [
		new winston.transports.DailyRotateFile({
			dirname: LOG_DIR,
			filename: 'exceptions-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			level: 'error',
			maxSize: LOG_MAX_SIZE,
			maxFiles: LOG_MAX_FILES,
			zippedArchive: true,
		}),
	],
	rejectionHandlers: [
		new winston.transports.DailyRotateFile({
			dirname: LOG_DIR,
			filename: 'rejections-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			level: 'error',
			maxSize: LOG_MAX_SIZE,
			maxFiles: LOG_MAX_FILES,
			zippedArchive: true,
		}),
	],
});

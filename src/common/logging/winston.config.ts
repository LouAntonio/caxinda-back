import * as path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';
import { format, transports } from 'winston';

const logsDir = path.join(process.cwd(), 'logs');

const asString = (value: unknown): string => {
	if (typeof value === 'string') {
		return value;
	}
	if (value === undefined || value === null) {
		return '';
	}
	return JSON.stringify(value);
};

const logFormat = format.printf((info) => {
	const { level, message, timestamp, stack, context } = info as Record<
		string,
		unknown
	>;
	const ts = asString(timestamp);
	const lvl = asString(level).toUpperCase();
	const msg = asString(message);
	const ctx =
		typeof context === 'string'
			? context
			: context
				? String(
						(context as { name?: string }).name ??
							asString(context),
					)
				: '';
	const trace = stack ? `\n${asString(stack)}` : '';
	const contextTag = ctx ? ` [${ctx}]` : '';
	return `${ts} ${lvl}${contextTag} ${msg}${trace}`;
});

export const winstonOptions = {
	format: format.combine(
		format.errors({ stack: true }),
		format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
		logFormat,
	),
	transports: [
		new transports.Console({
			level: 'debug',
			format: format.combine(
				format.colorize({ all: true }),
				format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
				logFormat,
			),
		}),
		new DailyRotateFile({
			dirname: logsDir,
			filename: '%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			level: 'info',
			maxFiles: '30d',
			zippedArchive: true,
		}),
		new DailyRotateFile({
			dirname: logsDir,
			filename: 'error-%DATE%.log',
			datePattern: 'YYYY-MM-DD',
			level: 'error',
			maxFiles: '30d',
			zippedArchive: true,
		}),
	],
};

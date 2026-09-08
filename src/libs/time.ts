process.env.TZ = 'Africa/Luanda';

export const ANGOLA_TZ = 'Africa/Luanda';

export const startedAt: Date = new Date();

export function uptimeSeconds(): number {
	return Math.floor(process.uptime());
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function nowAngola(): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: ANGOLA_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).format(new Date());
}

export function formatAngola(date: Date): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: ANGOLA_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).format(date);
}

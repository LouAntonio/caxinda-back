process.env.TZ = 'Africa/Luanda';

export const ANGOLA_TZ = 'Africa/Luanda';

export const startedAt: Date = new Date();

export function uptimeSeconds(): number {
	return Math.floor(process.uptime());
}

export function formatUptime(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const days = Math.floor(total / 86400);
	const hours = Math.floor((total % 86400) / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;

	const parts: string[] = [];
	if (days > 0) {
		parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
	}
	if (hours > 0) {
		parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
	}
	if (minutes > 0) {
		parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
	}
	if (parts.length === 0 || secs > 0) {
		parts.push(`${secs} ${secs === 1 ? 'segundo' : 'segundos'}`);
	}

	if (parts.length === 1) {
		return parts[0];
	}
	return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
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

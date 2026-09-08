export function corsOrigins(): string[] {
	return (process.env.CORS_ORIGINS ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
}

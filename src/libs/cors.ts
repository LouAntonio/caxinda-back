const DEFAULT_DEV_ORIGINS = ['http://localhost:5173'];

/**
 * Devolve as origens permitidas pelo CORS.
 *
 * Em produção, `CORS_ORIGINS` tem de estar definida; caso contrário a aplicação
 * não deve arrancar, para evitar expor a API a qualquer origem (com
 * `credentials: true`, `origin: *` não é permitido pelo navegador).
 *
 * Em desenvolvimento, quando a variável não está definida, usa-se um conjunto
 * de origens padrão locais para não quebrar o fluxo local.
 */
export function corsOrigins(): string[] {
	const raw = process.env.CORS_ORIGINS ?? '';
	const origins = raw
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

	if (origins.length > 0) {
		return origins;
	}

	if (process.env.NODE_ENV === 'production') {
		throw new Error(
			'CORS_ORIGINS não está definida. Defina as origens permitidas ' +
				'(ex.: https://caxindadivulga.com) antes de arrancar em produção.',
		);
	}

	return DEFAULT_DEV_ORIGINS;
}

export function isCorsConfigured(): boolean {
	return Boolean(process.env.CORS_ORIGINS);
}

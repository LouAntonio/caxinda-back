export type SearchMode = 'insensitive' | 'sensitive';

export type SearchFilter = { contains: string; mode: SearchMode };

export function buildSearchOR(
	fields: readonly string[],
	query?: string,
	mode: SearchMode = 'insensitive',
): Array<Record<string, SearchFilter>> | undefined {
	const value = query?.trim();
	if (!value) {
		return undefined;
	}
	return fields.map((field) => ({
		[field]: { contains: value, mode },
	}));
}

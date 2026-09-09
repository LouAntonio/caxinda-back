import {
	DEFAULT_LIMIT,
	DEFAULT_LIMIT_MAX,
	DEFAULT_PAGE,
} from './pagination-query.dto';

export interface PaginatedResult<T> {
	items: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export interface PaginationParams {
	page: number;
	limit: number;
	skip: number;
	take: number;
}

export function buildPagination(
	page?: number,
	limit?: number,
	maxLimit = DEFAULT_LIMIT_MAX,
): PaginationParams {
	const resolvedPage = page ?? DEFAULT_PAGE;
	const resolvedLimit = Math.min(limit ?? DEFAULT_LIMIT, maxLimit);
	return {
		page: resolvedPage,
		limit: resolvedLimit,
		skip: (resolvedPage - 1) * resolvedLimit,
		take: resolvedLimit,
	};
}

export function paginate<T>(
	items: T[],
	total: number,
	pagination: Pick<PaginationParams, 'page' | 'limit'>,
): PaginatedResult<T> {
	const { page, limit } = pagination;
	return {
		items,
		total,
		page,
		limit,
		totalPages: total === 0 ? 0 : Math.ceil(total / limit),
	};
}

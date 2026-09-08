import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
	CreateReportDto,
	ReportsQueryDto,
	UpdateReportStatusDto,
} from './reports.dto';
import {
	ReportReason,
	ReportStatus,
	ReportTarget,
} from '../generated/prisma/client';

async function errorsOf(dto: new () => object, body: Record<string, unknown>) {
	const instance = plainToInstance(dto, body);
	return validate(instance);
}

const UUID = '00000000-0000-7000-8000-000000000001';

describe('Reports DTOs', () => {
	describe('CreateReportDto', () => {
		it('aceita targetType + targetId + reason', async () => {
			await expect(
				errorsOf(CreateReportDto, {
					targetType: ReportTarget.AD,
					targetId: UUID,
					reason: ReportReason.FRAUD,
				}),
			).resolves.toEqual([]);
		});

		it('aceita descrição e até 3 imagens', async () => {
			await expect(
				errorsOf(CreateReportDto, {
					targetType: ReportTarget.AD,
					targetId: UUID,
					reason: ReportReason.FRAUD,
					description: 'Texto',
					media: [
						{ url: 'https://cdn.test/a.jpg', cloudinaryId: 'c1' },
						{ url: 'https://cdn.test/b.jpg', cloudinaryId: 'c2' },
						{ url: 'https://cdn.test/c.jpg', cloudinaryId: 'c3' },
					],
				}),
			).resolves.toEqual([]);
		});

		it('rejeita targetType inválido', async () => {
			const errors = await errorsOf(CreateReportDto, {
				targetType: 'INVALID',
				targetId: UUID,
				reason: ReportReason.FRAUD,
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('targetType');
		});

		it('rejeita targetId não-UUID', async () => {
			const errors = await errorsOf(CreateReportDto, {
				targetType: ReportTarget.AD,
				targetId: 'not-uuid',
				reason: ReportReason.FRAUD,
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('targetId');
		});

		it('rejeita reason inválido', async () => {
			const errors = await errorsOf(CreateReportDto, {
				targetType: ReportTarget.AD,
				targetId: UUID,
				reason: 'NOPE',
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('reason');
		});

		it('rejeita mais de 3 imagens', async () => {
			const errors = await errorsOf(CreateReportDto, {
				targetType: ReportTarget.AD,
				targetId: UUID,
				reason: ReportReason.FRAUD,
				media: Array.from({ length: 4 }, (_, i) => ({
					url: `https://cdn.test/${i}.jpg`,
					cloudinaryId: `c${i}`,
				})),
			});
			expect(errors).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ property: 'media' }),
				]),
			);
		});

		it('rejeita description acima de 2000 caracteres', async () => {
			const errors = await errorsOf(CreateReportDto, {
				targetType: ReportTarget.AD,
				targetId: UUID,
				reason: ReportReason.FRAUD,
				description: 'a'.repeat(2001),
			});
			expect(errors).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ property: 'description' }),
				]),
			);
		});
	});

	describe('UpdateReportStatusDto', () => {
		it('aceita status válido', async () => {
			await expect(
				errorsOf(UpdateReportStatusDto, {
					status: ReportStatus.RESOLVED,
				}),
			).resolves.toEqual([]);
		});

		it('rejeita status inválido', async () => {
			const errors = await errorsOf(UpdateReportStatusDto, {
				status: 'NOPE',
			});
			expect(errors).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ property: 'status' }),
				]),
			);
		});
	});

	describe('ReportsQueryDto', () => {
		it('aceita corpo vazio', async () => {
			await expect(errorsOf(ReportsQueryDto, {})).resolves.toEqual([]);
		});

		it('aceita filtros válidos', async () => {
			await expect(
				errorsOf(ReportsQueryDto, {
					status: ReportStatus.PENDING,
					targetType: ReportTarget.AD,
					page: 2,
					limit: 10,
				}),
			).resolves.toEqual([]);
		});
	});
});

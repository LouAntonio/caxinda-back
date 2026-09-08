import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
	CreatePaymentDto,
	PaymentsQueryDto,
	ReviewPaymentDto,
	SubmitPaymentProofDto,
} from './payments.dto';

async function errorsOf(dto: new () => object, body: Record<string, unknown>) {
	const instance = plainToInstance(dto, body);
	return validate(instance);
}

describe('Payments DTOs', () => {
	describe('CreatePaymentDto', () => {
		it('aceita um payload válido', async () => {
			await expect(
				errorsOf(CreatePaymentDto, {
					businessId: '00000000-0000-7000-8000-000000000001',
					planId: '00000000-0000-7000-8000-000000000002',
				}),
			).resolves.toEqual([]);
		});

		it('rejeita businessId em falta', async () => {
			const errors = await errorsOf(CreatePaymentDto, {
				planId: '00000000-0000-7000-8000-000000000002',
			});
			expect(errors.some((e) => e.property === 'businessId')).toBe(true);
		});

		it('rejeita planId em falta', async () => {
			const errors = await errorsOf(CreatePaymentDto, {
				businessId: '00000000-0000-7000-8000-000000000001',
			});
			expect(errors.some((e) => e.property === 'planId')).toBe(true);
		});

		it('rejeita UUIDs inválidos', async () => {
			const errors = await errorsOf(CreatePaymentDto, {
				businessId: 'nao-e-uuid',
				planId: 'nao-e-uuid',
			});
			expect(errors.some((e) => e.property === 'businessId')).toBe(true);
			expect(errors.some((e) => e.property === 'planId')).toBe(true);
		});
	});

	describe('SubmitPaymentProofDto', () => {
		it('aceita url e id válidos', async () => {
			await expect(
				errorsOf(SubmitPaymentProofDto, {
					proofUrl: 'https://cdn.test/prova.jpg',
					proofId: 'payments/prova-123',
				}),
			).resolves.toEqual([]);
		});

		it('rejeita url inválida', async () => {
			const errors = await errorsOf(SubmitPaymentProofDto, {
				proofUrl: 'nao-e-url',
				proofId: 'payments/prova-123',
			});
			expect(errors.some((e) => e.property === 'proofUrl')).toBe(true);
		});

		it('rejeita proofId vazio', async () => {
			const errors = await errorsOf(SubmitPaymentProofDto, {
				proofUrl: 'https://cdn.test/prova.jpg',
				proofId: '',
			});
			expect(errors.some((e) => e.property === 'proofId')).toBe(true);
		});
	});

	describe('ReviewPaymentDto', () => {
		it('aceita APPOVED/REJECTED e note opcional', async () => {
			await expect(
				errorsOf(ReviewPaymentDto, { decision: 'APPROVED' }),
			).resolves.toEqual([]);
			await expect(
				errorsOf(ReviewPaymentDto, {
					decision: 'REJECTED',
					note: 'Comprovativo inválido.',
				}),
			).resolves.toEqual([]);
		});

		it('rejeita decision inválida', async () => {
			const errors = await errorsOf(ReviewPaymentDto, {
				decision: 'RELEASE',
			});
			expect(errors.some((e) => e.property === 'decision')).toBe(true);
		});

		it('rejeita decision em falta', async () => {
			const errors = await errorsOf(ReviewPaymentDto, {});
			expect(errors.some((e) => e.property === 'decision')).toBe(true);
		});
	});

	describe('PaymentsQueryDto', () => {
		it('aceita filtros opcionais', async () => {
			await expect(
				errorsOf(PaymentsQueryDto, {
					page: 1,
					limit: 20,
					status: 'UNDER_REVIEW',
				}),
			).resolves.toEqual([]);
		});

		it('rejeita status inválido', async () => {
			const errors = await errorsOf(PaymentsQueryDto, {
				status: 'RELEASED',
			});
			expect(errors.some((e) => e.property === 'status')).toBe(true);
		});

		it('rejeita limit acima do máximo', async () => {
			const errors = await errorsOf(PaymentsQueryDto, { limit: 100 });
			expect(errors.some((e) => e.property === 'limit')).toBe(true);
		});
	});
});

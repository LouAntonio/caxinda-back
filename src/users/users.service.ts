import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'http';
import { auth } from '../libs/auth';
import { PrismaService } from '../common/prisma/prisma.module';
import { EmailService } from '../email/email.service';
import { MagicLinkService } from '../auth/magic-link.service';
import {
	BanUserDto,
	CreateUserDto,
	ListUsersQueryDto,
	SetRoleDto,
	UpdateProfileDto,
} from './users.dto';

export interface SessionUser {
	id: string;
	email: string;
	name: string;
	role: string;
	banned: boolean;
}

type BetterAuthRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'PROMOTER';

const ERROR_CODES = {
	YOU_CANNOT_BAN_YOURSELF: 'YOU_CANNOT_BAN_YOURSELF',
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: 'YOU_ARE_NOT_ALLOWED_TO_LIST_USERS',
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: 'YOU_ARE_NOT_ALLOWED_TO_BAN_USERS',
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		'YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE',
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		'YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE',
	USER_NOT_FOUND: 'USER_NOT_FOUND',
} as const;

@Injectable()
export class UsersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly emailService: EmailService,
		private readonly magicLinkService: MagicLinkService,
	) {}

	private errorToHttp(error: unknown): never {
		const code = (error as { code?: string } | null)?.code;
		const message = (error as { message?: string } | null)?.message;

		if (code === ERROR_CODES.YOU_CANNOT_BAN_YOURSELF) {
			throw new ForbiddenException('Não é possível banir a si mesmo.');
		}
		if (
			code === ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_USERS ||
			code === ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_BAN_USERS ||
			code === ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE
		) {
			throw new ForbiddenException('Permissão insuficiente');
		}
		if (
			code === ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE
		) {
			throw new BadRequestException('Role informada não existe.');
		}
		if (code === ERROR_CODES.USER_NOT_FOUND) {
			throw new NotFoundException('Usuário não encontrado.');
		}

		if (message) {
			throw new BadRequestException(message);
		}
		throw new BadRequestException('Não foi possível concluir a operação.');
	}

	async getMe(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			include: {
				kyc: { select: { status: true } },
				accounts: {
					select: {
						id: true,
						providerId: true,
						accountId: true,
						userId: true,
						password: true,
					},
				},
			},
		});

		if (!user) {
			throw new NotFoundException('Usuário não encontrado.');
		}

		return {
			...this.safeUser(user),
			accounts: (user.accounts ?? []).map((account) => ({
				id: account.id,
				providerId: account.providerId,
				accountId: account.accountId,
			})),
			hasPassword: (user.accounts ?? []).some(
				(account) =>
					account.providerId === 'credential' && !!account.password,
			),
		};
	}

	async getById(id: string) {
		const user = await this.prisma.user.findUnique({
			where: { id },
			include: {
				kyc: { select: { status: true, id: true } },
				_count: { select: { ads: true } },
				subscriptions: {
					orderBy: { createdAt: 'desc' },
					take: 10,
					include: {
						plan: {
							select: {
								id: true,
								name: true,
								price: true,
								currency: true,
								durationDays: true,
							},
						},
					},
				},
			},
		});
		if (!user) {
			throw new NotFoundException('Usuário não encontrado.');
		}

		const { _count, subscriptions, ...rest } = user;
		return {
			...this.safeUser(rest),
			adCount: _count.ads,
			subscriptions: subscriptions.map((sub) => ({
				id: sub.id,
				planId: sub.planId,
				status: sub.status,
				startDate: sub.startDate,
				endDate: sub.endDate,
				autoRenew: sub.autoRenew,
				cancelledAt: sub.cancelledAt,
				renewedAt: sub.renewedAt,
				createdAt: sub.createdAt,
				updatedAt: sub.updatedAt,
				plan: sub.plan,
			})),
		};
	}

	async getPublicProfile(id: string) {
		const user = await this.prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				surname: true,
				image: true,
				banned: true,
				trustScore: true,
				isVerified: true,
				createdAt: true,
				kyc: { select: { verifiedAt: true } },
			},
		});

		if (!user || user.banned) {
			throw new NotFoundException('Usuário não encontrado.');
		}

		return {
			id: user.id,
			name: user.name,
			surname: user.surname,
			image: user.image,
			trustScore: user.trustScore,
			isVerified: user.isVerified,
			verifiedAt: user.kyc?.verifiedAt ?? null,
			createdAt: user.createdAt,
		};
	}

	async updateMe(userId: string, dto: UpdateProfileDto) {
		const existing = await this.prisma.user.findUnique({
			where: { id: userId },
		});
		if (!existing) {
			throw new NotFoundException('Usuário não encontrado.');
		}

		if (dto.phone) {
			const phoneTaken = await this.prisma.user.findFirst({
				where: { phone: dto.phone, id: { not: userId } },
			});
			if (phoneTaken) {
				throw new ConflictException(
					'Telefone já está em uso por outra conta.',
				);
			}
		}

		const updated = await this.prisma.user.update({
			where: { id: userId },
			data: {
				name: dto.name,
				surname: dto.surname,
				phone: dto.phone,
				image: dto.image,
			},
		});

		return this.safeUser(updated);
	}

	async list(headers: IncomingHttpHeaders, query: ListUsersQueryDto = {}) {
		try {
			const result = await auth.api.listUsers({
				query: query as never,
				headers: fromNodeHeaders(headers),
			});

			const ids = result.users.map((user) => user.id);
			const enriched = ids.length
				? await this.prisma.user.findMany({
						where: { id: { in: ids } },
						select: {
							id: true,
							isVerified: true,
							phone: true,
							trustScore: true,
							kyc: { select: { status: true } },
						},
					})
				: [];
			const byId = new Map(enriched.map((u) => [u.id, u] as const));

			return {
				users: result.users.map((user) => {
					const enriched = byId.get(user.id);
					return this.safeUser({
						id: user.id,
						name: user.name,
						surname: (user as { surname?: string }).surname ?? '',
						email: user.email,
						emailVerified: user.emailVerified,
						image: user.image ?? null,
						role: user.role ?? null,
						banned: user.banned ?? false,
						banReason:
							(user as { banReason?: string | null }).banReason ??
							null,
						banExpires:
							(user as { banExpires?: Date | null }).banExpires ??
							null,
						phone: enriched?.phone ?? null,
						trustScore: enriched?.trustScore ?? 0,
						isVerified: enriched?.isVerified ?? false,
						createdAt: user.createdAt,
						updatedAt: user.updatedAt,
						kyc: enriched?.kyc ?? null,
					});
				}),
				total: result.total,
			};
		} catch (error) {
			this.errorToHttp(error);
		}
	}

	async create(headers: IncomingHttpHeaders, dto: CreateUserDto) {
		try {
			const result = await auth.api.createUser({
				body: {
					email: dto.email,
					name: dto.name,
					role: (dto.role ?? 'USER') as BetterAuthRole,
				},
				headers: fromNodeHeaders(headers),
			});

			await this.magicLinkService.request(dto.email, {
				subject: 'Você foi convidado para a Caxinda',
				html: `<p>Olá ${dto.name},</p>
					<p>Foi criada uma conta para você na <strong>Caxinda</strong>.</p>
					<p>Clique no link abaixo para entrar e concluir o seu cadastro (válido por 15 minutos):</p>
					<p><a href="%LINK%">Entrar na Caxinda</a></p>
					<p>Se você não esperava este convite, ignore este e-mail.</p>`,
			});

			return result;
		} catch (error) {
			this.errorToHttp(error);
		}
	}

	async ban(
		viewer: SessionUser,
		headers: IncomingHttpHeaders,
		userId: string,
		dto: BanUserDto = {},
	) {
		this.assertNotSelf(viewer.id, userId, 'banir');

		const target = await this.findTarget(userId);
		this.assertCanManage(viewer, target, 'banir');

		try {
			const result = await auth.api.banUser({
				body: {
					userId,
					banReason: dto.reason,
					banExpiresIn: dto.banExpiresIn,
				},
				headers: fromNodeHeaders(headers),
			});

			await this.rejectKycOnBan(userId, dto.reason);

			if (target.email) {
				await this.emailService.enqueue({
					to: target.email,
					subject: 'Sua conta foi banida',
					html: `<p>Olá,</p>
					<p>Sua conta na Caxinda foi banida${dto.reason ? `: ${dto.reason}` : ''}.</p>
					<p>Caso acredite que isto seja um erro, entre em contato com o suporte.</p>`,
				});
			}

			return result;
		} catch (error) {
			this.errorToHttp(error);
		}
	}

	async unban(
		viewer: SessionUser,
		headers: IncomingHttpHeaders,
		userId: string,
	) {
		this.assertNotSelf(viewer.id, userId, 'desbanir');

		const target = await this.findTarget(userId);
		this.assertCanManage(viewer, target, 'desbanir');

		try {
			const result = await auth.api.unbanUser({
				body: { userId },
				headers: fromNodeHeaders(headers),
			});

			if (target.email) {
				await this.emailService.enqueue({
					to: target.email,
					subject: 'Sua conta foi reativada',
					html: `<p>Olá,</p>
					<p>Sua conta na Caxinda foi <strong>reativada</strong>.</p>
					<p>Você já pode acessar a plataforma normalmente.</p>`,
				});
			}

			return result;
		} catch (error) {
			this.errorToHttp(error);
		}
	}

	async setRole(
		viewer: SessionUser,
		headers: IncomingHttpHeaders,
		userId: string,
		dto: SetRoleDto,
	) {
		this.assertNotSelf(viewer.id, userId, 'alterar o tipo de acesso');

		const target = await this.findTarget(userId);
		this.assertCanSetRole(viewer, target, dto.role);

		try {
			const result = await auth.api.setRole({
				body: { userId, role: dto.role as BetterAuthRole },
				headers: fromNodeHeaders(headers),
			});

			if (target.email) {
				await this.emailService.enqueue({
					to: target.email,
					subject: 'Seu tipo de acesso foi alterado',
					html: `<p>Olá,</p>
					<p>O seu tipo de acesso na Caxinda foi alterado para <strong>${dto.role}</strong>.</p>
					<p>Se você não reconhece esta alteração, entre em contato com o suporte.</p>`,
				});
			}

			return result;
		} catch (error) {
			this.errorToHttp(error);
		}
	}

	private assertNotSelf(actorId: string, targetId: string, action: string) {
		if (actorId === targetId) {
			throw new ForbiddenException(
				`Não é possível ${action} a própria conta.`,
			);
		}
	}

	private async findTarget(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
		});
		if (!user) {
			throw new NotFoundException('Usuário não encontrado.');
		}
		return user;
	}

	private assertCanManage(
		viewer: SessionUser,
		target: { role: string | null },
		action: string,
	) {
		if (viewer.role === 'ADMIN') {
			return;
		}

		if (viewer.role !== 'MODERATOR' || target.role === 'ADMIN') {
			throw new ForbiddenException(
				`Permissão insuficiente para ${action} este usuário.`,
			);
		}
	}

	private assertCanSetRole(
		viewer: SessionUser,
		target: { role: string | null },
		newRole: string,
	) {
		if (viewer.role === 'ADMIN') {
			return;
		}

		if (viewer.role !== 'MODERATOR') {
			throw new ForbiddenException(
				'Permissão insuficiente para alterar o tipo de acesso.',
			);
		}

		if (target.role === 'ADMIN') {
			throw new ForbiddenException(
				'Não é possível alterar o tipo de acesso de um ADMIN.',
			);
		}

		if (newRole === 'ADMIN') {
			throw new ForbiddenException(
				'Permissão insuficiente para atribuir acesso de ADMIN.',
			);
		}
	}

	private async rejectKycOnBan(userId: string, reason?: string) {
		const kyc = await this.prisma.kYC.findUnique({
			where: { userId },
		});
		if (!kyc) {
			return;
		}

		await this.prisma.kYC.update({
			where: { id: kyc.id },
			data: {
				status: 'REJECTED',
				rejectionReason: reason ?? 'Conta banida',
				verifiedAt: null,
			},
		});
		await this.prisma.user.update({
			where: { id: userId },
			data: { isVerified: false, role: 'USER' },
		});
	}

	private safeUser(user: {
		id: string;
		name: string;
		surname: string;
		email: string;
		emailVerified: boolean;
		image: string | null;
		role: string | null;
		banned: boolean | null;
		banReason: string | null;
		banExpires: Date | null;
		phone: string | null;
		trustScore: number;
		isVerified: boolean;
		createdAt: Date;
		updatedAt: Date;
		kyc?: { status: string } | null;
	}) {
		return {
			id: user.id,
			name: user.name,
			surname: user.surname,
			email: user.email,
			emailVerified: user.emailVerified,
			image: user.image,
			role: user.role,
			banned: user.banned ?? false,
			banReason: user.banReason,
			banExpires: user.banExpires,
			phone: user.phone,
			trustScore: user.trustScore,
			isVerified: user.isVerified,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			kyc: user.kyc ? { status: user.kyc.status } : null,
		};
	}
}

const AUTH_ERRORS_PT: Record<string, string> = {
	'Invalid email or password': 'Email ou senha incorretos.',
	'Email not found': 'Não existe nenhuma conta com este email.',
	'User not found': 'Utilizador não encontrado.',
	'Account not found': 'Conta não encontrada.',
	'Invalid token': 'Token inválido.',
	'Token expired': 'Este link expirou. Peça um novo.',
	'Token has expired': 'Este link expirou. Peça um novo.',
	'Email already exists': 'Este email já está registado.',
	'User already exists': 'Este utilizador já está registado.',
	'Password is too short': 'A senha deve ter pelo menos 8 caracteres.',
	'Password is too long': 'A senha é demasiado longa.',
	'Invalid password': 'Senha inválida.',
	'Email is not verified': 'Email não verificado.',
	'Email requires verification': 'Confirme o seu email antes de continuar.',
	'A request has already been made to reset this account’s password':
		'Já foi pedido o redefinição desta senha. Verifique o seu email.',
	'You cannot reset your password since you signed up with another provider':
		'Esta conta foi criada com outro fornecedor. Defina uma senha nas definições do perfil.',
	'Too many requests': 'Muitos pedidos. Tente novamente mais tarde.',
	'Failed to create account': 'Não foi possível criar a conta.',
	'Failed to send email': 'Não foi possível enviar o email.',
	'Maximum verification attempts reached':
		'Limite de tentativas de verificação atingido. Tente novamente mais tarde.',
	'Verification required': 'Verificação exigida. Consulte o seu email.',
	'Session expired': 'A sua sessão expirou. Entre novamente.',
	'Session revoked': 'A sua sessão foi revogada.',
	'You cannot delete the admin user':
		'Não é possível eliminar o administrador.',
	'You cannot ban a user with a higher or equal role':
		'Não é possível banir um utilizador com cargo igual ou superior.',
	'You cannot unban the same user you are trying to ban':
		'Não é possível banir o próprio utilizador.',
	'You cannot remove a role from the admin user':
		'Não é possível remover o cargo de administrador.',
	'You cannot remove a role with a higher or equal role':
		'Não é possível remover o cargo de um utilizador igual ou superior.',
	'You cannot assign a role to the admin user':
		'Não é possível atribuir um cargo ao administrador.',
	'You cannot assign a higher or equal role to a user':
		'Não é possível atribuir um cargo igual ou superior.',
};

const HAS_ACCENTED_CHARS = /[ãàáâäáéèêëíìîïóòôöõúùûüçñ]/i;

export function translateAuthError(message: string): string {
	if (HAS_ACCENTED_CHARS.test(message)) {
		return message;
	}
	return AUTH_ERRORS_PT[message] ?? 'Não foi possível concluir a operação.';
}

const FIRST_WORD = /^([^\s]+)/;

function fieldName(message: string): string {
	return message.match(FIRST_WORD)?.[1] ?? 'valor';
}

/**
 * Traduz mensagens de validação do class-validator (ValidationPipe) para
 * português. Mensagens que já contêm acentos são devolvidas como estão.
 */
export function translateValidationError(message: string): string {
	if (HAS_ACCENTED_CHARS.test(message)) {
		return message;
	}

	const field = fieldName(message);

	if (/^property .* should not exist$/.test(message)) {
		const prop = message.replace(/^property (.+?) should not exist$/, '$1');
		return `O campo "${prop}" não é permitido.`;
	}
	if (/ should not be empty$/.test(message)) {
		return `O campo "${field}" não pode estar vazio.`;
	}
	if (/ must be an email$/.test(message)) {
		return `O campo "${field}" deve ser um email válido.`;
	}
	if (/ must be an url$/.test(message)) {
		return `O campo "${field}" deve ser um URL válido.`;
	}
	if (/ must be a string$/.test(message)) {
		return `O campo "${field}" deve ser uma string.`;
	}
	if (/ must be a number$/.test(message)) {
		return `O campo "${field}" deve ser um número.`;
	}
	if (/ must be an integer$/.test(message)) {
		return `O campo "${field}" deve ser um número inteiro.`;
	}
	if (/ must be a boolean$/.test(message)) {
		return `O campo "${field}" deve ser verdadeiro ou falso.`;
	}
	if (/ must be an UUID$/.test(message)) {
		return 'Identificador inválido.';
	}
	if (/ must be longer than or equal to (\d+) characters$/.test(message)) {
		const length = message.match(
			/ must be longer than or equal to (\d+) characters$/,
		)?.[1];
		return `O campo "${field}" deve ter pelo menos ${length} caracteres.`;
	}
	if (/ must be shorter than or equal to (\d+) characters$/.test(message)) {
		const length = message.match(
			/ must be shorter than or equal to (\d+) characters$/,
		)?.[1];
		return `O campo "${field}" deve ter no máximo ${length} caracteres.`;
	}
	if (/ must be exactly (\d+) characters$/.test(message)) {
		const length = message.match(/ must be exactly (\d+) characters$/)?.[1];
		return `O campo "${field}" deve ter exatamente ${length} caracteres.`;
	}
	if (/ must be one of the following values: (.+)$/.test(message)) {
		const values = message.replace(
			/^.* must be one of the following values: (.+)$/,
			'$1',
		);
		return `O campo "${field}" deve ser um dos seguintes valores: ${values}.`;
	}
	if (/ must be a valid enum value$/.test(message)) {
		return `Valor inválido para o campo "${field}".`;
	}
	if (/ must match .+ regular expression$/.test(message)) {
		return `Formato inválido para o campo "${field}".`;
	}

	return `Valor inválido para o campo "${field}".`;
}

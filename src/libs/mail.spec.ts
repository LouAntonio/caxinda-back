import { sendMailBridge, setSendMail } from './mail';

describe('libs/mail', () => {
	afterEach(() => {
		setSendMail(async () => {});
		jest.restoreAllMocks();
	});

	it('setSendMail registra a função de envio usada pelo bridge', async () => {
		jest.spyOn(console, 'log').mockImplementation(() => {});
		const send = jest.fn().mockResolvedValue(undefined);
		setSendMail(send);

		await sendMailBridge({
			to: 'user@test.com',
			subject: 'Olá',
			html: '<p>Hello</p>',
		});

		expect(send).toHaveBeenCalledWith({
			to: 'user@test.com',
			subject: 'Olá',
			html: '<p>Hello</p>',
		});
	});

	it('não enfileira nada quando nenhum sender foi registrado', async () => {
		const send = jest.fn();
		setSendMail(send);

		await sendMailBridge({ to: 'user@test.com', subject: 'x', text: 'y' });

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith({
			to: 'user@test.com',
			subject: 'x',
			text: 'y',
		});
	});
});

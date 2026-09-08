export interface MailMessage {
	to: string;
	subject: string;
	text?: string;
	html?: string;
}

export type SendMail = (message: MailMessage) => Promise<void> | void;

let sendMail: SendMail = async () => {};

export function setSendMail(fn: SendMail) {
	sendMail = fn;
}

export async function sendMailBridge(message: MailMessage): Promise<void> {
	await sendMail(message);
}

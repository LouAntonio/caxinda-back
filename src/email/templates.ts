export interface EmailButton {
	label: string;
	url: string;
}

export interface EmailDetail {
	label: string;
	value: string;
}

export interface EmailRender {
	subject: string;
	greeting?: string;
	title?: string;
	paragraph?: string | string[];
	button?: EmailButton;
	details?: EmailDetail[];
	note?: string;
	html?: string;
}

const BRAND = {
	logo: 'https://caxindadivulga.com/images/logo/logo.png',
	site: 'https://caxindadivulga.com',
	accent: '#d3141e',
	accentDark: '#a30f17',
	ink: '#0e1733',
	body: '#4a5568',
	snow: '#f7f7f5',
	divider: '#ecebe6',
	blue: '#2a4b9a',
} as const;

const SOCIALS = [
	{
		name: 'Instagram',
		url: 'https://www.instagram.com/caxinda_divulga?stkn=MTU1NGx2aWpnd3Fsdg%3D%3D&utm_source=qr',
	},
	{
		name: 'Facebook',
		url: 'https://www.facebook.com/share/1QQ4oB2nSv/?mibextid=wwXIfr',
	},
	{
		name: 'LinkedIn',
		url: 'https://www.linkedin.com/company/caxinda-divulga/',
	},
	{
		name: 'TikTok',
		url: 'https://www.tiktok.com/@caxindadivulga?_r=1&_t=ZS-99xI6ehfEay',
	},
] as const;

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function renderParagraphs(p: EmailRender['paragraph']): string {
	if (!p) return '';
	const lines = Array.isArray(p) ? p : [p];
	return lines.map((l) => `<p>${esc(l)}</p>`).join('');
}

export function renderEmail(r: EmailRender): {
	subject: string;
	html: string;
	text: string;
} {
	const bodyHtml = r.html ?? renderParagraphs(r.paragraph);

	const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(r.subject)}</title>
<meta name="description" content="${esc(r.subject)}">
</head>
<body style="margin:0;padding:24px 0;font-family:'Inter',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:${BRAND.snow};color:${BRAND.ink};-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.snow};">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.divider};">
			<tr><td align="left" style="padding:28px 32px 0;text-align:left;">
				<img src="${BRAND.logo}" alt="Caxinda Divulga" width="150" style="display:block;width:150px;height:auto;max-width:100%;">
      </td></tr>
      <tr><td style="padding:20px 32px 0;border-top:2px solid ${BRAND.accent};">
        ${r.greeting ? `<p style="margin:0;font-size:14px;color:${BRAND.body};">${esc(r.greeting)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="margin:0;font-family:'Poppins',-apple-system,'Segoe UI',Roboto,sans-serif;font-size:22px;font-weight:700;line-height:1.25;color:${BRAND.ink};">${esc(r.title ?? '')}</h1>
      </td></tr>
      <tr><td style="padding:12px 32px 0;">
        ${bodyHtml}
      </td></tr>
      ${
			r.button
				? `<tr><td style="padding:16px 32px;">
        <a href="${esc(r.button.url)}" target="_blank" rel="noopener" style="display:inline-block;background:${BRAND.accent};color:#ffffff;font-family:'Poppins',-apple-system,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:12px;">${esc(r.button.label)}</a>
      </td></tr>`
				: ''
		}
      ${
			r.details && r.details.length
				? `<tr><td style="padding:16px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          ${r.details.map((d) => `<tr><td style="padding:6px 0;font-size:13px;color:${BRAND.body};"><strong style="color:${BRAND.ink};">${esc(d.label)}:</strong>&nbsp;${esc(d.value)}</td></tr>`).join('')}
        </table>
      </td></tr>`
				: ''
		}
      ${
			r.note
				? `<tr><td style="padding:16px 32px 0;">
        <p style="margin:0;font-size:12px;color:${BRAND.body};line-height:1.5;">${esc(r.note)}</p>
      </td></tr>`
				: ''
		}
      <tr><td style="padding:20px 32px 0;">
        <hr style="border:0;border-top:1px solid ${BRAND.divider};margin:0;">
      </td></tr>
      <tr><td style="padding:12px 32px 24px;font-size:12px;color:${BRAND.body};line-height:1.6;">
        <strong style="font-family:'Poppins',-apple-system,'Segoe UI',Roboto,sans-serif;color:${BRAND.ink};">Caxinda Divulga</strong><br>
        ${BRAND.site}
        <br><br>
        ${SOCIALS.map((s) => `<a href="${s.url}" style="color:${BRAND.blue};text-decoration:none;">${s.name}</a>`).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}
        <br><br>
        Recebeu este email porque a sua relação com a Caxinda Divulga o justifica.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

	const text = [
		r.title ?? '',
		typeof r.paragraph === 'string'
			? r.paragraph
			: (r.paragraph || []).join('\n'),
		r.button ? `${r.button.label}: ${r.button.url}` : '',
		r.details
			? r.details.map((d) => `${d.label}: ${d.value}`).join('\n')
			: '',
		r.note ?? '',
	]
		.filter(Boolean)
		.join('\n\n');

	return { subject: r.subject, html, text };
}

export function getAdminEmails(): string[] {
	return (process.env.ADM_EMAIL ?? '')
		.split(',')
		.map((e) => e.trim())
		.filter(Boolean);
}

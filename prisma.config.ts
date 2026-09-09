import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
	},
	datasource: {
		// A URL real so e necessaria para comandos que ligam a BD
		// (migrate dev/deploy, db execute). O generate usa este fallback
		// para nao falhar quando DATABASE_URL nao esta definida (ex.: CI).
		url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/localdev',
	},
});
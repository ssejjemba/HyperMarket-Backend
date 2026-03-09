import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import type { Knex } from 'knex';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile));
const envPath = path.join(rootDir, '.env');
const examplePath = path.join(rootDir, '.env.example');

loadDotenv({ path: envPath });
loadDotenv({ path: examplePath });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for migrations');
}

const baseConfig: Knex.Config = {
  client: 'pg',
  connection: databaseUrl,
  migrations: {
    directory: './packages/core/db/migrations',
    tableName: 'knex_migrations',
    extension: 'ts'
  }
};

const config: { [key: string]: Knex.Config } = {
  development: baseConfig,
  test: baseConfig,
  production: baseConfig
};

export default config;

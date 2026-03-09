const path = require('node:path');
const dotenv = require('dotenv');

const rootDir = __dirname;
const envPath = path.join(rootDir, '.env');
const examplePath = path.join(rootDir, '.env.example');

dotenv.config({ path: envPath });
dotenv.config({ path: examplePath });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for migrations');
}

const baseConfig = {
  client: 'pg',
  connection: databaseUrl,
  migrations: {
    directory: './packages/core/db/migrations',
    tableName: 'knex_migrations'
  }
};

module.exports = {
  development: baseConfig,
  test: baseConfig,
  production: baseConfig
};

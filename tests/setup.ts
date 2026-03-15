import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (fs.existsSync(envPath)) {
  loadDotenv({ path: envPath });
} else if (fs.existsSync(examplePath)) {
  loadDotenv({ path: examplePath });
}

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL = 'postgres://hypermarket:hypermarket@localhost:5432/hypermarket';
}

if (process.env.REDIS_URL === undefined) {
  process.env.REDIS_URL = 'redis://localhost:6379';
}

if (process.env.JWT_SECRET === undefined) {
  process.env.JWT_SECRET = 'test-secret';
}

if (process.env.TWILIO_ACCOUNT_SID === undefined) {
  process.env.TWILIO_ACCOUNT_SID = 'ACtestaccountsid000000000000000000';
}

if (process.env.TWILIO_AUTH_TOKEN === undefined) {
  process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token';
}

if (process.env.TWILIO_VERIFY_SERVICE_SID === undefined) {
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtestservicesid000000000000000000';
}

if (process.env.PLATFORM_ROOT_DOMAIN === undefined) {
  process.env.PLATFORM_ROOT_DOMAIN = 'platform.ug';
}

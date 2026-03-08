import { loadEnv } from './config/loadEnv';

export { loadEnv } from './config/loadEnv';
export type { AppConfig } from './config/loadEnv';

export const AppConfig = loadEnv();

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const resolveRootDir = (): string => {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../../../..');
};

export const loadWorkerEnv = (): void => {
  const rootDir = resolveRootDir();
  loadDotenv({ path: path.join(rootDir, '.env.example') });
  loadDotenv({ path: path.join(rootDir, '.env'), override: true });
};

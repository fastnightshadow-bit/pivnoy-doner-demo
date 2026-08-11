import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPool } from '../db/pool.js';
import { createRetentionRepository } from '../repositories/retention.js';
import { createRetentionService } from '../services/retention.js';

export class RetentionCliError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RetentionCliError';
    this.code = code;
  }
}

export const parseRetentionMode = (argv) => {
  if (argv.length !== 1) {
    throw new RetentionCliError('INVALID_RETENTION_FLAGS');
  }
  if (argv[0] === '--dry-run') return 'dry-run';
  if (argv[0] === '--apply') return 'apply';
  throw new RetentionCliError('INVALID_RETENTION_FLAGS');
};

export const runRetentionCli = async ({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date(),
  createDatabase = createPool,
  log = console.log,
} = {}) => {
  const mode = parseRetentionMode(argv);
  if (
    mode === 'apply' &&
    env.NODE_ENV === 'production' &&
    env.RETENTION_APPLY_CONFIRM !== 'YES'
  ) {
    throw new RetentionCliError('PRODUCTION_APPLY_NOT_CONFIRMED');
  }

  const database = createDatabase(env.DATABASE_URL);
  try {
    const service = createRetentionService({
      retention: createRetentionRepository(database),
      log,
    });
    const counts =
      mode === 'dry-run'
        ? await service.previewRetention(now)
        : await service.applyRetention(now);
    return counts;
  } finally {
    await database.end();
  }
};

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    await runRetentionCli();
  } catch {
    console.error(JSON.stringify({ mode: 'rejected', counts: {} }));
    process.exitCode = 1;
  }
}

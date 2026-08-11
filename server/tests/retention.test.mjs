import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createStaffOrdersRepository } from '../src/repositories/staff-orders.js';

const createTransitionPool = () => {
  const calls = [];
  const client = {
    query: async (statement, parameters = []) => {
      const sql = String(statement);
      calls.push({ sql, parameters });

      if (/select id, status, version, fulfillment/i.test(sql)) {
        return {
          rows: [
            {
              id: 'order-1',
              status: 'delivered',
              version: 4,
              fulfillment: 'delivery',
            },
          ],
        };
      }
      if (/update orders/i.test(sql)) {
        return {
          rows: [
            {
              id: 'order-1',
              public_number: 1464,
              status: 'completed',
              fulfillment: 'delivery',
              payment_status: 'paid',
              version: 5,
              eta_min: 8,
              eta_max: 12,
              updated_at: '2026-08-12T00:00:00.000Z',
            },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  return {
    calls,
    pool: { connect: async () => client },
  };
};

test('terminal order transitions stamp closed_at and non-terminal transitions preserve it', async () => {
  const { calls, pool } = createTransitionPool();
  const repository = createStaffOrdersRepository(pool);

  await repository.transitionStatus({
    orderId: 'order-1',
    status: 'completed',
    version: 4,
    account: { id: 'owner-1', displayName: 'Владелец', role: 'owner' },
    reason: '',
  });

  const update = calls.find(({ sql }) => /update orders/i.test(sql));
  assert.ok(update);
  assert.deepEqual(update.parameters, ['order-1', 'completed']);
  assert.match(
    update.sql,
    /closed_at\s*=\s*case\s+when\s+\$2\s+in\s*\(\s*'completed'\s*,\s*'cancelled'\s*\)\s+then\s+now\(\)\s+else\s+closed_at\s+end/i,
  );
});

const normalizeSql = (sql) => String(sql).replace(/\s+/g, ' ').trim();

test('retention preview counts every inclusive cutoff without issuing mutations', async () => {
  const { createRetentionRepository } = await import(
    '../src/repositories/retention.js'
  );
  const now = new Date('2026-08-12T12:00:00.000Z');
  const calls = [];
  const counts = [2, 3, 5, 7, 11, 13, 17];
  const repository = createRetentionRepository({
    query: async (statement, parameters = []) => {
      calls.push({ sql: normalizeSql(statement), parameters });
      return { rows: [{ count: String(counts[calls.length - 1]) }] };
    },
  });

  const result = await repository.previewRetention(now);

  assert.deepEqual(result, {
    deliveryDetailsAnonymized: 2,
    customerContactsAnonymized: 3,
    privateReviewsDeleted: 5,
    revokedReviewsDeleted: 7,
    expiredSessionsDeleted: 11,
    staffActorsAnonymized: 13,
    providerPayloadsCleared: 17,
  });
  assert.equal(calls.length, 7);
  for (const call of calls) {
    assert.match(call.sql, /^select count\(\*\)/i);
    assert.doesNotMatch(call.sql, /\b(?:update|delete|insert|truncate)\b/i);
    assert.deepEqual(call.parameters, [now]);
  }

  const delivery = calls.find(({ sql }) => /address/.test(sql));
  assert.match(delivery.sql, /closed_at is not null/i);
  assert.match(
    delivery.sql,
    /closed_at <= \$1::timestamptz - interval '90 days'/i,
  );
  assert.match(delivery.sql, /address <> '\{\}'::jsonb/i);
  assert.match(delivery.sql, /customer_comment <> ''/i);
  assert.match(delivery.sql, /courier_comment <> ''/i);

  const contacts = calls.find(({ sql }) => /customer_name <> ''/.test(sql));
  assert.match(contacts.sql, /closed_at is not null/i);
  assert.match(
    contacts.sql,
    /closed_at <= \$1::timestamptz - interval '3 years'/i,
  );
  assert.match(contacts.sql, /phone <> ''/i);

  const privateReviews = calls.find(
    ({ sql }) => /from reviews/.test(sql) && /interval '1 year'/.test(sql),
  );
  assert.match(privateReviews.sql, /published = false/i);
  assert.match(privateReviews.sql, /publication_consent_at is null/i);
  assert.match(privateReviews.sql, /publication_revoked_at is null/i);
  assert.match(
    privateReviews.sql,
    /created_at <= \$1::timestamptz - interval '1 year'/i,
  );
  assert.match(privateReviews.sql, /closed_at is not null/i);

  const revokedReviews = calls.find(
    ({ sql }) => /from reviews/.test(sql) && /interval '3 years'/.test(sql),
  );
  assert.match(revokedReviews.sql, /published = false/i);
  assert.match(revokedReviews.sql, /publication_consent_at is not null/i);
  assert.match(revokedReviews.sql, /publication_revoked_at is not null/i);
  assert.match(
    revokedReviews.sql,
    /publication_revoked_at <= \$1::timestamptz - interval '3 years'/i,
  );
  assert.match(revokedReviews.sql, /closed_at is not null/i);

  const sessions = calls.find(({ sql }) => /from sessions/.test(sql));
  assert.match(sessions.sql, /expires_at <= \$1::timestamptz/i);

  const actors = calls.find(({ sql }) => /from status_history/.test(sql));
  assert.match(
    actors.sql,
    /created_at <= \$1::timestamptz - interval '1 year'/i,
  );
  assert.match(actors.sql, /previous_status is not null/i);
  assert.match(actors.sql, /closed_at is not null/i);
  assert.match(actors.sql, /actor_name <> 'Сотрудник'/u);

  const payloads = calls.find(({ sql }) => /from payments/.test(sql));
  assert.match(payloads.sql, /status in \('paid', 'failed', 'refunded'\)/i);
  assert.match(
    payloads.sql,
    /updated_at <= \$1::timestamptz - interval '30 days'/i,
  );
  assert.match(payloads.sql, /provider_payload <> '\{\}'::jsonb/i);
  assert.match(payloads.sql, /closed_at is not null/i);
});

test('retention apply runs parameterized idempotent mutations in one transaction', async () => {
  const { createRetentionRepository } = await import(
    '../src/repositories/retention.js'
  );
  const now = new Date('2026-08-12T12:00:00.000Z');
  const calls = [];
  const rowCounts = [2, 3, 5, 7, 11, 13, 17];
  let mutationIndex = 0;
  let released = 0;
  const client = {
    query: async (statement, parameters = []) => {
      const sql = normalizeSql(statement);
      calls.push({ sql, parameters });
      if (/^(?:update|delete)\b/i.test(sql)) {
        return { rowCount: rowCounts[mutationIndex++] };
      }
      return { rows: [] };
    },
    release: () => {
      released += 1;
    },
  };
  const repository = createRetentionRepository({
    connect: async () => client,
  });

  const result = await repository.applyRetention(now);

  assert.deepEqual(result, {
    deliveryDetailsAnonymized: 2,
    customerContactsAnonymized: 3,
    privateReviewsDeleted: 5,
    revokedReviewsDeleted: 7,
    expiredSessionsDeleted: 11,
    staffActorsAnonymized: 13,
    providerPayloadsCleared: 17,
  });
  assert.equal(calls[0].sql, 'begin');
  assert.equal(calls.at(-1).sql, 'commit');
  assert.equal(released, 1);

  const mutations = calls.slice(1, -1);
  assert.equal(mutations.length, 7);
  for (const mutation of mutations) {
    assert.match(mutation.sql, /^(?:update|delete)\b/i);
    assert.deepEqual(mutation.parameters, [now]);
    assert.doesNotMatch(mutation.sql, /\breturning\b/i);
  }

  const orderUpdates = mutations.filter(({ sql }) => /^update orders\b/i.test(sql));
  assert.equal(orderUpdates.length, 2);
  assert.match(orderUpdates[0].sql, /set address = '\{\}'::jsonb/i);
  assert.match(orderUpdates[0].sql, /customer_comment = ''/i);
  assert.match(orderUpdates[0].sql, /courier_comment = ''/i);
  assert.match(
    orderUpdates[0].sql,
    /closed_at <= \$1::timestamptz - interval '90 days'/i,
  );
  assert.match(orderUpdates[0].sql, /address <> '\{\}'::jsonb/i);
  assert.match(orderUpdates[1].sql, /set customer_name = ''/i);
  assert.match(orderUpdates[1].sql, /phone = ''/i);
  assert.match(
    orderUpdates[1].sql,
    /closed_at <= \$1::timestamptz - interval '3 years'/i,
  );
  assert.doesNotMatch(
    orderUpdates.map(({ sql }) => sql).join(' '),
    /\b(?:public_number|items_total|delivery_total|discount_total|total)\s*=/i,
  );
  assert.equal(mutations.some(({ sql }) => /^delete from orders\b/i.test(sql)), false);

  const reviewDeletes = mutations.filter(({ sql }) =>
    /^delete from reviews\b/i.test(sql),
  );
  assert.equal(reviewDeletes.length, 2);
  assert.match(reviewDeletes[0].sql, /published = false/i);
  assert.match(reviewDeletes[0].sql, /publication_consent_at is null/i);
  assert.match(reviewDeletes[0].sql, /publication_revoked_at is null/i);
  assert.match(
    reviewDeletes[0].sql,
    /created_at <= \$1::timestamptz - interval '1 year'/i,
  );
  assert.match(reviewDeletes[1].sql, /published = false/i);
  assert.match(reviewDeletes[1].sql, /publication_consent_at is not null/i);
  assert.match(reviewDeletes[1].sql, /publication_revoked_at is not null/i);
  assert.match(
    reviewDeletes[1].sql,
    /publication_revoked_at <= \$1::timestamptz - interval '3 years'/i,
  );
  for (const deletion of reviewDeletes) {
    assert.match(deletion.sql, /closed_at is not null/i);
    assert.doesNotMatch(deletion.sql, /published = true/i);
  }

  const sessionDelete = mutations.find(({ sql }) =>
    /^delete from sessions\b/i.test(sql),
  );
  assert.match(sessionDelete.sql, /expires_at <= \$1::timestamptz/i);

  const actorUpdate = mutations.find(({ sql }) =>
    /^update status_history\b/i.test(sql),
  );
  assert.match(actorUpdate.sql, /set actor_id = null/i);
  assert.match(actorUpdate.sql, /actor_name = 'Сотрудник'/u);
  assert.match(actorUpdate.sql, /previous_status is not null/i);
  assert.match(actorUpdate.sql, /closed_at is not null/i);
  assert.doesNotMatch(actorUpdate.sql, /delete/i);

  const payloadUpdate = mutations.find(({ sql }) =>
    /^update payments\b/i.test(sql),
  );
  assert.match(payloadUpdate.sql, /set provider_payload = '\{\}'::jsonb/i);
  assert.match(payloadUpdate.sql, /status in \('paid', 'failed', 'refunded'\)/i);
  assert.match(
    payloadUpdate.sql,
    /updated_at <= \$1::timestamptz - interval '30 days'/i,
  );
  assert.match(payloadUpdate.sql, /provider_payload <> '\{\}'::jsonb/i);
  assert.match(payloadUpdate.sql, /closed_at is not null/i);
});

test('retention apply rolls back and releases the client when a mutation fails', async () => {
  const { createRetentionRepository } = await import(
    '../src/repositories/retention.js'
  );
  const statements = [];
  let released = 0;
  const client = {
    query: async (statement) => {
      const sql = normalizeSql(statement);
      statements.push(sql);
      if (/^update orders set customer_name/i.test(sql)) {
        throw new Error('mutation failed');
      }
      return { rowCount: 1, rows: [] };
    },
    release: () => {
      released += 1;
    },
  };
  const repository = createRetentionRepository({
    connect: async () => client,
  });

  await assert.rejects(
    repository.applyRetention(new Date('2026-08-12T12:00:00.000Z')),
    /mutation failed/,
  );

  assert.equal(statements[0], 'begin');
  assert.equal(statements.at(-1), 'rollback');
  assert.equal(statements.includes('commit'), false);
  assert.equal(released, 1);
});

const aggregateCounts = Object.freeze({
  deliveryDetailsAnonymized: 2,
  customerContactsAnonymized: 3,
  privateReviewsDeleted: 5,
  revokedReviewsDeleted: 7,
  expiredSessionsDeleted: 11,
  staffActorsAnonymized: 13,
  providerPayloadsCleared: 17,
});

test('retention dry run logs and returns only whitelisted aggregate counts', async () => {
  const { createRetentionService } = await import('../src/services/retention.js');
  const lines = [];
  const now = new Date('2026-08-12T12:00:00.000Z');
  const service = createRetentionService({
    retention: {
      previewRetention: async (receivedNow) => {
        assert.equal(receivedNow, now);
        return {
          ...aggregateCounts,
          orderId: 'private-order-id',
          phone: '+79991234567',
          providerPayload: { secret: 'must-not-log' },
        };
      },
    },
    log: (line) => lines.push(line),
  });

  const result = await service.previewRetention(now);

  assert.deepEqual(result, aggregateCounts);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    mode: 'dry-run',
    counts: aggregateCounts,
  });
  assert.doesNotMatch(lines[0], /private-order-id|\+79991234567|must-not-log/);
});

test('retention apply logs and returns only whitelisted aggregate counts', async () => {
  const { createRetentionService } = await import('../src/services/retention.js');
  const lines = [];
  const now = new Date('2026-08-12T12:00:00.000Z');
  const service = createRetentionService({
    retention: {
      applyRetention: async (receivedNow) => {
        assert.equal(receivedNow, now);
        return { ...aggregateCounts, token: 'must-not-log' };
      },
    },
    log: (line) => lines.push(line),
  });

  const result = await service.applyRetention(now);

  assert.deepEqual(result, aggregateCounts);
  assert.deepEqual(lines.map((line) => JSON.parse(line)), [
    { mode: 'apply', counts: aggregateCounts },
  ]);
  assert.doesNotMatch(lines[0], /must-not-log/);
});

test('retention CLI accepts exactly one supported mode flag', async () => {
  const { parseRetentionMode } = await import('../src/scripts/retention.js');

  assert.equal(parseRetentionMode(['--dry-run']), 'dry-run');
  assert.equal(parseRetentionMode(['--apply']), 'apply');

  for (const argv of [
    [],
    ['--dry-run', '--apply'],
    ['--dry-run', '--dry-run'],
    ['--apply', '--apply'],
    ['--dry-run', '--verbose'],
    ['--apply', '--verbose'],
    ['--unknown'],
  ]) {
    assert.throws(
      () => parseRetentionMode(argv),
      (error) => error?.code === 'INVALID_RETENTION_FLAGS',
      argv.join(' ') || '(no flags)',
    );
  }
});

test('retention CLI production apply requires exact confirmation before opening the database', async () => {
  const { runRetentionCli } = await import('../src/scripts/retention.js');

  for (const confirmation of [undefined, '', 'yes', 'NO', 'YES ']) {
    let databaseOpened = false;
    await assert.rejects(
      runRetentionCli({
        argv: ['--apply'],
        env: {
          NODE_ENV: 'production',
          RETENTION_APPLY_CONFIRM: confirmation,
          DATABASE_URL: 'postgres://secret@database/production',
        },
        createDatabase: () => {
          databaseOpened = true;
          return {};
        },
      }),
      (error) => error?.code === 'PRODUCTION_APPLY_NOT_CONFIRMED',
      String(confirmation),
    );
    assert.equal(databaseOpened, false, String(confirmation));
  }
});

test('retention CLI valid modes run only the selected operation and close the pool', async () => {
  const { runRetentionCli } = await import('../src/scripts/retention.js');
  const now = new Date('2026-08-12T12:00:00.000Z');

  for (const scenario of [
    {
      flag: '--dry-run',
      mode: 'dry-run',
      env: { NODE_ENV: 'production', DATABASE_URL: 'postgres://database/app' },
    },
    {
      flag: '--apply',
      mode: 'apply',
      env: {
        NODE_ENV: 'production',
        RETENTION_APPLY_CONFIRM: 'YES',
        DATABASE_URL: 'postgres://database/app',
      },
    },
  ]) {
    const statements = [];
    const lifecycle = [];
    const lines = [];
    const client = {
      query: async (statement, parameters = []) => {
        statements.push({ sql: normalizeSql(statement), parameters });
        return { rowCount: 0, rows: [] };
      },
      release: () => lifecycle.push('release'),
    };
    const pool = {
      query: async (statement, parameters = []) => {
        statements.push({ sql: normalizeSql(statement), parameters });
        return { rows: [{ count: '0' }] };
      },
      connect: async () => client,
      end: async () => lifecycle.push('end'),
    };

    const result = await runRetentionCli({
      argv: [scenario.flag],
      env: scenario.env,
      now,
      createDatabase: (databaseUrl) => {
        assert.equal(databaseUrl, 'postgres://database/app');
        lifecycle.push('open');
        return pool;
      },
      log: (line) => lines.push(line),
    });

    assert.deepEqual(result, {
      deliveryDetailsAnonymized: 0,
      customerContactsAnonymized: 0,
      privateReviewsDeleted: 0,
      revokedReviewsDeleted: 0,
      expiredSessionsDeleted: 0,
      staffActorsAnonymized: 0,
      providerPayloadsCleared: 0,
    });
    assert.deepEqual(JSON.parse(lines[0]), {
      mode: scenario.mode,
      counts: result,
    });
    assert.equal(lifecycle[0], 'open');
    assert.equal(lifecycle.at(-1), 'end');

    if (scenario.mode === 'dry-run') {
      assert.equal(statements.length, 7);
      assert.equal(
        statements.every(({ sql }) => /^select count\(\*\)/i.test(sql)),
        true,
      );
      assert.deepEqual(lifecycle, ['open', 'end']);
    } else {
      assert.equal(statements[0].sql, 'begin');
      assert.equal(statements.at(-1).sql, 'commit');
      assert.equal(
        statements.slice(1, -1).every(({ sql }) => /^(?:update|delete)\b/i.test(sql)),
        true,
      );
      assert.deepEqual(lifecycle, ['open', 'release', 'end']);
    }
  }
});

test('retention CLI dry-run never invokes schema mutation hooks', async () => {
  const { runRetentionCli } = await import('../src/scripts/retention.js');
  let migrationAttempted = false;
  let ended = false;
  const pool = {
    query: async () => ({ rows: [{ count: '0' }] }),
    end: async () => {
      ended = true;
    },
  };

  const result = await runRetentionCli({
    argv: ['--dry-run'],
    env: { NODE_ENV: 'production', DATABASE_URL: 'postgres://database/app' },
    createDatabase: () => pool,
    migrate: async () => {
      migrationAttempted = true;
      throw new Error('schema mutation attempted');
    },
    log: () => {},
  });

  assert.deepEqual(result, {
    deliveryDetailsAnonymized: 0,
    customerContactsAnonymized: 0,
    privateReviewsDeleted: 0,
    revokedReviewsDeleted: 0,
    expiredSessionsDeleted: 0,
    staffActorsAnonymized: 0,
    providerPayloadsCleared: 0,
  });
  assert.equal(migrationAttempted, false);
  assert.equal(ended, true);
});

test('retention CLI rejected invocations exit nonzero without leaking arguments or environment', () => {
  const scriptPath = fileURLToPath(
    new URL('../src/scripts/retention.js', import.meta.url),
  );
  const secretDatabaseUrl =
    'postgres://private-user:private-password@database/production';

  for (const scenario of [
    { args: [], nodeEnv: 'test', confirmation: '' },
    {
      args: ['--dry-run', '--apply'],
      nodeEnv: 'test',
      confirmation: '',
    },
    { args: ['--apply'], nodeEnv: 'production', confirmation: 'NO' },
  ]) {
    const result = spawnSync(process.execPath, [scriptPath, ...scenario.args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: scenario.nodeEnv,
        RETENTION_APPLY_CONFIRM: scenario.confirmation,
        DATABASE_URL: secretDatabaseUrl,
      },
    });

    assert.equal(result.status, 1, scenario.args.join(' ') || '(no flags)');
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr.trim()), {
      mode: 'rejected',
      counts: {},
    });
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      /private-user|private-password|database\/production|--apply|--dry-run/,
    );
  }
});

test('retention server package exposes the guarded commands', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.equal(
    packageJson.scripts['retention:dry-run'],
    'node src/scripts/retention.js --dry-run',
  );
  assert.equal(
    packageJson.scripts['retention:apply'],
    'node src/scripts/retention.js --apply',
  );
});

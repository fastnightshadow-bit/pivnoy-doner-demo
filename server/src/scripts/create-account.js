import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import argon2 from 'argon2';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';

const [role, displayName] = process.argv.slice(2);
if (!['owner', 'kitchen', 'courier'].includes(role) || !displayName) {
  throw new Error('Usage: node src/scripts/create-account.js <role> <display-name>');
}

const terminal = createInterface({ input: stdin, output: stdout });
const pin = await terminal.question('Введите PIN нового аккаунта: ');
terminal.close();
if (!/^\d{4,12}$/.test(pin)) throw new Error('PIN must contain 4-12 digits');

const config = loadConfig();
const db = createPool(config.databaseUrl);
try {
  const pinHash = await argon2.hash(pin, { type: argon2.argon2id });
  await db.query(
    `insert into staff_accounts (id, display_name, role, pin_hash)
     values ($1, $2, $3, $4)`,
    [randomUUID(), displayName, role, pinHash],
  );
  console.log(`Аккаунт ${displayName} создан.`);
} finally {
  await db.end();
}

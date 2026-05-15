import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);
const HASH_PREFIX = 'pbkdf2_sha256';
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

function safeEqual(first: Buffer, second: Buffer) {
  if (first.length !== second.length) return false;
  return timingSafeEqual(first, second);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const derived = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `${HASH_PREFIX}$${ITERATIONS}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return { valid: false, needsRehash: false };

  const parts = storedHash.split('$');
  if (parts.length === 4 && parts[0] === HASH_PREFIX) {
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expected = Buffer.from(parts[3], 'base64url');
    if (!Number.isFinite(iterations) || iterations < ITERATIONS / 2 || !salt || expected.length === 0) {
      return { valid: false, needsRehash: false };
    }

    const actual = await pbkdf2Async(password, salt, iterations, expected.length, DIGEST);
    return { valid: safeEqual(actual, expected), needsRehash: iterations < ITERATIONS };
  }

  const legacyMatch = storedHash === password;
  return { valid: legacyMatch, needsRehash: legacyMatch };
}

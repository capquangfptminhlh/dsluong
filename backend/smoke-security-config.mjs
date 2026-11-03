import { spawnSync } from 'node:child_process';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

function probe(secret) {
  const env = { ...process.env };
  if (secret === null) delete env.JWT_SECRET;
  else env.JWT_SECRET = secret;
  const result = spawnSync(
    process.execPath,
    ['-e', "require('./middleware/auth').assertJwtSecretConfigured(); console.log('AUTH_CONFIG_OK'); process.exit(0)"],
    { cwd: process.cwd(), env, encoding: 'utf8', timeout: 10000 },
  );
  return result;
}

const missing = probe(null);
assert(missing.status !== 0, `Missing JWT_SECRET unexpectedly succeeded: ${missing.stdout}`);
assert(`${missing.stderr}${missing.stdout}`.includes('JWT_SECRET'), 'Missing-secret failure did not identify JWT_SECRET');

const weak = probe('secret');
assert(weak.status !== 0, `Weak JWT_SECRET unexpectedly succeeded: ${weak.stdout}`);

const oldDefault = probe('CHANGE_ME_autotax_secret_2026');
assert(oldDefault.status !== 0, `Legacy default JWT_SECRET unexpectedly succeeded: ${oldDefault.stdout}`);

const strong = probe('commercial-release-test-secret-not-production');
assert(strong.status === 0 && strong.stdout.includes('AUTH_CONFIG_OK'), `Strong JWT_SECRET failed: ${strong.stderr}`);

console.log('SECURITY CONFIG SMOKE PASSED: missing/weak/default JWT secrets fail closed, strong configured secret passes runtime auth gate');

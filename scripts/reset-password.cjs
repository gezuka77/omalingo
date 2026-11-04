'use strict';

// Run as the app user inside the Oma Lingo container.
const {existsSync} = require('node:fs');
const {join} = require('node:path');
const {randomBytes, scryptSync} = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const {createInterface} = require('node:readline/promises');
const {Writable} = require('node:stream');

async function resetPassword() {
  const dataDir = process.env.OMA_DATA_DIR;
  const database = dataDir && join(dataDir, 'accounts.sqlite');
  if (!database || !existsSync(database)) {
    throw Error('The Oma Lingo account database could not be found in this container.');
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw Error('Run this from an interactive terminal using docker compose exec without -T.');
  }

  const db = new DatabaseSync(database);
  try {
    db.exec('PRAGMA busy_timeout=5000');
    const username = process.argv[2]?.trim().toLowerCase();
    const accounts = username
      ? db.prepare('SELECT id, username FROM users WHERE username=? AND disabled=0').all(username)
      : db.prepare("SELECT id, username FROM users WHERE role='admin' AND disabled=0").all();
    if (accounts.length !== 1) {
      throw Error(username ? 'No active account matches that username.' : 'Could not select one active administrator. Supply the username after the script path.');
    }
    const account = accounts[0];
    console.log('Reset password for ' + account.username);

    // Keep the prompt visible while discarding readline's input echo.
    const muted = new Writable({write(_chunk, _encoding, done) { done(); }});
    const prompt = createInterface({input: process.stdin, output: muted, terminal: true});
    const cancel = new AbortController();
    prompt.once('SIGINT', () => cancel.abort());
    prompt.once('close', () => cancel.abort());
    async function hiddenQuestion(label) {
      process.stdout.write(label);
      try {
        return await prompt.question('', {signal: cancel.signal});
      } finally {
        process.stdout.write('\n');
      }
    }

    let encoded;
    try {
      const password = await hiddenQuestion('New password (10–128 characters): ');
      if (password.length < 10 || password.length > 128) {
        throw Error('Use a password between 10 and 128 characters.');
      }
      if (password !== await hiddenQuestion('Confirm new password: ')) {
        throw Error('The passwords did not match.');
      }
      // Match the existing password format used by auth.cjs.
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync(password, salt, 64, {N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024});
      encoded = salt + ':' + hash.toString('hex');
    } finally {
      prompt.close();
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const result = db.prepare('UPDATE users SET password=? WHERE id=? AND disabled=0').run(encoded, account.id);
      if (result.changes !== 1) throw Error('That account is no longer active.');
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return account.username;
  } finally {
    db.close();
  }
}

resetPassword().then(username => {
  process.stdout.write('Password reset. Sign in as ' + username + ' with your new password.\n', () => process.exit(0));
}, error => {
  const message = error.name === 'AbortError' ? 'Password reset cancelled.' : error.message;
  process.stderr.write(message + '\n', () => process.exit(1));
});

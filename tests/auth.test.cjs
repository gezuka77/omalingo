'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Readable} = require('node:stream');
const {test} = require('node:test');
const {createAuth} = require('../auth.cjs');

const administrator = {username: 'testadmin', name: 'Test administrator', password: 'Temporary-test-password'};

function fixture(t, publicSetup) {
  const temp = fs.realpathSync(os.tmpdir());
  const dataDir = fs.mkdtempSync(path.join(temp, 'omalingo-auth-'));
  let auth = createAuth({dataDir, publicSetup});
  t.after(() => {
    auth.close();
    if (path.dirname(dataDir) === temp) fs.rmSync(dataDir, {recursive: true, force: true});
  });
  return {
    setupFile: path.join(dataDir, 'setup-code'),
    restart() {
      auth.close();
      auth = createAuth({dataDir, publicSetup});
    },
    async request(route, {body, secure = publicSetup} = {}) {
      const req = Object.assign(Readable.from(body ? [JSON.stringify(body)] : []), {
        method: body ? 'POST' : 'GET',
        headers: {},
        socket: {remoteAddress: '127.0.0.1'},
      });
      const res = {
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        writeHead(status) { this.status = status; },
        end(value) { this.body = JSON.parse(value); },
      };
      await auth.handle(req, res, '/api/auth/' + route, {secure});
      return res;
    },
  };
}

test('HTTPS setup requires the host code and preserves the administrator on restart', async t => {
  const app = fixture(t, true);
  const setupCode = fs.readFileSync(app.setupFile, 'utf8').trim();
  assert.match(setupCode, /^[a-f0-9]{48}$/);
  app.restart();
  assert.equal(fs.readFileSync(app.setupFile, 'utf8').trim(), setupCode);
  const initial = await app.request('session');
  assert.deepEqual(initial.body, {setupRequired: true, setupCodeRequired: true, user: null});
  assert.equal((await app.request('setup', {body: administrator})).status, 403);
  const wrongCode = 'f'.repeat(48) === setupCode ? '0'.repeat(48) : 'f'.repeat(48);
  assert.equal((await app.request('setup', {body: {...administrator, setupCode: wrongCode}})).status, 403);
  const result = await app.request('setup', {body: {...administrator, setupCode}});
  assert.equal(result.status, 201);
  assert.equal(result.body.user.role, 'admin');
  assert.match(result.headers['Set-Cookie'], /; Secure$/);
  assert.equal(fs.existsSync(app.setupFile), false);
  assert.equal((await app.request('setup', {body: {...administrator, setupCode}})).status, 403);

  app.restart();
  assert.equal(fs.existsSync(app.setupFile), false);
  assert.deepEqual((await app.request('session')).body, {setupRequired: false, setupCodeRequired: false, user: null});
  const login = await app.request('login', {body: administrator});
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, result.body.user.id);
});

test('loopback setup works without a code and consumes the HTTPS setup code', async t => {
  const app = fixture(t, true);
  assert.equal((await app.request('session', {secure: false})).body.setupCodeRequired, false);
  const result = await app.request('setup', {body: administrator, secure: false});
  assert.equal(result.status, 201);
  assert.doesNotMatch(result.headers['Set-Cookie'], /; Secure$/);
  assert.equal(fs.existsSync(app.setupFile), false);
});

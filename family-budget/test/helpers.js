'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');
process.env.BUDGET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-test-'));
const { openDb } = require('../src/db');
const { Vault } = require('../src/crypto');
const { createApp } = require('../src/app');

function freePort() {
  return new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}
async function startApp({ createScraperImpl } = {}) {
  const dir = fs.mkdtempSync(path.join(process.env.BUDGET_DATA_DIR, 'case-'));
  const db = openDb(path.join(dir, 'b.db'));
  const vault = new Vault(path.join(dir, 'vault.json'));
  const port = await freePort();
  const app = createApp({ db, vault, port, createScraperImpl });
  const server = await new Promise((r) => { const s = app.listen(port, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, url, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const res = await fetch(base + url, { method, headers: { 'X-Requested-With': 'budget', ...(body && !isBuf ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : isBuf ? body : JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
  };
  return { db, vault, app, server, base, dir, call, close: () => server.close() };
}
const catId = (db, name) => db.prepare('SELECT id FROM categories WHERE name=?').get(name).id;
module.exports = { startApp, catId };

// the rules engine's store. rules, the orders it meant to send (intents), the perpl orders it owns, every
// run as a hash chained receipt, and our own record of mark prices and books for replay. wal plus
// synchronous full because an intent row is the one thing we cannot lose between a send and a crash
import { DatabaseSync } from 'node:sqlite'

const path = process.env.PEHRA_DB ?? new URL('../data/pehra.db', import.meta.url).pathname

export const db = new DatabaseSync(path)
db.exec('pragma journal_mode = wal')
db.exec('pragma synchronous = full')
db.exec('pragma foreign_keys = on')

// node's sqlite has no transaction helper. everything inside fn commits together or not at all
export function tx<T>(fn: () => T): T {
  db.exec('begin immediate')
  try { const out = fn(); db.exec('commit'); return out } catch (e) { db.exec('rollback'); throw e }
}

db.exec(`
create table if not exists rules (
  id text primary key, owner text not null, kind text not null, body text not null,
  state text not null, mode text not null, by text not null, sig text,
  created integer not null, updated integer not null, fires integer not null default 0,
  mem text not null default '{}'
);
create index if not exists rules_owner on rules(owner);
create index if not exists rules_state on rules(state);

create table if not exists intents (
  id text primary key, rule text not null, owner text not null, kind text not null,
  pid integer, size real, floor real, rq integer, oid integer, state text not null,
  fill real, tx text, at integer not null, stamps text not null default '{}',
  body text not null default '{}'
);
create index if not exists intents_state on intents(state);

create table if not exists orders (
  rule text not null, step text not null, owner text not null, oid integer, pid integer,
  size real, px real, tp integer, tpc integer, state text not null,
  primary key (rule, step)
);

create table if not exists runs (
  seq integer primary key autoincrement, at integer not null, owner text, rule text,
  kind text not null, body text not null, prev text not null, hash text not null
);
create index if not exists runs_owner on runs(owner, seq);

create table if not exists ticks (
  mkt integer not null, block integer not null, at integer not null,
  mark real, last real, bid real, ask real,
  primary key (mkt, block)
);

create table if not exists books (
  mkt integer not null, at integer not null, bids text not null, asks text not null
);
create index if not exists books_mkt on books(mkt, at);
`)

// columns added after a table first shipped
for (const [table, col, def] of [['intents', 'body', "text not null default '{}'"]] as const) {
  const cols = db.prepare(`pragma table_info(${table})`).all() as { name: string }[]
  if (!cols.some(c => c.name === col)) db.exec(`alter table ${table} add column ${col} ${def}`)
}

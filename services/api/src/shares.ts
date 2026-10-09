// a shared recipe: which one, the margin and leverage it opens with, the market, who shared it. never an
// address of a position or a price, a recipe is written in distances so it fits whoever copies it
import { randomBytes } from 'node:crypto'
import { db } from './db'

db.exec(`create table if not exists shares (id text primary key, recipe text not null, symbol text not null, margin real not null, leverage real not null, author text not null, created integer not null, copies integer not null default 0)`)

const q = {
  put: db.prepare('insert into shares (id, recipe, symbol, margin, leverage, author, created) values (?, ?, ?, ?, ?, ?, ?)'),
  get: db.prepare('select * from shares where id = ?'),
  copied: db.prepare('update shares set copies = copies + 1 where id = ?'),
}

export type Share = { id: string; recipe: string; symbol: string; margin: number; leverage: number; author: string; created: number; copies: number }

export function share(author: string, s: { recipe: string; symbol: string; margin: number; leverage: number }) {
  const id = randomBytes(5).toString('hex')
  q.put.run(id, s.recipe, s.symbol, s.margin, s.leverage, author.toLowerCase(), Date.now())
  return id
}

export const shared = (id: string) => q.get.get(id) as Share | undefined
export const copied = (id: string) => q.copied.run(id)

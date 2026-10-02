// the one state machine every rule moves through. a move that is not in the table throws, and every move
// is written as a run in the same transaction as the rule's new state
import type { RuleState } from '@pehra/perpl'
import { db, tx } from './db'
import { writeRun } from './runs'

export const moves: Record<RuleState, RuleState[]> = {
  draft: ['armed', 'done'],
  armed: ['firing', 'paused', 'done'],
  firing: ['working', 'armed', 'failed', 'done'],
  working: ['working', 'held', 'done', 'failed', 'paused'],
  held: ['working', 'done', 'paused'],
  done: [],
  failed: ['armed', 'done'],
  paused: ['armed', 'done'],
}

const setState = db.prepare('update rules set state = ?, updated = ? where id = ?')

export function canMove(from: RuleState, to: RuleState) { return moves[from].includes(to) }

export function move(r: { id: string; owner: string; state: RuleState }, to: RuleState, why: string, extra: () => void = () => {}) {
  if (!canMove(r.state, to)) throw new Error(`rule ${r.id}: ${r.state} to ${to} is not allowed`)
  const from = r.state
  tx(() => {
    setState.run(to, Date.now(), r.id)
    writeRun({ owner: r.owner, rule: r.id, kind: 'state', body: { from, to, why } })
    extra()
  })
  r.state = to
}

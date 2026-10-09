// social proof that comes from what people actually did on pehra: how many copy a trader now and ever, how
// many trades were copied from them, and which shared recipes people armed most
import { db } from './db'

const q = {
  ever: db.prepare(`select count(distinct owner) as n from rules where kind = 'copy' and lower(json_extract(body, '$.target')) = ?`),
  now: db.prepare(`select count(distinct owner) as n from rules where kind = 'copy' and state in ('armed', 'held', 'firing', 'working') and lower(json_extract(body, '$.target')) = ?`),
  made: db.prepare(`select count(*) as n from intents i join rules r on r.id = i.rule where r.kind = 'copy' and i.kind = 'open' and i.state = 'filled' and lower(json_extract(r.body, '$.target')) = ?`),
  top: db.prepare(`select recipe, sum(copies) as copies, count(*) as links from shares group by recipe order by copies desc, links desc limit 5`),
}

export function copiersOf(target: string) {
  const t = target.toLowerCase()
  return {
    now: (q.now.get(t) as { n: number }).n,
    ever: (q.ever.get(t) as { n: number }).n,
    copied: (q.made.get(t) as { n: number }).n,
  }
}

export const topRecipes = () => q.top.all() as { recipe: string; copies: number; links: number }[]

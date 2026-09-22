import { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { verifyMessage } from 'viem'
import { createAccount, signIn, loadStored, forgetStored, type Session, type StoredAccount } from '../src/account'
import { firstTrade, closeAll } from '../src/trade'
import { bench } from '../src/bench'
import { warmChain, warmTrading, setWarmLog } from '../src/warm'
import { API } from '../src/trade'
import { enrollGuard, guardState, relayOrder, relayCloseAll, type GuardState } from '../src/guard'
import { registerPush, onPushTap, testPush, addFromPush } from '../src/push'

const bg = '#12091f', ink = '#f4efff', dim = '#a898d6', purple = '#8b5cf6'

export default function Dev() {
  const [stored, setStored] = useState<StoredAccount | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [log, setLog] = useState<string[]>([])
  const say = (s: string) => {
    setLog(l => [`${new Date().toLocaleTimeString()} ${s}`, ...l].slice(0, 30))
    console.log('[pehra]', s)
    fetch(`${API}/log`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ line: s }) }).catch(() => {})
  }

  useEffect(() => {
    setWarmLog(say)
    warmChain()
    return onPushTap(data => {
      say(`push tapped: ${data.kind ?? ''} ${data.action ?? ''} pid ${data.pid ?? ''}`)
      const address = stored?.address
      if (data.action === 'add' && data.pid && address) {
        addFromPush(address, Number(data.pid), 10).then(r => say(r.health ? `added 10 AUSD, now ${(r.health.distance * 100).toFixed(2)}% away` : `add failed: ${r.error}`))
      }
    })
  }, [stored?.address])
  useEffect(() => {
    loadStored().then(async st => {
      setStored(st)
      if (!st) return
      // an enrolled account trades through the guard's session, the phone's own socket stays closed
      const g: GuardState = await guardState(st.address).catch(() => ({ enrolled: false }))
      if (g.enrolled) { say(`guard ${g.live ? 'live' : 'reconnecting'} for this account`); return }
      warmTrading(st.address).then(k => say(k ? 'trading socket warm' : 'no api key stored')).catch(e => say(`warm failed: ${describe(e)}`))
    })
  }, [])

  const run = async (label: string, fn: () => Promise<void>) => {
    const t0 = Date.now()
    try { await fn(); say(`${label} ok in ${Date.now() - t0}ms`) }
    catch (e) { say(`${label} failed: ${describe(e)}`) }
  }

  const onCreate = () => run('create passkey', async () => {
    const s = await createAccount()
    setSession(s); setStored({ address: s.address, credentialId: s.credentialId })
    say(`address ${s.address}`)
  })
  const onSignIn = () => run('sign in', async () => {
    const s = await signIn(stored ? { credentialId: stored.credentialId } : undefined)
    setSession(s); setStored({ address: s.address, credentialId: s.credentialId })
    say(`address ${s.address}`)
  })
  const onSign = () => run('sign message', async () => {
    if (!session) throw new Error('no session')
    const message = `pehra ${Date.now()}`
    const signature = await session.account.signMessage({ message })
    const ok = await verifyMessage({ address: session.address, message, signature })
    say(`verify ${ok} sig ${signature.slice(0, 18)}...`)
  })
  const onTrade = () => run('first trade', async () => {
    if (!session) throw new Error('no session')
    const r = await firstTrade(session, say)
    say(`tap to fill ${(r.ms / 1000).toFixed(1)}s`)
  })
  const onClose = () => run('close all', async () => {
    if (!session) throw new Error('no session')
    await closeAll(session, say)
  })
  const onGuardEnroll = () => run('enroll guard', async () => {
    if (!session) throw new Error('no session')
    const r = await enrollGuard(session)
    say(`guard holds a session for account ${r.account}`)
  })
  const onGuardStatus = () => run('guard status', async () => {
    const address = session?.address ?? stored?.address
    if (!address) throw new Error('no account')
    const g = await guardState(address)
    if (!g.enrolled) { say('guard: not enrolled'); return }
    say(`guard: ${g.live ? 'live' : 'reconnecting'}, ${g.balance} AUSD, threshold ${g.settings?.thresholdPct}% target ${g.settings?.targetPct}%`)
    for (const h of g.health ?? []) say(`  ${h.side} ${h.size} @ ${h.entry}, mark ${h.mark}, liq ${h.liq.toFixed(5)}, ${(h.distance * 100).toFixed(2)}% away, ${h.collateral.toFixed(3)} AUSD`)
    for (const e of (g.events ?? []).slice(0, 5)) say(`  ${new Date(e.at).toLocaleTimeString()} ${e.kind} ${e.text}`)
  })
  const onRelayTrade = () => run('trade via guard', async () => {
    const address = session?.address ?? stored?.address
    if (!address) throw new Error('no account')
    const t0 = Date.now()
    const r = await relayOrder(address, 'MON', 'long', 100, 3)
    say(`${r.filled ? 'FILLED' : 'status ' + r.status} ${r.size} MON at ${r.price}, tap to fill ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  })
  const onRelayClose = () => run('close via guard', async () => {
    const address = session?.address ?? stored?.address
    if (!address) throw new Error('no account')
    const r = await relayCloseAll(address)
    say(`closed ${r.closed}`)
  })
  const onPush = () => run('register push', async () => {
    const address = session?.address ?? stored?.address
    if (!address) throw new Error('no account')
    await registerPush(address, say)
    const r = await testPush(address)
    say(`test push: ${r.sent} sent ${r.reason ?? ''}`)
  })
  const onForget = () => run('forget storage', async () => {
    session?.session.end(); setSession(null); setStored(null); await forgetStored()
  })

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: 64, paddingHorizontal: 20 }}>
      <Pressable onPress={() => router.back()}><Text style={{ color: ink, fontSize: 32, fontWeight: '600' }}>pehra ‹</Text></Pressable>
      <Text style={{ color: dim, marginTop: 4 }}>t5 t6 spike · rp {`pehra-passkeys.vercel.app`}</Text>
      <Text style={{ color: ink, marginTop: 20, fontFamily: 'monospace', fontSize: 12 }}>
        stored: {stored ? stored.address : 'none'}{'\n'}session: {session ? 'open' : 'closed'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
        <Btn label="create passkey" onPress={onCreate} />
        <Btn label={stored ? 'sign in (stored)' : 'sign in (pick)'} onPress={onSignIn} />
        <Btn label="sign message" onPress={onSign} disabled={!session} />
        <Btn label="forget storage" onPress={onForget} />
        <Btn label="first trade (t6)" onPress={onTrade} disabled={!session} />
        <Btn label="close all" onPress={onClose} disabled={!session} />
        <Btn label="bench" onPress={() => bench(say)} />
        <Btn label="enroll guard (t7)" onPress={onGuardEnroll} disabled={!session} />
        <Btn label="guard status" onPress={onGuardStatus} disabled={!session && !stored} />
        <Btn label="trade via guard" onPress={onRelayTrade} disabled={!session && !stored} />
        <Btn label="close via guard" onPress={onRelayClose} disabled={!session && !stored} />
        <Btn label="push (t7b)" onPress={onPush} disabled={!session && !stored} />
      </View>
      <ScrollView style={{ marginTop: 20 }}>
        {log.map((l, i) => <Text key={i} style={{ color: dim, fontFamily: 'monospace', fontSize: 11, marginBottom: 6 }}>{l}</Text>)}
      </ScrollView>
      <StatusBar style="light" />
    </View>
  )
}

function describe(e: unknown) {
  if (!(e instanceof Error)) return String(e)
  const code = 'code' in e && typeof e.code === 'string' ? e.code + ' ' : ''
  const cause = e.cause ? ' ' + JSON.stringify(e.cause).slice(0, 200) : ''
  return `${code}${e.message}${cause}`
}

function Btn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ backgroundColor: disabled ? '#2a1f45' : purple, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 }}>
      <Text style={{ color: ink, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

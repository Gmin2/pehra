import './src/polyfills'
import { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { verifyMessage } from 'viem'
import { createAccount, signIn, loadStored, forgetStored, type Session, type StoredAccount } from './src/account'
import { firstTrade, closeAll } from './src/trade'

const bg = '#12091f', ink = '#f4efff', dim = '#a898d6', purple = '#8b5cf6'

export default function App() {
  const [stored, setStored] = useState<StoredAccount | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [log, setLog] = useState<string[]>([])
  const say = (s: string) => setLog(l => [`${new Date().toLocaleTimeString()} ${s}`, ...l].slice(0, 30))

  useEffect(() => { loadStored().then(setStored) }, [])

  const run = async (label: string, fn: () => Promise<void>) => {
    const t0 = Date.now()
    try { await fn(); say(`${label} ok in ${Date.now() - t0}ms`) }
    catch (e: any) { say(`${label} failed: ${e?.code ?? ''} ${e?.message ?? String(e)} ${e?.cause ? JSON.stringify(e.cause).slice(0, 200) : ''}`) }
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
  const onForget = () => run('forget storage', async () => {
    session?.session.end(); setSession(null); setStored(null); await forgetStored()
  })

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: 64, paddingHorizontal: 20 }}>
      <Text style={{ color: ink, fontSize: 32, fontWeight: '600' }}>pehra</Text>
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
      </View>
      <ScrollView style={{ marginTop: 20 }}>
        {log.map((l, i) => <Text key={i} style={{ color: dim, fontFamily: 'monospace', fontSize: 11, marginBottom: 6 }}>{l}</Text>)}
      </ScrollView>
      <StatusBar style="light" />
    </View>
  )
}

function Btn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ backgroundColor: disabled ? '#2a1f45' : purple, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 }}>
      <Text style={{ color: ink, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

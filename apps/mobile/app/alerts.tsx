// alerts (tmp/claude/preview/alerts-a.png): what pehra tells you about, each switch with the push it would
// send, and quiet hours. close to liquidation and liquidated still come through quiet hours
import { useEffect, useState, type ReactNode } from "react";
import { View, ScrollView } from "react-native";
import { Stack } from "expo-router";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { Shield } from "../src/ui/Home";
import { Toggle } from "../src/ui/Settings";
import { Tray } from "../src/ui/Trade";
import { useApp } from "../src/ui/store";
import { readAlerts, saveAlerts, type AlertKind, type AlertPrefs } from "../src/alerts";
import { log } from "../src/log";
import { violet, ink, muted, faint, well } from "../src/ui/Position";

const line = "#EEEAF2";
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const POSITIONS: { kind: AlertKind; icon: ReactNode; title: string; example: string }[] = [
  { kind: "near_liq", icon: <Shield size={24} color={violet} />, title: "close to liquidation", example: "“your mon long is getting close”" },
  { kind: "acted", icon: <Glyph name="crosshairs" size={24} />, title: "a rule acted", example: "“i sold your mon long, never below your floor”" },
  { kind: "filled", icon: <Glyph name="flame" size={24} />, title: "take profit filled", example: "“took some of your profit”" },
  { kind: "liquidated", icon: <Glyph name="gauge" size={24} />, title: "liquidated", example: "“your mon long was liquidated”" },
];
const MARKET: { kind: AlertKind; icon: ReactNode; title: string; example: string }[] = [
  { kind: "funding", icon: <Glyph name="magic-wand-sparkle" size={24} />, title: "funding flipped", example: "“you now pay to hold your mon long”" },
  { kind: "depeg", icon: <Glyph name="lock" size={24} />, title: "ausd off the dollar", example: "“ausd is 0.6% off the dollar”" },
];

export default function Alerts() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null,
    [prefs, setPrefs] = useState<AlertPrefs | null>(null),
    [quietTray, setQuietTray] = useState(false),
    [from, setFrom] = useState(23 * 60),
    [to, setTo] = useState(7 * 60);

  useEffect(() => {
    if (!address) return;
    readAlerts(address).then((r) => setPrefs(r.prefs)).catch((e) => log(`alerts read failed: ${e instanceof Error ? e.message : e}`));
  }, [address]);

  const save = async (patch: Parameters<typeof saveAlerts>[1], undo: AlertPrefs) => {
    if (!address) return;
    try { setPrefs(await saveAlerts(address, patch)); }
    catch (e) { setPrefs(undo); a.toast("couldn’t save that, nothing changed"); log(`alerts save failed: ${e instanceof Error ? e.message : e}`); }
  };
  const flip = (kind: AlertKind, v: boolean) => {
    if (!prefs) return;
    Haptics.selectionAsync();
    const undo = prefs;
    setPrefs({ ...prefs, on: { ...prefs.on, [kind]: v } });
    void save({ on: { [kind]: v } }, undo);
  };
  const openQuiet = () => { setFrom(prefs?.quiet?.from ?? 23 * 60); setTo(prefs?.quiet?.to ?? 7 * 60); setQuietTray(true); };
  const setQuiet = (q: AlertPrefs["quiet"]) => {
    if (!prefs) return;
    const undo = prefs;
    setPrefs({ ...prefs, quiet: q });
    setQuietTray(false);
    void save({ quiet: q }, undo);
  };

  const group = (rows: typeof POSITIONS, delay: number) => (
    <Animated.View entering={FadeInDown.delay(delay).duration(300).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, paddingVertical: 6 }}>
      {rows.map((r) => (
        <View key={r.kind} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 11 }}>
          <View style={{ width: 28, alignItems: "center" }}>{r.icon}</View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{r.title}</Text>
            <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{r.example}</Text>
          </View>
          {prefs ? <Toggle on={prefs.on[r.kind]} onChange={(v) => flip(r.kind, v)} /> : <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: well }} />}
        </View>
      ))}
    </Animated.View>
  );
  const heading = { fontFamily: "Manrope_700Bold", fontSize: 26, lineHeight: 34, color: ink, letterSpacing: -0.5 };
  const step = (v: number, set: (n: number) => void, d: number) => set((v + d + 1440) % 1440);
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>alerts</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}>
        <View style={{ paddingHorizontal: 8, marginTop: 8 }}>
          <Text style={heading}>pehra tells you once,</Text>
          <Text style={heading}>when something changes.</Text>
          <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "500", color: muted }}>never ten pushes for the same thing</Text>
        </View>
        <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 8, fontSize: 13, fontWeight: "700", color: muted }}>your positions</Text>
        {group(POSITIONS, 60)}
        <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 8, fontSize: 13, fontWeight: "700", color: muted }}>the market</Text>
        {group(MARKET, 120)}
        <Animated.View entering={FadeInDown.delay(180).duration(300).reduceMotion(ReduceMotion.System)}>
          <Tap onPress={prefs ? openQuiet : undefined} innerStyle={{ marginTop: 14, backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>quiet hours</Text>
              <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>liquidation alerts still come through</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: prefs?.quiet ? violet : faint }}>{prefs?.quiet ? `${hhmm(prefs.quiet.from)} – ${hhmm(prefs.quiet.to)}` : "off"}</Text>
          </Tap>
        </Animated.View>
        <Text style={{ marginTop: 12, textAlign: "center", fontSize: 11.5, fontWeight: "500", color: faint }}>what quiet hours held comes as one push when they end</Text>
      </ScrollView>

      <Tray visible={quietTray} onClose={() => setQuietTray(false)}>
        <View style={{ paddingHorizontal: 8, gap: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: ink }}>quiet hours</Text>
          {([["from", from, setFrom], ["until", to, setTo]] as const).map(([label, v, set]) => (
            <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ width: 52, fontSize: 14, fontWeight: "600", color: muted }}>{label}</Text>
              <Tap onPress={() => step(v, set, -60)} innerStyle={{ width: 44, height: 44, borderRadius: 22, backgroundColor: well, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: ink }}>−</Text>
              </Tap>
              <Text style={{ flex: 1, textAlign: "center", fontFamily: "Manrope_700Bold", fontSize: 30, color: violet }}>{hhmm(v)}</Text>
              <Tap onPress={() => step(v, set, 60)} innerStyle={{ width: 44, height: 44, borderRadius: 22, backgroundColor: well, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: ink }}>+</Text>
              </Tap>
            </View>
          ))}
          <Tap onPress={() => setQuiet(from === to ? null : { from, to })} innerStyle={{ height: 54, borderRadius: 27, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 15.5, fontWeight: "600", color: "white" }}>{from === to ? "no quiet hours" : `quiet from ${hhmm(from)} to ${hhmm(to)}`}</Text>
          </Tap>
          {prefs?.quiet && (
            <Tap onPress={() => setQuiet(null)} innerStyle={{ height: 44, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: muted }}>turn quiet hours off</Text>
            </Tap>
          )}
        </View>
      </Tray>
    </Screen>
  );
}

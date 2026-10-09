// top traders on perpl this week, read from monad. tap one to watch them or copy them
import { useCallback, useState } from "react";
import { View, ScrollView } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Segmented } from "../src/ui/Trade";
import { useApp } from "../src/ui/store";
import { readLeaders, type Leader } from "../src/rules";
import { ink, muted, green, red, faint, well } from "../src/ui/Position";

const RANGES = ["24h", "7 days", "30 days"] as const;
const DAYS: Record<(typeof RANGES)[number], number> = { "24h": 1, "7 days": 7, "30 days": 30 };
const line = "#EEEAF2";
const cut = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function Leaders() {
  const a = useApp(),
    me = (a.stored?.address ?? a.session?.address ?? "").toLowerCase(),
    [range, setRange] = useState<(typeof RANGES)[number]>("7 days"),
    [list, setList] = useState<Leader[] | null>(null),
    [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    setList(null);
    readLeaders(DAYS[range]).then((l) => { setList(l); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const heading = { fontFamily: "Manrope_700Bold", fontSize: 26, lineHeight: 34, color: ink, letterSpacing: -0.5 };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <View style={{ flex: 1 }} />
        <Tap onPress={() => a.go("/watch")} innerStyle={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "#EFE5FF", justifyContent: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#9E4DFD" }}>find an address</Text>
        </Tap>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}>
        <View style={{ paddingHorizontal: 8 }}>
          <Text style={heading}>top traders on perpl,</Text>
          <Text style={heading}>read from monad.</Text>
          <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "500", color: muted }}>profit on closed trades, every account on perpl testnet. watch one, or copy their next trade at your own size.</Text>
        </View>
        <Segmented options={RANGES} value={range} onChange={setRange} />
        {err && <Text style={{ paddingHorizontal: 8, fontSize: 13, fontWeight: "600", color: red }}>couldn’t load the board: {err}</Text>}
        <View style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, paddingVertical: 6 }}>
          {list === null && !err
            ? [0, 1, 2, 3, 4].map((i) => <View key={i} style={{ height: 22, marginHorizontal: 16, marginVertical: 14, borderRadius: 11, backgroundColor: well }} />)
            : list?.length === 0
              ? <Text style={{ padding: 16, fontSize: 14, fontWeight: "500", color: muted }}>no closed trades in this window yet</Text>
              : list?.map((l, i) => (
                  <Animated.View key={l.accountId} entering={FadeInDown.delay(30 * i).duration(220).reduceMotion(ReduceMotion.System)}>
                    <Tap onPress={() => a.go(`/watch/${l.address}`)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                      <Text style={{ width: 22, fontFamily: "Manrope_700Bold", fontSize: 15, color: i < 3 ? "#9E4DFD" : faint }}>{i + 1}</Text>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "600", color: ink }}>{cut(l.address)}{l.address.toLowerCase() === me ? "  (you)" : ""}</Text>
                        <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{l.closed} closed · {Math.round((l.wins / l.closed) * 100)}% won{l.liquidations ? ` · ${l.liquidations} liquidated` : ""}</Text>
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: l.pnl >= 0 ? green : red }}>{l.pnl >= 0 ? "+" : "−"}{Math.abs(l.pnl).toFixed(2)}</Text>
                    </Tap>
                  </Animated.View>
                ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

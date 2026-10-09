// watch any trader: paste or scan an address, or pick one you already watch. works before signing up
import { useCallback, useState } from "react";
import { View, ScrollView, TextInput } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Stack, useFocusEffect } from "expo-router";
import { Screen, Tap, IconButton } from "../../src/ui/components";
import { Text } from "../../src/ui/Text";
import { useApp } from "../../src/ui/store";
import { myWatches } from "../../src/rules";
import { violet, ink, muted, red, faint } from "../../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF";
const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());
const cut = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function WatchIndex() {
  const a = useApp(),
    me = a.stored?.address ?? a.session?.address ?? null,
    [text, setText] = useState(""),
    [list, setList] = useState<{ target: string; created: number }[]>([]);
  useFocusEffect(useCallback(() => { if (me) myWatches(me).then(setList).catch(() => {}); }, [me]));
  const go = (addr: string) => a.go(`/watch/${addr.trim().toLowerCase()}`);
  const paste = async () => { const t = (await Clipboard.getStringAsync()).trim(); setText(t); if (isAddress(t)) go(t); };
  const heading = { fontFamily: "Manrope_700Bold", fontSize: 26, lineHeight: 34, color: ink, letterSpacing: -0.5 };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 8 }}>
          <Text style={heading}>watch any trader</Text>
          <Text style={heading}>on perpl.</Text>
          <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "500", color: muted }}>their positions and how close each is to liquidation, read from monad. watch one and pehra tells you when they trade.</Text>
        </View>
        <View style={{ backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, padding: 14, gap: 10 }}>
          <TextInput value={text} onChangeText={setText} placeholder="0x… address" placeholderTextColor={faint} autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => isAddress(text) && go(text)}
            style={{ fontFamily: "Manrope_600SemiBold", fontSize: 15, color: ink, paddingVertical: 6 }} />
          {text.length > 0 && !isAddress(text) && <Text style={{ fontSize: 12, fontWeight: "600", color: red }}>that is not an address yet</Text>}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Tap onPress={paste} style={{ flex: 1 }} innerStyle={{ height: 46, borderRadius: 23, backgroundColor: mist, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: violet }}>paste</Text>
            </Tap>
            <Tap onPress={isAddress(text) ? () => go(text) : undefined} style={{ flex: 1 }} innerStyle={{ height: 46, borderRadius: 23, backgroundColor: ink, alignItems: "center", justifyContent: "center", opacity: isAddress(text) ? 1 : 0.4 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "white" }}>look</Text>
            </Tap>
          </View>
        </View>
        {list.length > 0 && (
          <View style={{ backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, paddingVertical: 6 }}>
            <Text style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, fontSize: 13, fontWeight: "700", color: muted }}>you watch</Text>
            {list.map((w) => (
              <Tap key={w.target} onPress={() => go(w.target)} innerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "600", color: ink }}>{cut(w.target)}</Text>
              </Tap>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

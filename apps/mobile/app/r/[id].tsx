// a shared recipe link (https://<host>/r/<id> or pehra://r/<id>): reads the recipe and opens it on the
// recipes screen, ready to arm with this phone's own fingerprint
import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "../../src/ui/components";
import { Text } from "../../src/ui/Text";
import { readShared } from "../../src/rules";
import { log } from "../../src/log";
import { ink, muted, well } from "../../src/ui/Position";

export default function SharedRecipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    readShared(id)
      .then((s) => {
        log(`opened shared recipe ${id}: ${s.recipe} by ${s.author}`);
        router.replace(`/recipes?only=${s.recipe}&symbol=${s.symbol}&margin=${s.margin}&lev=${s.leverage}&from=${s.id}&by=${encodeURIComponent(s.author)}&copies=${s.copies}`);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);
  return (
    <Screen>
      <View style={{ padding: 24, gap: 12, marginTop: 80 }}>
        {err ? (
          <>
            <Text style={{ fontSize: 22, fontWeight: "700", color: ink }}>that link doesn’t open a recipe</Text>
            <Text style={{ fontSize: 14, fontWeight: "500", color: muted }}>{err}</Text>
          </>
        ) : (
          <>
            <View style={{ width: 220, height: 22, borderRadius: 11, backgroundColor: well }} />
            <View style={{ width: 160, height: 16, borderRadius: 8, backgroundColor: well }} />
          </>
        )}
      </View>
    </Screen>
  );
}

import { useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import {
  Screen,
  PortfolioHeader,
  Tap,
  TokenIcon,
  Tabs,
  IconButton,
} from "../src/ui/components";
import { useApp } from "../src/ui/store";
import { space, colors } from "../src/ui/theme";
export default function Activity() {
  const a = useApp(),
    [filter, setFilter] = useState(false);
  return (
    <Screen>
      <Stack.Screen options={{ animation: "none" }} />
      <PortfolioHeader />
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 12 }}>
        {a.pending && (
          <>
            <Text
              style={{ color: colors.muted, fontSize: 13, marginBottom: 14 }}
            >
              Pending ⓘ
            </Text>
            <Tap
              onPress={() => a.open("pending", "")}
              innerStyle={[space.row, { height: 76, gap: 12 }]}
            >
              <TokenIcon id={a.tx.token.id} />
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={space.small}>Sending to {a.tx.recipient}</Text>
                <Text style={{ fontSize: 17, fontWeight: "500" }}>
                  {a.tx.token.name}
                </Text>
              </View>
              <ActivityIndicator color={colors.blue} />
            </Tap>
          </>
        )}
        <View style={space.between}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {filter ? "Received" : "This Week"}
          </Text>
          <IconButton
            name="filter"
            label="Filter activity"
            size={17}
            onPress={() => setFilter(!filter)}
          />
        </View>
        {Array.from({ length: 14 }, (_, i) => (
          <Tap
            key={i}
            onPress={() => a.open("completed", "")}
            innerStyle={[space.row, { height: 80, gap: 13 }]}
          >
            <View>
              <TokenIcon id={i % 3 === 1 ? "polygon" : "ethereum"} />
              <View
                style={{
                  position: "absolute",
                  right: -4,
                  bottom: -4,
                  backgroundColor: "#f1f1f1",
                  borderWidth: 2,
                  borderColor: "white",
                  borderRadius: 12,
                  width: 22,
                  height: 22,
                  alignItems: "center",
                }}
              >
                <Text>↓</Text>
              </View>
            </View>
            <View style={{ flex: 1, gap: 7 }}>
              <Text style={space.small}>Received from · 0x4c96···f957</Text>
              <Text style={{ fontSize: 16, fontWeight: "500" }}>
                {i % 3 === 1 ? "Polygon" : "Ethereum"}
              </Text>
            </View>
            <Text style={{ fontSize: 15, color: colors.green }}>
              +${(1.05 + i * 0.01).toFixed(2)}
            </Text>
          </Tap>
        ))}
      </ScrollView>
      <Tabs active="activity" />
    </Screen>
  );
}

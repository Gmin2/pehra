import { useRef, useState } from "react";
import { View, Text, ScrollView, TextInput, Linking } from "react-native";
import { Stack } from "expo-router";
import {
  Screen,
  Icon,
  IconButton,
  Glyph,
  Tap,
  Button,
  Tabs,
} from "../src/ui/components";
import { useApp } from "../src/ui/store";
import { space, colors } from "../src/ui/theme";
const sites = [
  ["Mirror", "mirror.xyz", "#138bf7", "▢"],
  ["Zora", "zora.co", "#82c8db", "◉"],
  ["Foundation", "foundation.app", "#111", "▲●■"],
  ["OpenSea", "opensea.io", "#2788e8", "⛵"],
  ["Rarible", "rarible.com", "#f17eff", "R"],
  ["mint.fun", "mint.fun", "#111", "m"],
  ["Endaoment", "endaoment.org", "#f5b4d4", "✳"],
  ["Party", "party.app", "#161b30", "🎉"],
];
export default function Browser() {
  const a = useApp(),
    [query, setQuery] = useState(""),
    [site, setSite] = useState(""),
    [tabs, setTabs] = useState<string[]>([]),
    [showTabs, setShowTabs] = useState(false),
    input = useRef<TextInput>(null);
  const navigate = (url: string) => {
    setSite(url);
    setQuery(url);
    setShowTabs(false);
    setTabs((t) => (t.includes(url) ? t : [...t, url]));
    input.current?.blur();
  };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "none" }} />
      <View
        style={[
          space.row,
          { gap: 12, paddingHorizontal: 24, paddingVertical: 14 },
        ]}
      >
        <Tap onPress={() => a.go("/")}>
          <View
            style={{
              backgroundColor: a.wallet.color,
              borderRadius: 12,
              padding: 3,
            }}
          >
            <Glyph wallet={a.wallet} size={27} />
          </View>
        </Tap>
        <View
          style={[
            space.row,
            {
              flex: 1,
              gap: 8,
              backgroundColor: "#f4f4f4",
              paddingHorizontal: 13,
              borderRadius: 20,
            },
          ]}
        >
          <Icon name="search" size={15} color={colors.muted} />
          <TextInput
            ref={input}
            placeholder="Search"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => query.trim() && navigate(query.trim())}
            returnKeyType="go"
            style={{ flex: 1, fontSize: 16, height: 40 }}
          />
        </View>
        <IconButton
          name="more"
          label="Browser settings"
          onPress={() => a.open("browserSettings", "Browser Settings")}
        />
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
        {showTabs ? (
          <View>
            <Text style={space.title}>Your tabs</Text>
            {tabs.length ? (
              tabs.map((t) => (
                <View key={t} style={[space.between, { paddingVertical: 20 }]}>
                  <Tap
                    onPress={() => navigate(t)}
                    innerStyle={[space.row, { gap: 12 }]}
                  >
                    <Icon name="globe" />
                    <Text>{t}</Text>
                  </Tap>
                  <IconButton
                    name="close"
                    label={`Close ${t}`}
                    onPress={() => {
                      setTabs((ts) => ts.filter((x) => x !== t));
                      if (site === t) setSite("");
                    }}
                  />
                </View>
              ))
            ) : (
              <Text style={[space.copy, { marginTop: 20 }]}>
                No tabs yet. Start exploring below.
              </Text>
            )}
          </View>
        ) : site ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 25,
            }}
          >
            <Icon name="globe" size={65} color={colors.blue} />
            <Text style={space.title}>{site}</Text>
            <Button
              variant="secondary"
              onPress={() =>
                Linking.openURL(
                  "https://" +
                    (site.includes(".")
                      ? site
                      : "www.google.com/search?q=" + encodeURIComponent(site)),
                )
              }
            >
              Open Website
            </Button>

          </View>
        ) : (
          <>
            <View style={[space.between, { marginBottom: 22 }]}>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                Suggested
              </Text>
              <Icon name="info" size={13} color={colors.faint} />
            </View>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                rowGap: 24,
                justifyContent: "space-between",
              }}
            >
              {sites.map(([name, url, color, glyph]) => (
                <Tap
                  key={url}
                  onPress={() => navigate(url)}
                  innerStyle={{ alignItems: "center", gap: 10, width: 73 }}
                >
                  <View
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 17,
                      backgroundColor: color,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: name === "Foundation" ? 16 : 30,
                        fontWeight: "700",
                      }}
                    >
                      {glyph}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: "500" }}>
                    {name}
                  </Text>
                </Tap>
              ))}
            </View>
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                paddingVertical: 40,
                gap: 17,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "600" }}>
                Start Exploring Ethereum
              </Text>
              <Text
                style={[
                  space.copy,
                  { textAlign: "center", fontSize: 14, lineHeight: 21 },
                ]}
              >
                Explore Ethereum and easily connect to{`\n`}your favorite sites
                in just a few taps.
              </Text>
              <Text style={{ fontSize: 55, color: "#c4c4c4", marginTop: 8 }}>
                ⤵
              </Text>
            </View>
          </>
        )}
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          paddingHorizontal: 10,
          paddingBottom: 10,
        }}
      >
        <IconButton
          name="back"
          label="Browser back"
          onPress={() => {
            setSite("");
            setQuery("");
            setShowTabs(false);
          }}
        />
        <IconButton
          name="chevron"
          label="Browser forward"
          onPress={() => tabs.length && navigate(tabs[tabs.length - 1])}
        />
        <IconButton
          name="search"
          label="New browser tab"
          onPress={() => {
            setSite("");
            setQuery("");
            setShowTabs(false);
            input.current?.focus();
          }}
        />
        <Tap
          accessibilityLabel="Show browser tabs"
          onPress={() => setShowTabs(!showTabs)}
          innerStyle={{
            width: 40,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              borderWidth: 1.5,
              borderColor: "#aaa",
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
              color: "#999",
              fontSize: 12,
            }}
          >
            {tabs.length || 1}
          </Text>
        </Tap>
        <IconButton
          name="more"
          label="Browser options"
          onPress={() => a.open("browserSettings", "Browser Settings")}
        />
      </View>
      <Tabs active="browser" />
    </Screen>
  );
}

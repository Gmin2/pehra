import { useMemo, useState } from "react";
import { View, Text, ScrollView, Image } from "react-native";
import { Stack } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import {
  Screen,
  PortfolioHeader,
  Tap,
  TokenIcon,
  Icon,
  Button,
  Check,
  MorphText,
  Tabs,
  s,
} from "../src/ui/components";
import { useApp } from "../src/ui/store";
import { moveItem } from "../src/ui/model";
import { tokens, type Token } from "../src/ui/data";
import { images } from "../src/ui/assets";
import { colors, space } from "../src/ui/theme";
function TokenRow({
  token: t,
  index,
  move,
  editing,
  onPress,
  stealth,
}: {
  token: Token;
  index: number;
  move: (from: number, to: number) => void;
  editing: boolean;
  onPress: () => void;
  stealth: boolean;
}) {
  const y = useSharedValue(0),
    dragging = useSharedValue(false);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(editing)
        .activateAfterLongPress(100)
        .onStart(() => {
          dragging.set(true);
        })
        .onUpdate((e) => y.set(e.translationY))
        .onEnd((e) => {
          scheduleOnRN(move, index, index + Math.round(e.translationY / 73));
          y.set(
            withSpring(0, {
              duration: 300,
              dampingRatio: 0.8,
              reduceMotion: ReduceMotion.System,
            }),
          );
          dragging.set(false);
          scheduleOnRN(Haptics.selectionAsync);
        }),
    [editing, index, move, y, dragging],
  );
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }, { scale: dragging.get() ? 1.025 : 1 }],
    zIndex: dragging.get() ? 10 : 0,
    boxShadow: dragging.get() ? "0 8px 18px #0002" : "0 0 0 transparent",
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        layout={LinearTransition.duration(180).reduceMotion(
          ReduceMotion.System,
        )}
        style={[{ backgroundColor: "white", borderRadius: 14 }, style]}
      >
        <Tap
          onPress={onPress}
          accessibilityLabel={t.name}
          innerStyle={{
            height: 73,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <TokenIcon id={t.id} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600" }}>
              {t.name}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {stealth ? "•••••" : t.amount} {t.symbol}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 5 }}>
            <Text style={{ fontSize: 16, fontWeight: "500" }}>
              {stealth ? "✱✱✱✱" : `$${t.value}`}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {t.change}
            </Text>
          </View>
          {editing && <Icon name="list" size={17} color="#ccc" />}
        </Tap>
      </Animated.View>
    </GestureDetector>
  );
}
export default function Portfolio() {
  const a = useApp(),
    [order, setOrder] = useState(tokens),
    [selected, setSelected] = useState<number[]>([]),
    [trashed, setTrashed] = useState<number[]>([]),
    [confirmTrash, setConfirmTrash] = useState(false);
  const empty = a.wallet.id === "fees";
  const move = (from: number, to: number) =>
    setOrder((old) => moveItem(old, from, to));
  return (
    <Screen>
      <Stack.Screen options={{ animation: "none" }} />
      <PortfolioHeader />
      <ScrollView
        scrollEnabled={!a.reorder}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 18 }}
      >
        {a.showBalance && (
          <Tap
            onPress={() => a.setStealth(!a.stealth)}
            innerStyle={{ marginTop: 12, marginBottom: 24 }}
          >
            <MorphText text={a.stealth ? "✱✱✱✱✱" : "$588.04"} size={43} />
            <Text style={{ color: colors.muted, marginTop: 7 }}>
              ~$1.91 · −0.32%
            </Text>
          </Tap>
        )}
        <View style={[space.between, { height: 56 }]}>
          {a.reorder ? (
            <>
              <Text style={{ fontSize: 15 }}>⇵ Custom</Text>
              <Tap onPress={() => a.setReorder(false)}>
                <Text style={{ color: colors.blue, fontWeight: "600" }}>
                  Done
                </Text>
              </Tap>
            </>
          ) : (
            <>
              <View style={[space.row, { gap: 17 }]}>
                {["tokens", "collectibles"].map((t) => (
                  <Tap
                    key={t}
                    onPress={() => {
                      a.setTab(t);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color: a.tab === t ? colors.ink : "#bbb",
                      }}
                    >
                      {t === "tokens" ? "Tokens" : "Collectibles"}
                    </Text>
                  </Tap>
                ))}
              </View>
              {!a.showBalance && (
                <Tap onPress={() => a.setShowBalance(true)}>
                  <Text style={{ fontSize: 14, color: colors.muted }}>
                    {a.stealth ? "✱✱✱✱" : "$589.55"}
                  </Text>
                </Tap>
              )}
            </>
          )}
        </View>
        {empty ? (
          <View style={{ alignItems: "center", paddingTop: 70, gap: 20 }}>
            <View
              style={{
                opacity: 0.12,
                flexDirection: "row",
                alignItems: "center",
                gap: 15,
                marginBottom: 30,
              }}
            >
              <TokenIcon id="ethereum" />
              <Text style={{ fontSize: 18 }}>Ethereum</Text>
              <Text>$0.00</Text>
            </View>
            <MorphText
              text={
                a.tab === "tokens"
                  ? "There’s nothing here, yet"
                  : "Nothing to see here, for now"
              }
              size={19}
            />
            <Text style={[space.copy, { textAlign: "center" }]}>
              {a.tab === "tokens"
                ? "Deposit tokens to your address or buy Ethereum to start using your wallet."
                : "When collectibles are sent to your wallet address, they’ll appear here."}
            </Text>
            <Button variant="secondary" onPress={() => a.go("/receive")}>
              Receive
            </Button>
            <Text style={space.small}>Learn more about {a.tab} ⓘ</Text>
          </View>
        ) : a.tab === "tokens" ? (
          <View>
            {order.map((t, i) => (
              <TokenRow
                key={t.id}
                token={t}
                index={i}
                move={move}
                editing={a.reorder}
                stealth={a.stealth}
                onPress={() => {
                  if (!a.reorder) {
                    a.setToken(t);
                    a.go("/token");
                  }
                }}
              />
            ))}
          </View>
        ) : (
          <View>
            <View style={[space.between, { marginVertical: 16 }]}>
              <Text style={{ fontWeight: "600" }}>🐸 Froggy Friends</Text>
              <Tap
                onPress={() =>
                  setSelected(
                    selected.length
                      ? []
                      : [0, 1, 2, 3, 4].filter((i) => !trashed.includes(i)),
                  )
                }
              >
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {selected.length ? "Unselect All" : "Select All"}
                </Text>
              </Tap>
            </View>
            <View style={s.grid}>
              {[0, 1, 2, 3, 4]
                .filter((i) => !trashed.includes(i))
                .map((i) => (
                  <Animated.View
                    key={i}
                    layout={LinearTransition.duration(200)}
                    style={{ width: "47.6%" }}
                  >
                    <Tap
                      accessibilityLabel={`Select collectible ${i + 1}`}
                      onPress={() =>
                        setSelected((prev) =>
                          prev.includes(i)
                            ? prev.filter((x) => x !== i)
                            : [...prev, i],
                        )
                      }
                    >
                      <Image
                        source={images[`frog-${i}`]}
                        style={{
                          width: "100%",
                          aspectRatio: 1,
                          borderRadius: 19,
                        }}
                      />
                      <View
                        style={{ position: "absolute", right: 9, bottom: 9 }}
                      >
                        <Check
                          checked={selected.includes(i)}
                          color={colors.ink}
                        />
                      </View>
                    </Tap>
                  </Animated.View>
                ))}
            </View>
            {!!selected.length && (
              <View style={{ marginTop: 20, gap: 10 }}>
                <Button
                  onPress={() => {
                    a.setTx((t) => ({
                      ...t,
                      kind: "nft",
                      nfts: selected,
                      step: "confirm",
                    }));
                    a.go("/transaction");
                  }}
                >
                  Send {selected.length} Collectibles
                </Button>
                <Button
                  variant={confirmTrash ? "danger" : "secondary"}
                  onPress={() => {
                    if (confirmTrash) {
                      setTrashed([...trashed, ...selected]);
                      setSelected([]);
                      setConfirmTrash(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      a.toast("Collectibles moved to Trash");
                    } else setConfirmTrash(true);
                  }}
                >
                  {confirmTrash ? "Confirm Trash" : "Trash"}
                </Button>
              </View>
            )}
          </View>
        )}
      </ScrollView>
      {!empty && a.tab === "tokens" && (
        <View style={[s.footer, { flexDirection: "row", gap: 12 }]}>
          <Button
            style={{ flex: 1 }}
            variant="secondary"
            onPress={() => a.go("/receive")}
          >
            Receive
          </Button>
          <Button
            style={{ flex: 1 }}
            variant="black"
            onPress={() => {
              a.setTx((t) => ({
                ...t,
                kind: "send",
                step: "select",
                amount: "0",
              }));
              a.go("/transaction");
            }}
          >
            Send
          </Button>
        </View>
      )}
      <Tabs active="portfolio" />
    </Screen>
  );
}

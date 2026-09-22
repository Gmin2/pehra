import { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  useWindowDimensions,
  TextInput,
} from "react-native";
import { Stack } from "expo-router";
import Svg, {
  Path,
  Line,
  Circle,
  Defs,
  ClipPath,
  Rect,
} from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  ReduceMotion,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import {
  Screen,
  Button,
  Tap,
  TokenIcon,
  Icon,
  IconButton,
  Glyph,
  s,
} from "../src/ui/components";
import { useApp } from "../src/ui/store";
import { colors, space } from "../src/ui/theme";
import traced from "../src/ui/chart-points.json";
const APath = Animated.createAnimatedComponent(Path),
  ALine = Animated.createAnimatedComponent(Line),
  ACircle = Animated.createAnimatedComponent(Circle),
  ARect = Animated.createAnimatedComponent(Rect),
  APrice = Animated.createAnimatedComponent(TextInput);
export default function Token() {
  const a = useApp(),
    [range, setRange] = useState(a.token.id === "usdc" ? 0 : 3),
    [starred, setStarred] = useState(false),
    [description, setDescription] = useState(false),
    { width } = useWindowDimensions();
  const x = useSharedValue(393),
    active = useSharedValue(0);
  const points = useMemo(
    () =>
      a.token.id === "polygon" && range === 3
        ? traced.polygon
        : a.token.id === "usdc" && range === 0
          ? traced.usdc
          : Array.from({ length: 100 }, (_, i) => [
              (i * 393) / 99,
              100 +
                Math.sin(i * 0.08 + range) * 40 +
                Math.sin(i * 0.4) * 14 +
                Math.sin(i * 1.7) * 4 +
                range * i * 0.12,
            ]),
    [range, a.token.id],
  );
  // A fixed sample count keeps chart-range interpolation continuous on the UI thread.
  const normalized = useMemo(
    () =>
      Array.from({ length: 394 }, (_, i) => {
        const f = (i / 393) * (points.length - 1),
          lo = Math.floor(f),
          hi = Math.min(points.length - 1, lo + 1);
        return points[lo][1] + (points[hi][1] - points[lo][1]) * (f - lo);
      }),
    [points],
  );
  const shape = useSharedValue(normalized);
  useEffect(() => {
    shape.set(
      withTiming(normalized, {
        duration: 280,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [normalized, shape]);
  const pathProps = useAnimatedProps(() => ({
    d: shape
      .get()
      .map((y, i) => `${i ? "L" : "M"}${i},${y}`)
      .join(" "),
  }));
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          x.set(Math.max(0, Math.min(393, (e.x / width) * 393)));
          active.set(1);
        })
        .onUpdate((e) => x.set(Math.max(0, Math.min(393, (e.x / width) * 393))))
        .onFinalize(() => {
          active.set(withTiming(0, { duration: 180 }));
          x.set(393);
        }),
    [x, active, width],
  );
  const point = () => {
    "worklet";
    const index = Math.max(0, Math.min(393, Math.round(x.get())));
    return [index, shape.get()[index]];
  };
  const circle = useAnimatedProps(() => ({
      cx: point()[0],
      cy: point()[1],
      opacity: active.get(),
    })),
    line = useAnimatedProps(() => ({
      x1: point()[0],
      x2: point()[0],
      opacity: active.get(),
    })),
    clip = useAnimatedProps(() => ({ width: x.get() })),
    chartstyle = useAnimatedStyle(() => ({ opacity: 1 - active.get() * 0.8 }));
  const price = useAnimatedProps(() => {
    const value = active.get()
      ? Math.max(0.001, a.token.price * (1 + (130 - point()[1]) * 0.006))
      : a.token.price;
    const text = "$" + value.toFixed(a.token.price === 1 ? 3 : 2);
    return { text, defaultValue: text };
  });
  return (
    <Screen>
      <Stack.Screen options={{ presentation: "modal", headerShown: false }} />
      <Tap
        accessibilityLabel="Close token details"
        onPress={a.back}
        innerStyle={{
          alignItems: "center",
          height: 24,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            backgroundColor: "#e7e7e7",
          }}
        />
      </Tap>
      <ScrollView contentContainerStyle={{ paddingBottom: 10 }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 14 }}>
          <View style={space.between}>
            <TokenIcon id={a.token.id} size={56} />
            <IconButton
              name="star"
              label={starred ? "Unstar token" : "Star token"}
              color={starred ? "#f3c549" : "#e6e6e6"}
              size={28}
              onPress={() => {
                setStarred(!starred);
                Haptics.selectionAsync();
              }}
            />
          </View>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "700",
              marginTop: 13,
              letterSpacing: -0.6,
            }}
          >
            {a.token.id === "usdc" ? "USDC" : a.token.name}
          </Text>
          <View style={[space.between, { marginTop: 4 }]}>
            <APrice
              editable={false}
              underlineColorAndroid="transparent"
              animatedProps={price}
              defaultValue={`$${a.token.price.toFixed(2)}`}
              style={{
                fontSize: 26,
                fontWeight: "600",
                color: colors.ink,
                padding: 0,
                minWidth: 130,
              }}
            />
            <Text style={{ fontSize: 23, color: "#aaa", fontWeight: "500" }}>
              ↓ {range === 3 ? "21.68" : "0.11"}%
            </Text>
          </View>
        </View>
        <GestureDetector gesture={gesture}>
          <View
            accessibilityLabel={`${a.token.name} price chart, drag to inspect`}
            style={{ height: 245, marginTop: 24 }}
          >
            <Animated.View
              style={[{ position: "absolute", inset: 0 }, chartstyle]}
            >
              <Svg width={width} height={245} viewBox="0 0 393 245">
                <APath
                  animatedProps={pathProps}
                  fill="none"
                  stroke={a.token.color}
                  strokeWidth={3.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Animated.View>
            <Svg width={width} height={245} viewBox="0 0 393 245">
              <Defs>
                <ClipPath id="history">
                  <ARect x={0} y={0} height={245} animatedProps={clip} />
                </ClipPath>
              </Defs>
              <APath
                animatedProps={pathProps}
                fill="none"
                stroke={a.token.color}
                strokeWidth={3.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                clipPath="url(#history)"
              />
              <ALine
                animatedProps={line}
                y1={0}
                y2={235}
                stroke="#ddd"
                strokeDasharray="3 4"
              />
              <ACircle
                animatedProps={circle}
                r={6}
                fill={a.token.color}
                stroke="white"
                strokeWidth={3}
              />
            </Svg>
          </View>
        </GestureDetector>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-evenly",
            paddingHorizontal: 20,
            marginTop: 3,
            marginBottom: 25,
          }}
        >
          {["1H", "1D", "1W", "1M", "1Y"].map((label, i) => (
            <Tap
              key={label}
              onPress={() => {
                setRange(i);
                Haptics.selectionAsync();
              }}
              innerStyle={{
                width: 40,
                height: 40,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  range === i ? a.token.color + "20" : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: range === i ? a.token.color : "#aaa",
                }}
              >
                {label}
              </Text>
            </Tap>
          ))}
        </View>
        <View
          style={{
            marginHorizontal: 24,
            borderTopWidth: 1,
            borderColor: "#f2f2f2",
            paddingVertical: 28,
            flexDirection: "row",
          }}
        >
          <View
            style={{
              alignItems: "center",
              flex: 1,
              gap: 8,
              borderRightWidth: 1,
              borderColor: "#f2f2f2",
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 16 }}>Balance</Text>
            <View style={[space.row, { gap: 8 }]}>
              <TokenIcon id={a.token.id} size={20} />
              <Text style={{ fontSize: 23, fontWeight: "600" }}>
                {a.token.id === "usdc" ? "19.491" : a.token.amount}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "center", flex: 1, gap: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 16 }}>Value</Text>
            <Text style={{ fontSize: 23, fontWeight: "600" }}>
              ${a.token.id === "usdc" ? "19.49" : a.token.value}
            </Text>
          </View>
        </View>
        <View
          style={{
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: "#eee",
            marginHorizontal: 24,
            padding: 16,
            borderRadius: 13,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 16 }}>Owned by</Text>
          <Glyph wallet={a.wallet} size={20} />
          <Text style={{ fontWeight: "600", fontSize: 16 }}>You</Text>
        </View>
        <Tap
          onPress={() => setDescription(!description)}
          innerStyle={{
            paddingHorizontal: 24,
            paddingTop: 25,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
          }}
        >
          <Icon name="list" size={15} color="#aaa" />
          <Text style={{ fontSize: 18, fontWeight: "600" }}>Description</Text>
        </Tap>
        {description && (
          <Text style={[space.copy, { padding: 24 }]}>
            {a.token.name} is a token held in this reference wallet. Explore its
            history and choose an action below.
          </Text>
        )}
      </ScrollView>
      <View style={[s.footer, { flexDirection: "row", gap: 16 }]}>
        {["Swap", "Send"].map((label) => (
          <Button
            key={label}
            style={{ flex: 1 }}
            color={a.token.color}
            onPress={() => {
              a.setTx((t) => ({
                ...t,
                token: a.token,
                kind: label === "Swap" ? "swap" : "send",
                step: "amount",
                amount: label === "Swap" ? "1" : "0",
                approved: false,
              }));
              a.go("/transaction");
            }}
          >
            {label}
          </Button>
        ))}
      </View>
    </Screen>
  );
}

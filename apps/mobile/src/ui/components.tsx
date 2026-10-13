import React, { useState } from "react";
import { Glyph as TwoTone, glyphFor } from "./Glyph";
import { View, Image, Pressable, StyleSheet, type ViewStyle, type StyleProp, type PressableProps, TextInput, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { SvgXml, Path } from "react-native-svg";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";
import { icons } from "./icons";
import { images } from "./assets";
import { colors, space } from "./theme";
import { useApp } from "./store";
import type { Wallet } from "./data";
export function Icon({
  name,
  size = 22,
  color = colors.ink,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  if (name === "more")
    return (
      <Text
        style={{
          fontSize: size,
          lineHeight: size + 4,
          color,
          letterSpacing: 1,
        }}
      >
        •••
      </Text>
    );
  if (glyphFor[name]) return <TwoTone name={glyphFor[name]} size={size} color={color} />;
  return (
    <SvgXml
      xml={(icons[name] || icons.info)
        .replace(/#000(?:000)?\b/g, color)
        .replace(/currentColor/g, color)}
      width={size}
      height={size}
    />
  );
}
export function Tap({
  children,
  style,
  innerStyle,
  ...props
}: Omit<PressableProps, "children" | "style" | "onPress"> & {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
}) {
  const [pressed, setPressed] = useState(false),
    reduced = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={5}
      pressRetentionOffset={16}
      {...props}
      onAccessibilityTap={props.disabled ? undefined : props.onPress}
      style={style}
      onPressIn={(e) => {
        setPressed(true);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        props.onPressOut?.(e);
      }}
    >
      <Animated.View
        style={[
          {
            transitionProperty: ["transform", "opacity", "backgroundColor"],
            transitionDuration: 120,
            transitionTimingFunction: "ease-out",
            transform: [{ scale: pressed && !reduced ? 0.97 : 1 }],
            opacity: props.disabled ? 0.4 : 1,
          },
          innerStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
// back, open and close: a violet mark on a soft violet circle. every other icon is a two tone glyph
const MARK_PATHS: Record<string, string> = {
  back: "M14.5 6 L8.5 12 L14.5 18",
  chevron: "M9.5 6 L15.5 12 L9.5 18",
  close: "M7 7 L17 17 M17 7 L7 17",
};
export function Mark({ name, size = 38 }: { name: "back" | "chevron" | "close"; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#EFE5FF", alignItems: "center", justifyContent: "center" }}>
      <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24">
        <Path d={MARK_PATHS[name]} stroke="#9E4DFD" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
// a tick drawn at its own size, the icon set's check reads flipped when small
export const Tick = ({ size = 14, color = "white" }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 14 14">
    <Path d="M2.8 7.4 L5.8 10.2 L11.2 4" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
// the open mark at row size
export const Chevron = () => <Mark name="chevron" size={26} />;

export function IconButton({
  name,
  label,
  onPress,
  color,
  size = 22,
}: {
  name: string;
  label?: string;
  onPress: () => void;
  color?: string;
  size?: number;
}) {
  return (
    <Tap
      accessibilityLabel={label || name}
      onPress={onPress}
      innerStyle={{
        width: 40,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {name === "back" || name === "close" || name === "chevron" ? <Mark name={name} /> : <Icon name={name} color={color || "#9E4DFD"} size={size} />}
    </Tap>
  );
}
export function Screen({
  children,
  dark = false,
  background,
}: {
  children: React.ReactNode;
  dark?: boolean;
  background?: string;
}) {
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[
        space.screen,
        dark && { backgroundColor: "#141414" },
        background ? { backgroundColor: background } : undefined,
      ]}
    >
      {children}
    </SafeAreaView>
  );
}
export function Header({
  title = "",
  center,
  left = "back",
  right = "help",
  onLeft,
  onRight,
  dark = false,
}: {
  title?: string;
  center?: React.ReactNode;
  left?: string;
  right?: string;
  onLeft?: () => void;
  onRight?: () => void;
  dark?: boolean;
}) {
  const a = useApp();
  return (
    <View style={s.header}>
      <IconButton name={left} onPress={onLeft || a.back} />
      {center || (
        <Text style={[s.heading, dark && { color: "#fff" }]}>{title}</Text>
      )}
      <IconButton
        name={right}
        onPress={onRight || (() => a.open("education", title))}
      />
    </View>
  );
}
export function Button({
  children,
  onPress,
  variant = "primary",
  color,
  disabled = false,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "black" | "danger";
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      style={style}
      innerStyle={[
        s.button,
        {
          backgroundColor:
            color ||
            (variant === "secondary"
              ? "#F0EDF3"
              : variant === "black"
                ? "#28243E"
                : variant === "danger"
                  ? colors.red
                  : colors.blue),
        },
      ]}
    >
      {typeof children === "string" ? (
        <Text
          style={[
            s.buttonText,
            { color: variant === "secondary" ? "#28243E" : "#FAF8F2" },
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Tap>
  );
}
export function Row({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  danger = false,
  dark = false,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
  dark?: boolean;
}) {
  return (
    <Tap onPress={onPress} accessibilityLabel={title} innerStyle={s.row}>
      {icon && <Icon name={icon} color={danger ? colors.red : colors.muted} />}
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: "500",
            color: danger ? colors.red : dark ? "white" : colors.ink,
          }}
        >
          {title}
        </Text>
        {subtitle && <Text style={space.small}>{subtitle}</Text>}
      </View>
      {trailing ||
        (onPress && <Icon name="chevron" size={14} color={colors.faint} />)}
    </Tap>
  );
}
export function Glyph({
  wallet,
  size = 34,
}: {
  wallet: Wallet;
  size?: number;
}) {
  if (wallet.icon.startsWith("pehra-"))
    return (
      <Image
        source={images[wallet.icon] || images["pehra-dozing"]}
        style={{ width: size, height: size }}
      />
    );
  return wallet.emoji ? (
    <Text style={{ fontSize: size - 2, lineHeight: size + 4 }}>
      {wallet.emoji}
    </Text>
  ) : (
    <Image
      source={
        wallet.icon.startsWith("file:")
          ? { uri: wallet.icon }
          : images[
              wallet.icon === "benji" ? "benji" : `glyph-${wallet.icon}`
            ] || images["glyph-family"]
      }
      style={{
        width: size,
        height: size,
        borderRadius: wallet.icon === "benji" ? size / 2 : 0,
        ...(!wallet.icon.startsWith("file:") && wallet.icon !== "benji"
          ? { tintColor: "white" }
          : {}),
      }}
    />
  );
}
export function WalletCard({
  wallet,
  onPress,
  onMenu,
  large = false,
  selected = false,
  children,
}: {
  wallet: Wallet;
  onPress?: () => void;
  onMenu?: () => void;
  large?: boolean;
  selected?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Tap
      onPress={onPress}
      onLongPress={onMenu}
      accessibilityLabel={wallet.name}
      innerStyle={[
        s.card,
        { backgroundColor: wallet.color },
        large && { height: 206, padding: 22, borderRadius: 26 },
      ]}
    >
      {selected && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            inset: -6,
            borderWidth: 2.5,
            borderColor: "#00b3ff",
            borderRadius: 26,
          }}
        />
      )}
      <View style={space.between}>
        <Glyph
          wallet={wallet}
          size={large ? 44 : wallet.icon === "benji" ? 40 : 32}
        />
        {onMenu && (
          <Tap
            accessibilityLabel={`${wallet.name} options`}
            onPress={onMenu}
            hitSlop={12}
            innerStyle={{
              width: 23,
              height: 23,
              borderRadius: 13,
              backgroundColor: "#ffffff26",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="more" color="white" size={12} />
          </Tap>
        )}
      </View>
      <View>
        <Text
          style={{
            color: "white",
            fontSize: large ? 25 : 16,
            fontWeight: "600",
          }}
        >
          {wallet.name}
        </Text>
        <Text
          style={{
            color: "#ffffff99",
            fontSize: large ? 16 : 14,
            marginTop: 3,
          }}
        >
          {wallet.balance}
        </Text>
      </View>
      {children}
    </Tap>
  );
}
export function TokenIcon({ id, size = 40 }: { id: string; size?: number }) {
  return (
    <Image
      source={images[id] || images.ethereum}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}
export function Check({
  checked,
  color = colors.blue,
}: {
  checked: boolean;
  color?: string;
}) {
  return (
    <View
      style={{
        width: 23,
        height: 23,
        borderRadius: 12,
        borderWidth: checked ? 0 : 2,
        borderColor: "#ddd",
        backgroundColor: checked ? color : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked && <Tick />}
    </View>
  );
}
export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#aaa"
      selectionColor={colors.blue}
      {...props}
      style={[s.input, props.style]}
    />
  );
}
export function MorphText({
  text,
  color = colors.ink,
  size = 24,
}: {
  text: string;
  color?: string;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const seen: Record<string, number> = {};
  return (
    <Animated.View
      accessibilityLabel={text}
      accessible
      style={{ flexDirection: "row", flexWrap: "wrap" }}
    >
      {Array.from(text).map((char) => {
        seen[char] = (seen[char] || 0) + 1;
        return (
          <Animated.Text
            key={char + seen[char]}
            layout={LinearTransition.springify()
              .damping(24)
              .stiffness(260)
              .reduceMotion(ReduceMotion.System)}
            entering={FadeIn.duration(reduced ? 0 : 150)}
            exiting={FadeOut.duration(reduced ? 0 : 100)}
            style={{
              color,
              fontSize: size,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
              letterSpacing: -0.6,
            }}
          >
            {char === " " ? "\u00a0" : char}
          </Animated.Text>
        );
      })}
    </Animated.View>
  );
}
export function DetailLine({
  label,
  value,
  onPress,
  dark = false,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  dark?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      innerStyle={{ ...space.between, paddingVertical: 15, gap: 12 }}
    >
      <Text style={{ fontSize: 16, color: colors.muted }}>{label}</Text>
      <View style={[space.row, { gap: 8, flexShrink: 1 }]}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "500",
            color: dark ? "white" : colors.ink,
            flexShrink: 1,
          }}
        >
          {value}
        </Text>
        {onPress && <Icon name="chevron" size={12} color={colors.muted} />}
      </View>
    </Tap>
  );
}
export function Keypad({
  onKey,
  dark = false,
}: {
  onKey: (key: string) => void;
  dark?: boolean;
}) {
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16 }}
    >
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map(
        (k) => (
          <Tap
            key={k}
            accessibilityLabel={k === "back" ? "Delete digit" : k}
            onPress={() => onKey(k)}
            style={{ width: "33.333%" }}
            innerStyle={{
              height: 65,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {k === "back" ? (
              <Icon name="back" color={dark ? "white" : colors.ink} />
            ) : (
              <Text
                style={{ fontSize: 28, color: dark ? "white" : colors.ink }}
              >
                {k}
              </Text>
            )}
          </Tap>
        ),
      )}
    </View>
  );
}
export function Tabs({ active }: { active: string }) {
  const a = useApp();
  return (
    <View style={s.tabs}>
      {[
        ["activity", "history", "activity"],
        ["leaders", "group", "traders"],
        ["portfolio", "wallet", "home"],
      ].map(([path, icon, label]) => {
        const on = active === path;
        return (
          <Tap key={path} onPress={() => a.go("/" + path)} accessibilityLabel={label} innerStyle={{ alignItems: "center", gap: 3, paddingHorizontal: 18, paddingTop: 6 }}>
            <TwoTone name={glyphFor[icon]} size={24} back={on ? "#C9A6FF" : "#E4E0EA"} front={on ? "#9E4DFD" : "#C9C4D1"} />
            <Text style={{ fontSize: 11, fontWeight: on ? "700" : "600", color: on ? "#9E4DFD" : "#C9C4D1" }}>{label}</Text>
          </Tap>
        );
      })}
    </View>
  );
}
export function PortfolioHeader() {
  const a = useApp();
  return (
    <View style={[space.between, { height: 64, paddingHorizontal: 20 }]}>
      <Tap onPress={() => a.go("/")} innerStyle={[space.row, { gap: 9 }]}>
        <View
          style={{
            backgroundColor: a.wallet.color,
            padding: 3,
            borderRadius: 13,
          }}
        >
          <Glyph wallet={a.wallet} size={28} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>{a.wallet.name}</Text>
      </Tap>
      <View style={space.row}>
        <IconButton
          name="more"
          label="Wallet menu"
          onPress={() => a.open("portfolioMenu", "Wallet Options")}
        />
        <IconButton name="chat" onPress={() => a.open("chat", "Messages")} />
        <IconButton
          name="scan"
          label="Receive"
          onPress={() => a.go("/receive")}
        />
      </View>
    </View>
  );
}
export const s = StyleSheet.create({
  header: {
    height: 58,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { fontSize: 20, fontWeight: "600", letterSpacing: -0.4 },
  button: {
    minHeight: 48,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { fontSize: 17, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 64 },
  card: {
    height: 112,
    borderRadius: 20,
    padding: 13,
    justifyContent: "space-between",
  },
  input: {
    height: 54,
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 17,
    color: "#151515",
  },
  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    height: 58,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
    backgroundColor: "#FAF8F2",
  },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, gap: 10 },
  overline: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: 0.5,
    marginTop: 32,
    marginBottom: 10,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
});

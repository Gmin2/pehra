import { useState } from "react";
import { View, Text, ScrollView, Image, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn } from "react-native-reanimated";
import {
  Screen,
  Header,
  IconButton,
  Button,
  Tap,
  Keypad,
  TokenIcon,
  Check,
  DetailLine,
  Icon,
  s,
} from "../src/ui/components";
import { useApp } from "../src/ui/store";
import { tokens } from "../src/ui/data";
import { images } from "../src/ui/assets";
import { enterDigit, formatAmount, maxSpend } from "../src/ui/model";
import { space, colors } from "../src/ui/theme";
export default function Transaction() {
  const a = useApp(),
    { tx } = a,
    [dollars, setDollars] = useState(true),
    confirm = tx.step === "confirm",
    swap = tx.kind === "swap",
    amount = Number(tx.amount),
    available = Number(tx.token.amount.replaceAll(",", "")),
    tooMuch =
      amount > (dollars && !swap ? available * tx.token.price : available);
  const next = () => {
    if (swap && !tx.approved) a.open("approvalIntro", "");
    else a.setTx((t) => ({ ...t, step: "confirm" }));
  };
  const useMax = () =>
    a.setTx((t) => ({ ...t, amount: maxSpend(t.token, dollars && !swap) }));
  const tokenPlate = (
    <View
      style={{
        backgroundColor: "#111",
        borderRadius: 22,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Tap
        accessibilityLabel="Choose token"
        onPress={() => a.open("tokenPicker", "Choose Token")}
        innerStyle={[space.row, { gap: 12 }]}
      >
        <TokenIcon id={tx.token.id} size={44} />
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: "white" }}>
            {tx.token.name}
          </Text>
          <Text style={{ fontSize: 14, color: "#666" }}>
            {tx.token.amount} {tx.token.symbol}
          </Text>
        </View>
      </Tap>
      <View style={{ flex: 1 }} />
      <Tap
        accessibilityLabel="Use Max"
        onPress={useMax}
        innerStyle={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          backgroundColor: "#1c1c1c",
          borderRadius: 17,
        }}
      >
        <Text style={{ color: "white", fontSize: 15, fontWeight: "500" }}>
          Use Max
        </Text>
      </Tap>
    </View>
  );
  if (tx.step === "submitting")
    return (
      <Screen dark background="#000">
        <StatusBar style="light" />
        <View style={[space.center, { flex: 1, gap: 24 }]}>
          <Animated.View
            entering={FadeIn.duration(180)}
            style={{ backgroundColor: "#222", padding: 26, borderRadius: 35 }}
          >
            <Icon name="send" color="white" size={44} />
          </Animated.View>
          <Text style={[space.title, { color: "white" }]}>
            Starting Your Transaction
          </Text>
          <Text style={space.copy}>Just a moment.</Text>
          <ActivityIndicator size="large" color="white" />
        </View>
      </Screen>
    );
  return (
    <Screen dark background="#000">
      <StatusBar style="light" />
      {confirm ? (
        <Header
          dark
          onLeft={() =>
            a.setTx((t) => ({
              ...t,
              step: tx.kind === "nft" ? "select" : "amount",
            }))
          }
          onRight={() => a.open("transactionHelp", "Your Transaction")}
        />
      ) : (
        <View style={[space.between, { paddingHorizontal: 24, height: 58 }]}>
          <Text style={{ fontSize: 26, fontWeight: "600", color: "white" }}>
            {swap ? "Swap" : "Send"}
          </Text>
          <IconButton
            name="close"
            label="Close transaction"
            color="white"
            onPress={a.back}
          />
        </View>
      )}
      <Animated.View
        key={tx.step}
        entering={FadeIn.duration(150)}
        style={{ flex: 1 }}
      >
        {confirm ? (
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 30 }}>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: swap ? "#222" : "#00b5ef",
                padding: 17,
                borderRadius: 25,
                marginBottom: 24,
              }}
            >
              {swap ? (
                <TokenIcon id={tx.token.id} size={35} />
              ) : (
                <Icon name="wallet" size={35} color="white" />
              )}
            </View>
            <Text
              style={{
                fontSize: 27,
                lineHeight: 34,
                fontWeight: "600",
                letterSpacing: -0.7,
                color: "white",
                marginBottom: 26,
              }}
            >
              {swap
                ? `Confirm swap of\n${tx.token.name} to ${tx.output.symbol}`
                : `Confirm transaction to\n${tx.recipient}`}
            </Text>
            {tx.kind === "nft" ? (
              <>
                <DetailLine
                  dark
                  label="Collectibles"
                  value={`${tx.nfts.length}× Family Portraits`}
                />
                <DetailLine dark label="Total Value" value="N/A" />
              </>
            ) : swap ? (
              <>
                <DetailLine
                  dark
                  label={`Swap ${tx.token.symbol}`}
                  value={formatAmount(tx.amount)}
                />
                <DetailLine
                  dark
                  label={`Receive ${tx.output.symbol}`}
                  value={(
                    ((amount * tx.token.price) / tx.output.price) *
                    0.9982
                  ).toFixed(6)}
                />
                <DetailLine dark label="Chain" value="Ethereum" />
              </>
            ) : (
              <>
                <DetailLine
                  dark
                  label="Total Value"
                  value={`$${(dollars ? amount : amount * tx.token.price).toFixed(2)}`}
                />
                <DetailLine
                  dark
                  label={`Send ${tx.token.symbol}`}
                  value={(dollars ? amount / tx.token.price : amount).toFixed(
                    8,
                  )}
                />
              </>
            )}
            <DetailLine dark label="From" value={a.wallet.name} />
            {swap && (
              <>
                <DetailLine dark label="Price Difference" value="−0.18%" />
                <DetailLine
                  dark
                  label="Swap Slippage"
                  value={`${tx.slippage}%`}
                  onPress={() => a.open("slippage", "Max Slippage")}
                />
              </>
            )}
            <DetailLine
              dark
              label="Fee Estimate"
              value="$3.24"
              onPress={() => a.open("fee", "Fee Estimate")}
            />
            <DetailLine
              dark
              label="Speed"
              value={tx.speed}
              onPress={() => a.open("speed", "Transaction Speed")}
            />
            {tx.kind === "nft" && (
              <DetailLine
                dark
                label="ENS Config"
                value="Options"
                onPress={() => a.open("ensOptions", "Transfer Options")}
              />
            )}
          </ScrollView>
        ) : (
          <>
            {!swap && (
              <Tap
                onPress={() => a.open("recipient", "Send to")}
                innerStyle={{
                  marginHorizontal: 24,
                  marginTop: 14,
                  paddingVertical: 9,
                  paddingHorizontal: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 9,
                  borderRadius: 20,
                  backgroundColor: "#111",
                }}
              >
                <Text
                  style={{ color: "#666", fontSize: 17, fontWeight: "500" }}
                >
                  To
                </Text>
                <View
                  style={{
                    backgroundColor: "#1c1c1c",
                    borderRadius: 20,
                    paddingHorizontal: 15,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    style={{ fontSize: 17, fontWeight: "600", color: "white" }}
                  >
                    {tx.recipient}
                  </Text>
                </View>
              </Tap>
            )}
            {tx.step === "select" ? (
              <ScrollView
                contentContainerStyle={{
                  paddingHorizontal: 24,
                  paddingTop: 20,
                }}
              >
                <View style={[space.row, { gap: 22, marginBottom: 22 }]}>
                  {["send", "nft"].map((k) => (
                    <Tap
                      key={k}
                      onPress={() =>
                        a.setTx((t) => ({ ...t, kind: k as "send" | "nft" }))
                      }
                    >
                      <Text
                        style={{
                          fontSize: 17,
                          fontWeight: "600",
                          color: tx.kind === k ? "white" : "#666",
                        }}
                      >
                        {k === "send" ? "Tokens" : "Collectibles"}
                      </Text>
                    </Tap>
                  ))}
                </View>
                {tx.kind === "nft" ? (
                  <>
                    <Text
                      style={{
                        fontWeight: "600",
                        marginBottom: 15,
                        color: "white",
                      }}
                    >
                      🌐 Family Portraits
                    </Text>
                    <View style={s.grid}>
                      {[0, 1].map((i) => (
                        <Tap
                          key={i}
                          accessibilityLabel={`Select portrait ${i + 1}`}
                          style={{ width: "47.6%" }}
                          onPress={() =>
                            a.setTx((t) => ({
                              ...t,
                              nfts: t.nfts.includes(i)
                                ? t.nfts.filter((n) => n !== i)
                                : [...t.nfts, i],
                            }))
                          }
                        >
                          <Image
                            source={images[`portrait-${i}`]}
                            style={{
                              width: "100%",
                              aspectRatio: 1,
                              borderRadius: 20,
                            }}
                          />
                          <View
                            style={{
                              position: "absolute",
                              right: 10,
                              bottom: 10,
                            }}
                          >
                            <Check checked={tx.nfts.includes(i)} />
                          </View>
                        </Tap>
                      ))}
                    </View>
                  </>
                ) : (
                  tokens.map((t) => (
                    <Tap
                      key={t.id}
                      onPress={() =>
                        a.setTx((tx) => ({ ...tx, token: t, step: "amount" }))
                      }
                      innerStyle={{
                        height: 73,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 13,
                      }}
                    >
                      <TokenIcon id={t.id} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text
                          style={{
                            fontSize: 17,
                            fontWeight: "600",
                            color: "white",
                          }}
                        >
                          {t.name}
                        </Text>
                        <Text style={{ fontSize: 14, color: "#666" }}>
                          {t.amount} {t.symbol}
                        </Text>
                      </View>
                    </Tap>
                  ))
                )}
              </ScrollView>
            ) : (
              <>
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    paddingHorizontal: 24,
                    minHeight: 180,
                    ...(swap
                      ? {
                          backgroundColor: "#111",
                          borderRadius: 25,
                          marginHorizontal: 24,
                          paddingHorizontal: 0,
                          marginTop: 14,
                        }
                      : {}),
                  }}
                >
                  {swap && tokenPlate}
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      alignItems: "center",
                      paddingVertical: 20,
                    }}
                  >
                    <Text
                      adjustsFontSizeToFit
                      numberOfLines={1}
                      style={{
                        fontSize: 76,
                        fontWeight: "600",
                        letterSpacing: -2,
                        color: tooMuch ? colors.red : "white",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {dollars && !swap ? "$" : ""}
                      {formatAmount(tx.amount)}
                    </Text>
                    <Tap
                      onPress={() => setDollars(!dollars)}
                      innerStyle={[space.row, { gap: 8, marginTop: 14 }]}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontSize: 17,
                          fontWeight: "500",
                        }}
                      >
                        {swap
                          ? `≈ $${(amount * tx.token.price).toFixed(2)}`
                          : dollars
                            ? `◈ ${(amount / tx.token.price).toFixed(8)} ⇵`
                            : `$${(amount * tx.token.price).toFixed(2)} ⇵`}
                      </Text>
                    </Tap>
                    {tooMuch && (
                      <Text
                        style={{
                          color: colors.red,
                          marginTop: 12,
                          fontSize: 12,
                        }}
                      >
                        {amount > 99999999
                          ? "Dream big. Start smaller."
                          : "Insufficient balance"}
                      </Text>
                    )}
                  </View>
                </View>
                {swap ? (
                  <Tap
                    onPress={() => a.open("outputToken", "Receive Token")}
                    innerStyle={{
                      marginHorizontal: 24,
                      marginTop: 14,
                      marginBottom: 15,
                      padding: 16,
                      borderRadius: 22,
                      backgroundColor: "#111",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <TokenIcon id={tx.output.id} size={44} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{
                          fontSize: 17,
                          fontWeight: "600",
                          color: "white",
                        }}
                      >
                        {tx.output.name}
                      </Text>
                      <Text style={{ color: "#666", fontSize: 14 }}>
                        Receive {tx.output.symbol}
                      </Text>
                    </View>
                    <Text style={{ color: "white", fontSize: 16 }}>
                      {(
                        ((amount * tx.token.price) / tx.output.price) *
                        0.9982
                      ).toFixed(4)}
                    </Text>
                  </Tap>
                ) : (
                  <View style={{ marginHorizontal: 24, marginBottom: 15 }}>
                    {tokenPlate}
                  </View>
                )}
                <Keypad
                  dark
                  onKey={(k) =>
                    a.setTx((t) => ({ ...t, amount: enterDigit(t.amount, k) }))
                  }
                />
              </>
            )}
          </>
        )}
      </Animated.View>
      {(tx.step !== "select" || tx.kind === "nft") && (
        <View style={s.footer}>
          <Button
            color="white"
            disabled={
              !confirm &&
              (tooMuch || (tx.kind === "nft" ? !tx.nfts.length : !amount))
            }
            onPress={confirm ? a.submit : next}
          >
            <Text style={{ color: "#000", fontSize: 19, fontWeight: "600" }}>
              {confirm
                ? "Confirm"
                : tx.kind === "nft"
                  ? `Continue with ${tx.nfts.length} Collectibles`
                  : "Continue"}
            </Text>
          </Button>
        </View>
      )}
    </Screen>
  );
}

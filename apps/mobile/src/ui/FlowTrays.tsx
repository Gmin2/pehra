import { useState } from "react";
import { View, Text, Share, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useApp } from "./store";
import {
  Button,
  Row,
  Input,
  Check,
  DetailLine,
  Glyph,
  Tap,
  Icon,
  TokenIcon,
  Keypad,
} from "./components";
import { colors, space } from "./theme";
import { tokens } from "./data";
import { enterDigit } from "./model";
export const flowTrayIDs = [
  "customize",
  "editWallet",
  "emoji",
  "watch",
  "feedback",
  "feedbackReview",
  "refuelChains",
  "refuelAmount",
  "refuelPreview",
  "approvalIntro",
  "approval",
  "slippage",
  "ensOptions",
  "recipient",
  "tokenPicker",
  "outputToken",
  "pending",
  "completed",
  "speedUp",
  "cancelTransaction",
  "share",
  "addressBook",
  "referenceInfo",
  "newGroup",
  "appIcon",
  "trash",
  "approvals",
];
const palette = [
  "#1a1a1a",
  "#ff2a39",
  "#ff9902",
  "#e7c600",
  "#00bc7c",
  "#00bec9",
  "#00b3ff",
  "#8052ff",
  "#cf61f4",
  "#ff66a8",
];
export default function FlowTrays({
  id,
  dark = false,
}: {
  id: string;
  dark?: boolean;
}) {
  const a = useApp(),
    [name, setName] = useState(a.wallet.name),
    [color, setColor] = useState(a.wallet.color),
    [emoji, setEmoji] = useState(a.wallet.emoji || ""),
    [icon, setIcon] = useState(a.wallet.icon),
    [selected, setSelected] = useState<string[]>(
      id === "refuelChains" ? a.refuel.chains : [],
    ),
    [input, setInput] = useState(""),
    [amount, setAmount] = useState(a.refuel.amount),
    [sent, setSent] = useState(false),
    [slippage, setSlippage] = useState(String(a.tx.slippage));
  const text = { ...space.copy, color: dark ? "#aaa" : colors.muted };
  const toggle = (s: string) => {
    setSelected((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]));
    Haptics.selectionAsync();
  };
  if (id === "customize" || id === "editWallet")
    return (
      <View style={{ gap: 20 }}>
        <View
          style={{
            backgroundColor: color,
            alignSelf: "center",
            padding: 21,
            borderRadius: 25,
          }}
        >
          <Glyph wallet={{ ...a.wallet, color, emoji, icon }} size={46} />
        </View>
        <Input
          accessibilityLabel="Wallet name"
          value={name}
          onChangeText={setName}
        />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
          }}
        >
          {palette.map((c) => (
            <Tap
              key={c}
              accessibilityLabel={`Color ${c}`}
              onPress={() => setColor(c)}
              innerStyle={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: c,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {c === color && <Icon name="check" color="white" size={21} />}
            </Tap>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {["🐻", "🛍️", "🍕", "🧡", "🌈", "🌴"].map((e) => (
            <Tap
              key={e}
              accessibilityLabel={`Use ${e}`}
              onPress={() => setEmoji(e)}
              innerStyle={{
                backgroundColor: emoji === e ? "#eee" : "#fafafa",
                borderRadius: 14,
                padding: 10,
              }}
            >
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </Tap>
          ))}
        </View>
        <Button
          onPress={() => {
            a.setWallets((ws) =>
              ws.map((w) =>
                w.id === a.wallet.id
                  ? { ...w, name: name.trim() || w.name, color, emoji, icon }
                  : w,
              ),
            );
            a.close();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }}
        >
          Save Changes
        </Button>
      </View>
    );
  if (id === "watch")
    return (
      <View style={{ gap: 20 }}>
        <Text style={text}>
          Follow any Ethereum address without importing its keys.
        </Text>
        <Input
          placeholder="Ethereum address or ENS name"
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
        />
        <Button
          disabled={!input.includes(".") && !/^0x[0-9a-fA-F]{40}$/.test(input)}
          onPress={() => {
            a.setWatching((ws) => (ws.includes(input) ? ws : [...ws, input]));
            a.toast(`Watching ${input}`);
            a.close();
          }}
        >
          Watch Wallet
        </Button>
      </View>
    );
  if (id === "feedback")
    return (
      <View style={{ gap: 18 }}>
        <Text style={text}>What would you like to share feedback about?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            "Design",
            "Wallets",
            "Transactions",
            "Collectibles",
            "Browser",
            "Something Else",
          ].map((s) => (
            <Tap
              key={s}
              onPress={() => toggle(s)}
              innerStyle={{
                backgroundColor: selected.includes(s) ? "#e4f7ff" : "#f4f4f4",
                borderRadius: 18,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontWeight: "500",
                  color: selected.includes(s) ? colors.blue : colors.ink,
                }}
              >
                {s}
              </Text>
            </Tap>
          ))}
        </View>
        <Input
          multiline
          placeholder="Tell us more…"
          value={input}
          onChangeText={setInput}
          style={{ height: 120, paddingTop: 15, textAlignVertical: "top" }}
        />
        <Button
          disabled={!input.trim()}
          onPress={() => a.open("feedbackReview", "Your Details")}
        >
          Continue
        </Button>
      </View>
    );
  if (id === "feedbackReview")
    return (
      <View style={{ gap: 16 }}>
        {sent ? (
          <>
            <Icon name="check" size={54} color={colors.green} />
            <Text style={space.title}>Thank you!</Text>
            <Text style={text}>Your feedback is saved in this preview.</Text>
            <Button onPress={a.dismiss}>Done</Button>
          </>
        ) : (
          <>
            <Input placeholder="Name" value={input} onChangeText={setInput} />
            <Input
              placeholder="Email (optional)"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Button
              onPress={() => {
                setSent(true);
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }}
            >
              Send Feedback
            </Button>
          </>
        )}
      </View>
    );
  if (id === "refuelChains")
    return (
      <View style={{ gap: 12 }}>
        <Text style={text}>
          Top up your gas balances across your favorite chains.
        </Text>
        {["Ethereum", "Optimism", "Arbitrum", "Base", "Polygon"].map(
          (chain, i) => (
            <Row
              key={chain}
              title={chain}
              icon={i === 4 ? "globe" : "rocket"}
              trailing={<Check checked={selected.includes(chain)} />}
              onPress={() => toggle(chain)}
            />
          ),
        )}
        <Button
          disabled={!selected.length}
          onPress={() => {
            a.setRefuel((r) => ({ ...r, chains: selected }));
            a.open("refuelAmount", "Refuel Gas");
          }}
        >{`Continue with ${selected.length} Chains`}</Button>
      </View>
    );
  if (id === "refuelAmount")
    return (
      <View style={{ gap: 18 }}>
        <Text style={[space.title, { textAlign: "center", fontSize: 54 }]}>
          ${amount}
        </Text>
        <Text style={[text, { textAlign: "center" }]}>Amount per chain</Text>
        <Keypad onKey={(k) => setAmount(enterDigit(amount, k))} />
        <Button
          disabled={!Number(amount)}
          onPress={() => {
            a.setRefuel((r) => ({ ...r, amount }));
            a.open("refuelPreview", "Refuel Gas");
          }}
        >
          Continue
        </Button>
      </View>
    );
  if (id === "refuelPreview")
    return (
      <View style={{ gap: 8 }}>
        <View style={{ alignItems: "center", gap: 14, marginBottom: 16 }}>
          <Icon name="rocket" color={colors.blue} size={55} />
          <Text style={space.title}>Ready to Refuel</Text>
          <Text style={text}>A little gas goes a long way.</Text>
        </View>
        <DetailLine
          label="Amount per Chain"
          value={`$${Number(a.refuel.amount).toFixed(2)}`}
        />
        <DetailLine
          label="Chains"
          value={a.refuel.chains.join(", ")}
          onPress={() => a.open("refuelChains", "Choose Chains")}
        />
        <DetailLine
          label="Fee Estimate"
          value="$0.16"
          onPress={() => a.open("fee", "Fee Estimate")}
        />
        <Button
          onPress={() => {
            a.dismiss();
            a.toast("Gas balances refueled");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }}
        >
          Refuel Gas
        </Button>
      </View>
    );
  if (id === "approvalIntro")
    return (
      <View style={{ gap: 20 }}>
        <View
          style={{
            alignSelf: "center",
            padding: 22,
            backgroundColor: "#f1e9ff",
            borderRadius: 24,
          }}
        >
          <Icon name="shield" size={42} color={colors.purple} />
        </View>
        <Text style={[space.title, { textAlign: "center" }]}>
          One quick approval
        </Text>
        <Text style={[text, { textAlign: "center" }]}>
          Before your first swap, give the exchange permission to use this
          token. You’re always in control.
        </Text>
        <Button color={colors.purple} onPress={() => a.open("approval", "")}>
          Continue
        </Button>
      </View>
    );
  if (id === "approval")
    return (
      <View style={{ gap: 18 }}>
        <TokenIcon id={a.tx.token.id} size={52} />
        <Text style={[space.title, dark && { color: "white" }]}>
          Approve {a.tx.token.symbol}
        </Text>
        <Text style={text}>
          Allow the exchange to use your {a.tx.token.name} for this swap.
        </Text>
        <DetailLine
          dark={dark}
          label="Spending Limit"
          value={`${a.tx.amount} ${a.tx.token.symbol}`}
        />
        <DetailLine
          dark={dark}
          label="Fee Estimate"
          value="$0.42"
          onPress={() => a.open("fee", "Fee Estimate")}
        />
        <Button
          color={colors.purple}
          onPress={() => {
            a.setTx((t) => ({ ...t, approved: true, step: "confirm" }));
            a.dismiss();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }}
        >
          Approve
        </Button>
        <Button variant="secondary" onPress={a.close}>
          Cancel
        </Button>
      </View>
    );
  if (id === "slippage")
    return (
      <View style={{ gap: 20 }}>
        <Text style={text}>
          Your swap will only complete if the price stays within this range.
        </Text>
        <View style={[space.row, { gap: 10 }]}>
          {[0.5, 1, 3].map((n) => (
            <Button
              key={n}
              style={{ flex: 1 }}
              variant={Number(slippage) === n ? "primary" : "secondary"}
              onPress={() => setSlippage(String(n))}
            >
              {n}%
            </Button>
          ))}
        </View>
        <Input
          keyboardType="decimal-pad"
          value={slippage}
          onChangeText={setSlippage}
          placeholder="Custom percentage"
        />
        <Button
          disabled={!Number(slippage) || Number(slippage) > 50}
          onPress={() => {
            a.setTx((t) => ({ ...t, slippage: Number(slippage) }));
            a.close();
          }}
        >
          Save
        </Button>
      </View>
    );
  if (id === "ensOptions")
    return (
      <View style={{ gap: 12 }}>
        <Text style={text}>
          Choose what happens when you transfer this ENS name.
        </Text>
        {["Transfer Registration", "Transfer Controller", "Clear Records"].map(
          (s) => (
            <Row
              key={s}
              dark={dark}
              title={s}
              trailing={<Check checked={a.tx.ens.includes(s)} />}
              onPress={() =>
                a.setTx((t) => ({
                  ...t,
                  ens: t.ens.includes(s)
                    ? t.ens.filter((x) => x !== s)
                    : [...t.ens, s],
                }))
              }
            />
          ),
        )}
        <Button onPress={a.close}>Done</Button>
      </View>
    );
  if (id === "recipient" || id === "addressBook")
    return (
      <View style={{ gap: 16 }}>
        <Input
          placeholder="Name, ENS, or address"
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
        />
        {["James", "Alex", "Benji", "vitalik.eth"]
          .filter((x) => x.toLowerCase().includes(input.toLowerCase()))
          .map((s) => (
            <Row
              key={s}
              icon="chat"
              title={s}
              subtitle={s.includes(".") ? s : s.toLowerCase() + ".eth"}
              onPress={() => {
                a.setTx((t) => ({ ...t, recipient: s }));
                a.close();
              }}
            />
          ))}
        {input && (
          <Button
            onPress={() => {
              a.setTx((t) => ({ ...t, recipient: input }));
              a.close();
            }}
          >
            Use {input}
          </Button>
        )}
      </View>
    );
  if (id === "tokenPicker" || id === "outputToken")
    return (
      <>
        {tokens.map((t) => (
          <Tap
            key={t.id}
            onPress={() => {
              a.setTx((tx) =>
                id === "outputToken"
                  ? { ...tx, output: t }
                  : { ...tx, token: t, approved: false },
              );
              a.close();
            }}
            innerStyle={[space.row, { gap: 14, paddingVertical: 13 }]}
          >
            <TokenIcon id={t.id} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "500",
                  color: dark ? "white" : colors.ink,
                }}
              >
                {t.name}
              </Text>
              <Text style={space.small}>{t.symbol}</Text>
            </View>
            <Text>${t.value}</Text>
          </Tap>
        ))}
      </>
    );
  if (id === "pending" || id === "completed")
    return (
      <View style={{ gap: 16 }}>
        <View style={space.between}>
          <View style={[space.row, { gap: 12 }]}>
            <TokenIcon id={a.tx.token.id} size={48} />
            <View>
              {id === "pending" ? (
                <ActivityIndicator color={colors.blue} />
              ) : (
                <Icon name="check" color={colors.green} />
              )}
            </View>
          </View>
          {id === "pending" && (
            <Tap onPress={() => a.open("speedUp", "Speed Up Transaction")}>
              <Text style={{ fontSize: 24, color: colors.muted }}>•••</Text>
            </Tap>
          )}
        </View>
        <Text style={space.title}>
          {id === "pending" ? "Sending" : "Sent"} to {a.tx.recipient}
        </Text>
        <DetailLine
          label="Amount"
          value={`$${Number(a.tx.amount).toFixed(2)}`}
        />
        <DetailLine
          label="Status"
          value={id === "pending" ? "Pending" : "Completed"}
        />
        <DetailLine label="Network" value="Ethereum" />
        {id === "pending" ? (
          <>
            <Button onPress={() => a.open("speedUp", "Speed Up Transaction")}>
              Speed Up
            </Button>
            <Button
              variant="secondary"
              onPress={() => a.open("cancelTransaction", "Cancel Transaction")}
            >
              Cancel Transaction
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync("0xDEMO_REFERENCE_TRANSACTION");
              a.toast("Transaction ID copied");
            }}
          >
            Copy Transaction ID
          </Button>
        )}
      </View>
    );
  if (id === "speedUp" || id === "cancelTransaction")
    return (
      <View style={{ gap: 18 }}>
        <Text style={text}>
          {id === "speedUp"
            ? "Increase the network fee to help your transaction confirm sooner."
            : "A cancellation replaces the pending transaction and also requires a network fee."}
        </Text>
        <DetailLine
          label="New Fee Estimate"
          value="$4.16"
          onPress={() => a.open("fee", "Fee Estimate")}
        />
        <Button
          variant={id === "cancelTransaction" ? "danger" : "primary"}
          onPress={() => {
            a.settlePending();
            a.dismiss();
            a.toast(
              id === "speedUp" ? "Transaction sped up" : "Transaction canceled",
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }}
        >
          {id === "speedUp" ? "Speed Up" : "Confirm Cancellation"}
        </Button>
      </View>
    );
  if (id === "share")
    return (
      <View style={{ gap: 18 }}>
        <Button onPress={() => Share.share({ message: "benjitaylor.eth" })}>
          Share Address
        </Button>
        <Button
          variant="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync("benjitaylor.eth");
            a.toast("Address copied");
            a.close();
          }}
        >
          Copy Address
        </Button>
      </View>
    );
  if (id === "referenceInfo")
    return (
      <View style={{ gap: 20 }}>
        <Text style={space.title}>Family Values</Text>
        <Text style={text}>
          A native interaction study of Benji Taylor’s Family Values article.
          All 53 original recordings are included offline.
        </Text>
        <Text style={text}>
          This prototype uses public example balances and simulated
          transactions. It does not create keys, move funds, or store backups in
          iCloud.
        </Text>
        <Text style={space.small}>Source: benji.org/family-values</Text>
        <Button variant="secondary" onPress={a.close}>
          Got it
        </Button>
      </View>
    );
  if (id === "newGroup")
    return (
      <View style={{ gap: 18 }}>
        <Text style={space.title}>A fresh group of wallets</Text>
        <Text style={text}>
          A new group has its own Secret Recovery Phrase. You’ll need to back it
          up separately.
        </Text>
        <Button
          onPress={() => {
            a.close();
            a.setOnboarding("name");
          }}
        >
          Create New Group
        </Button>
      </View>
    );
  if (id === "appIcon")
    return (
      <View style={{ gap: 22 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          {palette.slice(0, 8).map((c) => (
            <Tap
              key={c}
              onPress={() => {
                setColor(c);
                Haptics.selectionAsync();
              }}
              innerStyle={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: c,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Glyph
                wallet={{ ...a.wallet, icon: "family", emoji: "" }}
                size={36}
              />
              {c === color && (
                <View style={{ position: "absolute", right: -5, bottom: -5 }}>
                  <Check checked />
                </View>
              )}
            </Tap>
          ))}
        </View>
        <Button
          onPress={() => {
            a.toast("App icon preference saved");
            a.close();
          }}
        >
          Done
        </Button>
      </View>
    );
  return (
    <View style={{ gap: 18 }}>
      <Text style={text}>
        {id === "trash"
          ? "Collectibles you move to Trash are hidden from your wallet."
          : "No active token approvals for this wallet."}
      </Text>
      <Button variant="secondary" onPress={a.close}>
        Done
      </Button>
    </View>
  );
}

import FlowTrays, { flowTrayIDs } from "./FlowTrays";
import { useState } from "react";
import { View, Text, Switch } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useApp } from "./store";
import { Button, Row, Input, Check, DetailLine, Glyph } from "./components";
import { space, colors } from "./theme";
import { phrase } from "./data";
export default function TrayContent({
  id,
  dark = false,
}: {
  id: string;
  dark?: boolean;
}) {
  const a = useApp();
  const [name, setName] = useState(a.wallet.name),
    [enabled, setEnabled] = useState(true);
  const text = { ...space.copy, color: dark ? "#aaa" : colors.muted };
  if (flowTrayIDs.includes(id)) return <FlowTrays id={id} dark={dark} />;
  if (id === "new")
    return (
      <View>
        <Row
          icon="plus"
          title="Create New Wallet"
          subtitle="A fresh start for your next adventure"
          onPress={() => {
            a.setOnboarding("group");
            a.go("/onboarding");
          }}
        />
        <Row
          icon="key"
          title="Add Existing Wallet"
          subtitle="Bring your wallet to Family"
          onPress={() => {
            a.setOnboarding("existing");
            a.go("/onboarding");
          }}
        />
        <Row
          icon="eye"
          title="Watch a Wallet"
          onPress={() => a.open("watch", "Watch a Wallet")}
        />
      </View>
    );
  if (id === "options")
    return (
      <>
        <Row
          icon="key"
          title="Private Key"
          onPress={() => a.open("privateKey", "Private Key")}
        />
        <Row
          icon="shield"
          title="Secret Recovery Phrase"
          onPress={() => a.open("phrase", "Secret Recovery Phrase")}
        />
        <Row
          icon="trash"
          title="Remove Wallet"
          danger
          onPress={() => a.go("/remove")}
        />
      </>
    );
  if (id === "privateKey" || id === "phrase")
    return (
      <View style={{ gap: 20 }}>
        <Text style={text}>
          This is the public example from the reference. Keep your real wallet’s
          recovery details private.
        </Text>
        <View
          style={{ backgroundColor: "#f5f5f5", padding: 20, borderRadius: 20 }}
        >
          <Text style={{ fontSize: 17, lineHeight: 28 }}>
            {id === "phrase"
              ? phrase.map((w, i) => `${i + 1}. ${w}`).join("  ")
              : "0xDEMO · Public reference · Not a private key"}
          </Text>
        </View>
        <Button
          variant="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync(
              id === "phrase" ? phrase.join(" ") : "PUBLIC DEMO KEY",
            );
            a.toast("Copied");
          }}
        >
          Copy
        </Button>
      </View>
    );
  if (id === "portfolioMenu")
    return (
      <>
        <Row
          icon="wallet"
          title="Wallet Details"
          onPress={() => a.go("/wallet")}
        />
        <Row
          icon="hide"
          title={a.stealth ? "Show Balances" : "Hide Balances"}
          onPress={() => {
            a.setStealth(!a.stealth);
            a.close();
          }}
        />
        <Row
          icon="list"
          title="Reorder Tokens"
          onPress={() => {
            a.setReorder(true);
            a.go("/portfolio");
          }}
        />
        <Row
          icon="rocket"
          title="Refuel Gas"
          onPress={() => a.open("refuelChains", "Choose Chains")}
        />
      </>
    );
  if (id === "customize" || id === "editWallet")
    return (
      <View style={{ gap: 20 }}>
        <View
          style={{
            alignSelf: "center",
            padding: 24,
            borderRadius: 26,
            backgroundColor: a.wallet.color,
          }}
        >
          <Glyph wallet={a.wallet} size={50} />
        </View>
        <Input value={name} onChangeText={setName} placeholder="Wallet name" />
        <Button
          onPress={() => {
            a.setWallets((ws) =>
              ws.map((w) =>
                w.id === a.wallet.id
                  ? { ...w, name: name.trim() || w.name }
                  : w,
              ),
            );
            a.close();
          }}
        >
          Save Changes
        </Button>
      </View>
    );
  if (id === "advanced")
    return (
      <>
        <Row
          icon="rocket"
          title="Refuel Gas"
          onPress={() => a.open("refuelChains", "Choose Chains")}
        />
        <Row icon="grid" title="Dev screen" onPress={() => a.go("/dev")} />
      </>
    );
  if (id === "fee")
    return (
      <>
        <Text style={[text, { marginBottom: 20 }]}>
          Network fees pay the people who keep Ethereum running. Family never
          adds a fee.
        </Text>
        <DetailLine dark={dark} label="Estimated Fee" value="$3.24" />
        <DetailLine
          dark={dark}
          label="Price Range"
          value="$2.91 – $4.16"
          onPress={() => a.open("feeRange", "Price Range")}
        />
        <DetailLine
          dark={dark}
          label="Speed"
          value={a.tx.speed}
          onPress={() => a.open("speed", "Transaction Speed")}
        />
      </>
    );
  if (id === "feeRange")
    return (
      <>
        <Text style={text}>
          The exact fee depends on network activity. You’ll only pay for the gas
          your transaction uses.
        </Text>
        <DetailLine dark={dark} label="Minimum" value="$2.91" />
        <DetailLine dark={dark} label="Maximum" value="$4.16" />
      </>
    );
  if (id === "speed")
    return (
      <>
        {(["Normal", "Fast", "Urgent"] as const).map((speed, i) => (
          <Row
            key={speed}
            title={speed}
            subtitle={
              [
                "~30 seconds · $3.24",
                "~15 seconds · $3.91",
                "~5 seconds · $4.16",
              ][i]
            }
            dark={dark}
            trailing={<Check checked={a.tx.speed === speed} />}
            onPress={() => {
              a.setTx((t) => ({ ...t, speed }));
              a.close();
            }}
          />
        ))}
      </>
    );
  if (
    [
      "preferences",
      "notifications",
      "browserSettings",
      "chatSettings",
      "security",
    ].includes(id)
  )
    return (
      <>
        <Row
          icon="bell"
          title={
            id === "notifications"
              ? "Wallet Notifications"
              : id === "security"
                ? "Require Authentication"
                : "Enable " +
                  (id === "preferences" ? "Haptics" : "Notifications")
          }
          trailing={
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ true: colors.green }}
            />
          }
        />
        <Row
          icon="shield"
          title="Backup Your Wallet"
          onPress={() => {
            a.setOnboarding("backup");
            a.go("/onboarding");
          }}
        />
      </>
    );
  return (
    <View style={{ gap: 20 }}>
      <Text style={text}>
        {id === "education"
          ? "Your Family is a home for your wallets, preferences, and everything you need to explore Ethereum."
          : id === "help"
            ? "We’re here to help make Family better."
            : id === "connections"
              ? "You haven’t connected this wallet to any apps yet."
              : id === "chat"
                ? "Your conversations will appear here."
                : "Explore and manage your wallet in Family."}
      </Text>
      {id === "help" ? (
        <>
          <Row
            icon="chat"
            title="Share Feedback"
            onPress={() => a.open("feedback", "Share Feedback")}
          />
          <Row
            icon="help"
            title="Help & Support"
            onPress={() => a.open("education", "A little help")}
          />
        </>
      ) : (
        <Button variant="secondary" onPress={a.close}>
          Got it
        </Button>
      )}
    </View>
  );
}

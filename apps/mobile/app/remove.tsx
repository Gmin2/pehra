import { useState } from "react";
import { View, Text } from "react-native";
import { Screen, Header, WalletCard, Button, Icon, s } from "../src/ui/components";
import { useApp } from "../src/ui/store";
import { space, colors } from "../src/ui/theme";
export default function Remove() {
  const a = useApp(),
    [confirm, setConfirm] = useState(false);
  return (
    <Screen>
      <Header onLeft={() => (confirm ? setConfirm(false) : a.back())} />
      <View style={{ flex: 1, padding: 24, gap: 24 }}>
        <WalletCard wallet={a.wallet} large />
        <Icon name="warning" size={45} color={colors.red} />
        <Text style={space.title}>
          {confirm ? "Are you absolutely sure?" : "Remove Wallet"}
        </Text>
        <Text style={space.copy}>
          {confirm
            ? "You’ll need your Secret Recovery Phrase or Private Key to access this wallet again."
            : "Make sure you’ve backed up your wallet before removing it from Family."}
        </Text>
        <Button
          variant="secondary"
          onPress={() => {
            a.setOnboarding("backup");
            a.go("/onboarding");
          }}
        >
          Back Up Wallet
        </Button>
      </View>
      <View style={s.footer}>
        <Button
          variant="danger"
          onPress={() => {
            if (confirm) {
              a.setWallets((ws) => ws.filter((w) => w.id !== a.wallet.id));
              a.go("/");
              a.toast("Wallet removed");
            } else setConfirm(true);
          }}
        >
          {confirm ? "Remove Wallet" : "Continue"}
        </Button>
      </View>
    </Screen>
  );
}

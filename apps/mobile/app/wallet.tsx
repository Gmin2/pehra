import { View, Text, ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Screen, Header, WalletCard, Row, Tap } from "../src/ui/components";
import { useApp } from "../src/ui/store";
import { space, colors } from "../src/ui/theme";
export default function Wallet() {
  const a = useApp();
  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 25 }}>
        <WalletCard wallet={a.wallet} large>
          <View style={space.between}>
            <Tap
              onPress={async () => {
                await Clipboard.setStringAsync("benjitaylor.eth");
                a.toast("Address copied");
              }}
            >
              <Text style={{ color: "#fff9", fontSize: 12 }}>
                Copy Address ▢
              </Text>
            </Tap>
            <Tap onPress={() => a.open("customize", "Wallet Details")}>
              <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
                Customize
              </Text>
            </Tap>
          </View>
        </WalletCard>
        <View>
          {[
            ["grid", "Connections", "connections"],
            ["shield", "Backup", "backup"],
            ["shield", "Approvals", "approvals"],
            ["bell", "Notifications", "notifications"],
            ["trash", "Trash", "trash"],
            ["list", "Options", "options"],
          ].map(([icon, title, id]) => (
            <Row
              key={id}
              icon={icon}
              title={title}
              onPress={() =>
                id === "backup"
                  ? (a.setOnboarding("backup"), a.go("/onboarding"))
                  : a.open(id, title)
              }
            />
          ))}
        </View>
        <View style={{ alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 23 }}>🧡🌤️🟢</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            3 related wallets ⓘ
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

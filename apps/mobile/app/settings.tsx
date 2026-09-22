import { ScrollView, Text } from "react-native";
import { Screen, Header, Row, s } from "../src/ui/components";
import { useApp } from "../src/ui/store";
export default function Settings() {
  const a = useApp();
  return (
    <Screen>
      <Header title="Your Family" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 30 }}
      >
        {[
          ["chat", "Address Book", "addressBook"],
          ["filter", "Preferences", "preferences"],
          ["browser", "Browser Settings", "browserSettings"],
          ["chat", "Chat Settings", "chatSettings"],
          ["shield", "Backups & Security", "security"],
          ["bell", "Notifications", "notifications"],
          ["wallet", "App Icon", "appIcon"],
        ].map(([icon, title, id]) => (
          <Row
            key={id}
            icon={icon}
            title={title}
            onPress={() => a.open(id, title)}
          />
        ))}
        <Text style={s.overline}>MORE OPTIONS</Text>
        <Row
          icon="help"
          title="Help & Support"
          onPress={() => a.open("help", "How can we help?")}
        />
        <Row
          icon="settings"
          title="Advanced"
          onPress={() => a.open("advanced", "Advanced")}
        />
        <Text style={s.overline}>DEVELOPMENT</Text>
        <Row
          icon="grid"
          title="Dev screen"
          subtitle="the tracer bullets, t5 to t7"
          onPress={() => a.go("/dev")}
        />
      </ScrollView>
    </Screen>
  );
}

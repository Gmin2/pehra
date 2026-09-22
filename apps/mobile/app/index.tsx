import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { loadStored } from "../src/account";
import { isOnboarded } from "../src/keys";
import { useApp } from "../src/ui/store";
export default function Entry() {
  const a = useApp(),
    [known, setKnown] = useState<boolean | null>(null);
  useEffect(() => {
    Promise.all([loadStored(), isOnboarded()]).then(([st, done]) => {
      if (st) a.setStored(st);
      setKnown(!!st && done);
    });
  }, []);
  if (known === null)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator />
      </View>
    );
  return <Redirect href={known ? "/portfolio" : "/onboarding"} />;
}

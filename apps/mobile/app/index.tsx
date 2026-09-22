import { useEffect, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { loadStored } from "../src/account";
import { isOnboarded } from "../src/keys";
import { useApp } from "../src/ui/store";
import { Intro } from "../src/ui/Intro";

// the bird wakes up first: the full intro for someone new, only the wake for a returning user
export default function Entry() {
  const a = useApp(),
    { replay } = useLocalSearchParams<{ replay?: string }>(),
    [known, setKnown] = useState<boolean | null>(null),
    [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    Promise.all([loadStored(), isOnboarded()]).then(([st, done]) => {
      if (st) a.setStored(st);
      setKnown(!!st && done);
    });
  }, []);
  if (!introDone || known === null)
    return <Intro key={replay ?? "first"} short={known === true && !replay} onDone={() => setIntroDone(true)} />;
  if (replay) return <Intro key={replay + "again"} onDone={() => {}} />;
  return <Redirect href={known ? "/portfolio" : "/onboarding"} />;
}

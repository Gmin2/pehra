// pushes, wherever the app is: the channels and the lock screen button are set up on start, the token is
// sent again, and a tapped push opens its position. "add 5 ausd" adds the margin first and says how far
// from liquidation it is now. close is never a push button
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useApp } from "./store";
import { setupPush, refreshPush, onPushResponse, launchedFromPush, addFromPush } from "../push";
import { log } from "../log";
import { readAlerts } from "../alerts";

export function PushBridge() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null,
    handled = useRef(new Set<string>());
  useEffect(() => { setupPush().catch((e) => log(`push setup failed: ${e instanceof Error ? e.message : e}`)); }, []);
  useEffect(() => { if (address) refreshPush(address).catch((e) => log(`push register failed: ${e instanceof Error ? e.message : e}`)); }, [address]);
  useEffect(() => {
    if (!address) return;
    const respond = async (action: string, data: Record<string, string>, id: string) => {
      if (handled.current.has(id)) return;
      handled.current.add(id);
      const pid = Number(data.pid);
      log(`push ${action} ${data.kind ?? ""} ${pid || ""}`);
      if (action === "add5" && pid) {
        const r = await addFromPush(address, pid, 5).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e), health: undefined }));
        a.toast(r.health ? `added 5 ausd, now ${(r.health.distance * 100).toFixed(1)}% from liquidation` : `couldn’t add the margin: ${r.error ?? "no answer"}`);
      }
      a.go(pid ? `/position?pid=${pid}` : "/activity");
    };
    launchedFromPush().then((r) => r && respond(r.action, r.data, r.id)).catch(() => {});
    return onPushResponse((action, data, id) => void respond(action, data, id));
  }, [address]);
  // android hands a push that lands while the app is open to expo, which drops it on this build. so while
  // the app is in front it reads what the server just sent and shows it, the same words as the push
  const seen = useRef(0);
  useEffect(() => {
    if (!address) return;
    let alive = true;
    const tick = async () => {
      if (AppState.currentState !== "active") return;
      try {
        const { recent } = await readAlerts(address);
        const fresh = recent.filter((r) => !r.held && r.at > seen.current);
        if (seen.current && fresh.length) { a.toast(`${fresh[0].title}. ${fresh[0].body}`, 6000); log(`alert shown in app: ${fresh[0].title}`); }
        if (alive && recent.length) seen.current = Math.max(seen.current, ...recent.map((r) => r.at));
        else if (!seen.current) seen.current = Date.now();
      } catch {}
    };
    void tick();
    const t = setInterval(tick, 4000);
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") { seen.current = Math.max(seen.current, Date.now() - 1000); } });
    return () => { alive = false; clearInterval(t); sub.remove(); };
  }, [address]);
  return null;
}

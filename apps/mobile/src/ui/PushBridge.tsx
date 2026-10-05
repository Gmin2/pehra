// pushes, wherever the app is: the channels and the lock screen button are set up on start, the token is
// sent again, and a tapped push opens its position. "add 5 ausd" adds the margin first and says how far
// from liquidation it is now. close is never a push button
import { useEffect, useRef } from "react";
import { useApp } from "./store";
import { setupPush, refreshPush, onPushResponse, launchedFromPush, addFromPush } from "../push";
import { log } from "../log";

export function PushBridge() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null,
    handled = useRef(new Set<string>());
  useEffect(() => { setupPush().catch((e) => log(`push setup failed: ${e instanceof Error ? e.message : e}`)); }, []);
  useEffect(() => { if (address) refreshPush(address).catch(() => {}); }, [address]);
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
  return null;
}

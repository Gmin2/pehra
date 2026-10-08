import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { router, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { initialWallets, tokens, type Wallet, type Token } from "./data";
import { loadStored, type Session, type StoredAccount } from "../account";
import {
  flowScene,
  initialTransaction,
  type Transaction,
  type Sheet,
} from "./model";
export type Refuel = { chains: string[]; amount: string };
type State = {
  session: Session | null;
  setSession: Dispatch<SetStateAction<Session | null>>;
  stored: StoredAccount | null;
  setStored: Dispatch<SetStateAction<StoredAccount | null>>;
  account: Wallet;
  watching: string[];
  setWatching: Dispatch<SetStateAction<string[]>>;
  refuel: Refuel;
  setRefuel: Dispatch<SetStateAction<Refuel>>;
  wallets: Wallet[];
  setWallets: Dispatch<SetStateAction<Wallet[]>>;
  wallet: Wallet;
  selectWallet: (w: Wallet) => void;
  token: Token;
  setToken: Dispatch<SetStateAction<Token>>;
  tx: Transaction;
  setTx: Dispatch<SetStateAction<Transaction>>;
  sheets: Sheet[];
  open: (id: string, title?: string) => void;
  close: () => void;
  dismiss: () => void;
  go: (path: string) => void;
  back: () => void;
  toast: (s: string, ms?: number) => void;
  notice: string;
  pending: boolean;
  setPending: Dispatch<SetStateAction<boolean>>;
  stealth: boolean;
  setStealth: Dispatch<SetStateAction<boolean>>;
  onboarding: string;
  setOnboarding: Dispatch<SetStateAction<string>>;
  showBalance: boolean;
  setShowBalance: Dispatch<SetStateAction<boolean>>;
  tab: string;
  setTab: Dispatch<SetStateAction<string>>;
  reorder: boolean;
  setReorder: Dispatch<SetStateAction<boolean>>;
  launch: (s: string) => void;
  submit: () => void;
  settlePending: () => void;
};
const Context = createContext<State | null>(null);
export function Provider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [stored, setStored] = useState<StoredAccount | null>(null),
    [watching, setWatching] = useState<string[]>([]),
    [refuel, setRefuel] = useState<Refuel>({
      chains: ["Optimism", "Arbitrum", "Polygon"],
      amount: "10",
    }),
    [wallets, setWallets] = useState(initialWallets),
    [walletID, setWalletID] = useState("benji"),
    [token, setToken] = useState(tokens[4]),
    [tx, setTx] = useState(initialTransaction),
    [sheets, setSheets] = useState<Sheet[]>([]),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false),
    [stealth, setStealth] = useState(false),
    [onboarding, setOnboarding] = useState("group"),
    [showBalance, setShowBalance] = useState(false),
    [tab, setTab] = useState("tokens"),
    [reorder, setReorder] = useState(false),
    [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    loadStored().then(setStored).catch(() => {});
  }, []);
  useEffect(() => {
    AsyncStorage.getItem("family-native-wallets-v1")
      .then((raw) => {
        if (raw) {
          try {
            const ws = JSON.parse(raw);
            if (
              Array.isArray(ws) &&
              ws.every(
                (w) => typeof w.id === "string" && typeof w.name === "string",
              )
            )
              setWallets(ws);
          } catch {}
        }
      })
      .finally(() => setLoaded(true));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);
  useEffect(() => {
    if (loaded)
      AsyncStorage.setItem(
        "family-native-wallets-v1",
        JSON.stringify(wallets),
      ).catch(() => {});
  }, [wallets, loaded]);
  const dismiss = () => setSheets([]),
    go = (path: string) => {
      dismiss();
      router.push(path as Href);
    },
    back = () => {
      if (router.canGoBack()) router.back();
      else router.replace("/");
    },
    toast = (s: string, ms = 2400) => {
      setNotice(s);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setNotice(""), ms);
    };
  const launch = (scene: string) => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    const f = flowScene(scene);
    setWalletID(f.wallet.id);
    setToken(f.token);
    setTx(f.tx);
    setPending(f.pending);
    setShowBalance(f.balance);
    setStealth(false);
    setOnboarding(f.step);
    setTab(f.tab);
    setReorder(f.reorder);
    setSheets(f.sheet ? [f.sheet] : []);
    router.replace(f.route as Href);
  };
  const submit = () => {
    setTx((t) => ({ ...t, step: "submitting" }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      setPending(true);
      go("/activity");
      pendingTimer.current = setTimeout(() => {
        setPending(false);
        toast("Transaction complete");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 6500);
    }, 900);
  };
  return (
    <Context.Provider
      value={{
        session,
        setSession,
        stored,
        setStored,
        account: pehraAccount(stored?.address ?? session?.address ?? null),
        watching,
        setWatching,
        refuel,
        setRefuel,
        wallets,
        setWallets,
        wallet: wallets.find((w) => w.id === walletID) || initialWallets[1],
        selectWallet: (w) => setWalletID(w.id),
        token,
        setToken,
        tx,
        setTx,
        sheets,
        open: (id, title = "") => setSheets((s) => [...s, { id, title }]),
        close: () => setSheets((s) => s.slice(0, -1)),
        dismiss,
        go,
        back,
        toast,
        notice,
        pending,
        setPending,
        stealth,
        setStealth,
        onboarding,
        setOnboarding,
        showBalance,
        setShowBalance,
        tab,
        setTab,
        reorder,
        setReorder,
        launch,
        submit,
        settlePending: () => {
          if (pendingTimer.current) clearTimeout(pendingTimer.current);
          setPending(false);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
// the one account pehra shows, drawn with family's wallet card
export function pehraAccount(address: string | null): Wallet {
  return {
    id: "pehra",
    name: "pehra",
    balance: address ? address.slice(0, 6) + "···" + address.slice(-4) : "no account yet",
    color: "#9E4DFD",
    icon: "pehra-dozing-two-tone",
  };
}
export function useApp() {
  const a = useContext(Context);
  if (!a) throw Error("Missing Family provider");
  return a;
}

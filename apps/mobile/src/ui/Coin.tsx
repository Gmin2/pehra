// market coins with their real logos: btc, eth, sol and zec from cryptocurrency-icons, mon, ausd
// and usdc from monad's token list, pump and near from trust wallet's assets, lit from lighter's own app icon
import { Image, type ImageSourcePropType } from "react-native";

export const coinImages: Record<string, ImageSourcePropType> = {
  BTC: require("./assets/coins/btc.png"),
  ETH: require("./assets/coins/eth.png"),
  SOL: require("./assets/coins/sol.png"),
  ZEC: require("./assets/coins/zec.png"),
  MON: require("./assets/coins/mon.png"),
  AUSD: require("./assets/coins/ausd.png"),
  USDC: require("./assets/coins/usdc.png"),
  LIT: require("./assets/coins/lit.png"),
  PUMP: require("./assets/coins/pump.png"),
  NEAR: require("./assets/coins/near.png"),
};

export function Coin({ symbol, size = 40 }: { symbol: string; size?: number }) {
  return <Image source={coinImages[symbol] ?? coinImages.MON} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

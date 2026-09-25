import SplitFeature from "./SplitFeature";
import Phone from "./Phone";
import Mark from "./Mark";
import IllustrationPreview from "../art/IllustrationPreview";

// Keep the recorded mobile demos alongside the vector explanations.
function PhonePanel({ video, focus }: { video: string; focus: number }) {
  const w = 300,
    h = w * 2.16,
    win = 440;
  const top = Math.min(0, Math.max(win - h, win / 2 - focus * h));
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(160deg,#E9F0FF,#F4F7FE_65%)]" style={{ height: win }}>
      <div className="absolute left-1/2 -translate-x-1/2" style={{ top, width: w }}>
        <Phone name={video} />
      </div>
    </div>
  );
}

export default function Splits() {
  return (
    <>
      <SplitFeature
        id="guard"
        eyebrow="the guard"
        color="#9E4DFD"
        title={
          <>
            most liquidations happen while you are{" "}
            <Mark type="circle" color="#9E4DFD" padding={[2, 8]} strokeWidth={2}>
              away.
            </Mark>
          </>
        }
        body="when a position runs out of margin, perpl closes it for you, and it rarely waits for you to wake up. the guard watches the distance to liquidation on every position and adds margin before it gets there."
        extra={<IllustrationPreview kind="guard" />}
        visual={<PhonePanel video="guard" focus={0.72} />}
      />

      <SplitFeature
        id="watch-key"
        eyebrow="the watch key"
        color="#23765A"
        title={
          <>
            it can add margin at 3am.
            <br />
            it{" "}
            <Mark type="underline" color="#B4474D" strokeWidth={3} padding={3}>
              cant withdraw.
            </Mark>
          </>
        }
        body="your passkey signs one perpl delegation. the guard gets a trading key that can add margin and trade, and cannot withdraw. that limit is enforced by perpl, not by our promise: perpl api keys can never withdraw, at any scope."
        visual={
          <div className="mx-auto max-w-[460px]">
            <IllustrationPreview kind="key" />
          </div>
        }
        reverse
      />

      <SplitFeature
        id="positions"
        eyebrow="positions"
        color="#28243E"
        title={
          <>
            your position,
            <br />
            in{" "}
            <Mark type="highlight" color="#EFE5FF">
              plain words.
            </Mark>
          </>
        }
        body="not a wall of numbers. how far you are from liquidation, what the guard did this morning, and what you made. add margin, set a stop, or hold to close."
        visual={<PhonePanel video="position" focus={0.3} />}
      />

      <SplitFeature
        id="honest"
        eyebrow="honest"
        color="#8A601B"
        title={
          <>
            it keeps watch.
            <br />
            it is{" "}
            <Mark type="box" color="#8A601B" padding={[0, 6]} strokeWidth={2}>
              not magic.
            </Mark>
          </>
        }
        body="nobody can promise you will never be liquidated, and we wont. here is exactly where the guard stops, so you know what you are trusting."
        visual={
          <div className="mx-auto max-w-[460px]">
            <IllustrationPreview kind="trust" />
          </div>
        }
        reverse
      />
    </>
  );
}

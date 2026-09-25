import { useEffect, useRef } from "react";
import { useInView } from "framer-motion";

// a real screen recording from the emulator (demo mode status bar, dev tools hidden) inside a
// drawn android phone: metal rim, black bezel, punch hole camera, side keys.
// plays only while on screen. loops unless onEnded is passed (the rows hand off phone to phone).
export default function Phone({
  name,
  playing = true,
  onEnded,
  onProgress,
  className = "",
  shadow = true,
  light = false,
}: {
  name: string;
  playing?: boolean;
  onEnded?: () => void;
  onProgress?: (p: number) => void;
  className?: string;
  shadow?: boolean;
  light?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const play = inView && playing;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (play) v.play().catch(() => {});
    else v.pause();
  }, [play, name]);

  const rim = light
    ? "bg-[linear-gradient(145deg,#FBFBFC_0%,#C7C7CE_22%,#EEEEF1_48%,#A9A9B2_74%,#E6E6EA_100%)]"
    : "bg-[linear-gradient(145deg,#3A3746,#16141D_40%,#2B2835_70%,#111016)]";
  const key = light ? "bg-[linear-gradient(90deg,#B4B4BC,#DADADF)]" : "bg-[#24212d]";

  return (
    <div
      ref={ref}
      className={`pointer-events-none relative mx-auto select-none rounded-[13.5%/6.2%] ${rim} p-[1.3%] ${
        shadow ? "shadow-[0_50px_90px_-35px_rgba(40,36,62,0.5),0_18px_30px_-18px_rgba(40,36,62,0.35)]" : ""
      } ${className}`}
    >
      <span className={`absolute top-[17%] -right-[1.3%] h-[7%] w-[1.5%] rounded-r-[3px] ${key}`} />
      <span className={`absolute top-[27%] -right-[1.3%] h-[12%] w-[1.5%] rounded-r-[3px] ${key}`} />
      <div className="rounded-[12.6%/5.8%] bg-[#0b0b0f] p-[2.2%] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="relative aspect-[540/1212] overflow-hidden rounded-[10.8%/4.9%] bg-paper">
          <video
            key={name}
            ref={video}
            src={`/videos/${name}.mp4`}
            poster={`/videos/${name}.jpg`}
            muted
            playsInline
            preload="metadata"
            loop={!onEnded}
            onEnded={onEnded}
            onTimeUpdate={onProgress ? (e) => onProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1)) : undefined}
            className="absolute inset-0 block h-full w-full object-cover"
          />
          <span className="absolute top-[1.35%] left-1/2 aspect-square w-[3.4%] -translate-x-1/2 rounded-full bg-[#0b0b0f] shadow-[inset_0_0_0_1.5px_#26242e]" />
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.14),transparent_28%)]" />
        </div>
      </div>
    </div>
  );
}

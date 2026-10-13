import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "./Icons";
import { EXPO } from "./motion";
import { APK_URL } from "../links";

// the app runs at a real phone size inside a drawn phone, scaled down to fit short screens
const W = 390;
const H = 844;

export default function TryModal({ open, onClose, url }: { open: boolean; onClose: () => void; url: string }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!open) return;
    const fit = () => setScale(Math.min(1, (window.innerHeight - 48) / (H + 28)));
    fit();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("resize", fit);
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", key);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center gap-12 bg-[#141220]/85 p-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 10 }}
            transition={{ duration: 0.5, ease: EXPO }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: (W + 28) * scale, height: (H + 28) * scale }}
            className="relative shrink-0"
          >
            <div
              style={{ width: W + 28, height: H + 28, transform: `scale(${scale})`, transformOrigin: "top left" }}
              className="rounded-[56px] bg-[linear-gradient(145deg,#FBFBFC_0%,#C7C7CE_22%,#EEEEF1_48%,#A9A9B2_74%,#E6E6EA_100%)] p-[6px] shadow-[0_50px_90px_-35px_rgba(0,0,0,0.6)]"
            >
              <div className="relative h-full w-full rounded-[50px] bg-[#0b0b0f] p-[8px]">
                <iframe
                  src={url}
                  title="pehra, running in your browser"
                  allow="clipboard-write"
                  style={{ width: W, height: H }}
                  className="block overflow-hidden rounded-[42px] bg-[#9E4DFD]"
                />
                <div className="pointer-events-none absolute top-[17px] left-1/2 h-[12px] w-[12px] -translate-x-1/2 rounded-full bg-[#0b0b0f] ring-[1.5px] ring-[#1d1d26]" />
              </div>
              <div className="absolute top-[150px] -right-[3px] h-[64px] w-[4px] rounded-r-[3px] bg-[#B9B9C1]" />
              <div className="absolute top-[236px] -right-[3px] h-[104px] w-[4px] rounded-r-[3px] bg-[#B9B9C1]" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: EXPO, delay: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="hidden max-w-[300px] text-white lg:block"
          >
            <div className="text-[15px] font-bold text-[#C9A2FF]">running in your browser</div>
            <h3 className="mt-2 text-[30px] leading-[1.1] font-[650] tracking-[-0.03em]">the real app, on a real account.</h3>
            <p className="mt-4 text-[15px] leading-[23px] text-white/75">
              the same code as the android app, reading a live pehra account on monad testnet. trade, copy a trader, arm a recipe, add money. it all plays out on your own copy of the account,
              with live prices, so nothing here reaches perpl.
            </p>
            <a href={APK_URL} className="mt-6 inline-flex items-center gap-2 rounded-full bg-paper px-5 py-3 text-[15px] font-semibold text-ink hover:bg-white">
              get the android app
            </a>
          </motion.div>

          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="absolute top-5 right-5 flex h-10 w-10 rotate-45 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
          >
            <Plus size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

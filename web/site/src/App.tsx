import { useState } from "react";
import Hero from "./components/Hero";
import Pillars from "./components/Pillars";
import { SocialRow, StartRow } from "./components/Rows";
import Splits, { SocialSplits } from "./components/Splits";
import Proof from "./components/Proof";
import FAQ from "./components/FAQ";
import { CTA, Footer } from "./components/Closing";
import VideoModal from "./components/VideoModal";
import TryModal from "./components/TryModal";
import { TRY_URL } from "./links";

function Divider() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 md:px-6">
      <hr className="border-t border-line" />
    </div>
  );
}

export default function App() {
  const [video, setVideo] = useState(false);
  const watch = () => setVideo(true);
  const [trying, setTrying] = useState(false);
  // on a phone the app opens full screen, on a bigger screen inside a drawn phone
  const tryIt = () => (window.innerWidth < 640 ? window.open(TRY_URL, "_blank") : setTrying(true));

  return (
    <div className="min-h-screen">
      <main>
        <Hero onWatch={watch} onTry={tryIt} />
        <Pillars />
        <SocialRow />
        <SocialSplits />
        <Splits />
        <Proof />
        <StartRow />
        <Divider />
        <FAQ />
        <CTA onWatch={watch} onTry={tryIt} />
      </main>
      <Footer />
      <VideoModal open={video} onClose={() => setVideo(false)} />
      <TryModal open={trying} onClose={() => setTrying(false)} url={TRY_URL} />
    </div>
  );
}

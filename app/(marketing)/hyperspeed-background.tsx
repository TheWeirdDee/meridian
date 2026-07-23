"use client";

import Hyperspeed from "../../components/Hyperspeed";
import { hyperspeedPresets } from "../../components/HyperSpeedPresets";

// Emerald/teal instead of the preset's default purple-pink-cyan combo —
// stays on the site's single accent hue rather than the generic look.
const emeraldOptions = {
  ...hyperspeedPresets.one,
  colors: {
    ...hyperspeedPresets.one.colors,
    roadColor: 0x030806,
    islandColor: 0x03110a,
    background: 0x000000,
    shoulderLines: 0x0f3a2a,
    brokenLines: 0x0f3a2a,
    leftCars: [0x10b981, 0x059669, 0x34d399],
    rightCars: [0x2dd4bf, 0x14b8a6, 0x0d9488],
    sticks: 0x10b981,
  },
};

export function HyperspeedBackground() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-black">
      <Hyperspeed effectOptions={emeraldOptions} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.55)_45%,#000_100%)]" />
    </div>
  );
}

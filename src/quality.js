// Quality tiers. `high` is tuned for an RTX 4060 at 1080p60; `low` is for phones.
export const TIERS = {
  high: {
    name: 'high', maxPixels: 2560 * 1440, maxDpr: 1.5, samples: 4, shadow: 4096, shadowRange: 88, bloom: true,
    grass: [
      { n: 330, size: 26, blades: 6, seg: 3, radius: 0.095, width: 0.0062, height: 0.62 },
      { n: 260, size: 66, blades: 4, seg: 3, radius: 0.17, width: 0.015, height: 0.64 },
      { n: 250, size: 170, blades: 4, seg: 2, radius: 0.36, width: 0.036, height: 0.68 },
    ],
    flowerN: 110, flowerSize: 44, plumeN: 150, plumeSize: 38, farflies: 1150, trees: 1.0, fireflyLights: 8,
  },
  medium: {
    name: 'medium', maxPixels: 1920 * 1080, maxDpr: 1.25, samples: 4, shadow: 2048, shadowRange: 70, bloom: true,
    grass: [
      { n: 240, size: 24, blades: 6, seg: 3, radius: 0.095, width: 0.0072, height: 0.62 },
      { n: 190, size: 62, blades: 3, seg: 2, radius: 0.17, width: 0.024, height: 0.64 },
      { n: 170, size: 160, blades: 3, seg: 2, radius: 0.36, width: 0.056, height: 0.68 },
    ],
    flowerN: 90, flowerSize: 40, plumeN: 120, plumeSize: 34, farflies: 820, trees: 0.75, fireflyLights: 6,
  },
  low: {
    name: 'low', maxPixels: 1280 * 720, maxDpr: 2, samples: 1, shadow: 1024, shadowRange: 46, bloom: true,
    grass: [
      { n: 165, size: 20, blades: 6, seg: 3, radius: 0.10, width: 0.0095, height: 0.62 },
      { n: 130, size: 56, blades: 3, seg: 2, radius: 0.19, width: 0.03, height: 0.64 },
      { n: 110, size: 150, blades: 3, seg: 1, radius: 0.40, width: 0.07, height: 0.68 },
    ],
    flowerN: 60, flowerSize: 34, plumeN: 84, plumeSize: 28, farflies: 480, trees: 0.5, fireflyLights: 4,
  },
};

export function pickTier(params) {
  const forced = params.get('q');
  if (forced && TIERS[forced]) return TIERS[forced];
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  const small = Math.min(screen.width, screen.height) < 820;
  if (touch && small) return TIERS.low;
  if (touch) return TIERS.medium;
  if ((navigator.hardwareConcurrency || 4) <= 4) return TIERS.medium;
  return TIERS.high;
}

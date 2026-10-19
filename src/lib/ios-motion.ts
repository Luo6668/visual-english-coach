export const IOS_MOTION = {
  instant: { duration: 120 },
  micro: { duration: 210 },
  springs: {
    press: { damping: 24, stiffness: 420, mass: 0.42 },
    hover: { damping: 25, stiffness: 300, mass: 0.62 },
    cardReturn: { damping: 25, stiffness: 270, mass: 0.78 },
    cardCommit: { damping: 24, stiffness: 205, mass: 0.8 },
    cardPromote: { damping: 24, stiffness: 190, mass: 0.86 },
    flip: { damping: 23, stiffness: 245, mass: 0.76 },
    navigation: { damping: 25, stiffness: 235, mass: 0.76 },
    spatial: { damping: 28, stiffness: 235, mass: 0.82 },
  },
} as const;

export function resistedOffset(value: number, softLimit: number, resistance = 0.24) {
  'worklet';
  const magnitude = Math.abs(value);
  if (magnitude <= softLimit) return value;
  const extra = magnitude - softLimit;
  const resistedExtra = (1 - Math.exp(-extra / Math.max(softLimit, 1))) * softLimit * resistance;
  return Math.sign(value) * (softLimit + resistedExtra);
}


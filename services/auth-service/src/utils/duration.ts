const units: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
};

export const durationToMilliseconds = (value: string): number => {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Unsupported duration: ${value}`);
  return Number(match[1]) * units[match[2]];
};


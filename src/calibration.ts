export function sensitivity(noise: number, stringLevel: number) {
  const floor = Math.max(0.00001, noise);
  if (!Number.isFinite(stringLevel) || stringLevel < floor * 3) return null;
  return {
    detection: Math.max(0.00005, floor * 2.5, stringLevel * 0.1),
    silence: Math.max(0.00003, floor * 1.8, stringLevel * 0.06),
    reference: stringLevel,
  };
}

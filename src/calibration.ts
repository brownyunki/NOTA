export function sensitivity(noise: number, stringLevel: number, trebleLevel = stringLevel) {
  const floor = Math.max(0.00001, noise);
  if (![stringLevel, trebleLevel].every(level => Number.isFinite(level) && level >= floor * 3)) return null;
  const quietString = Math.min(stringLevel, trebleLevel);
  return {
    detection: Math.max(0.00005, floor * 2.5, quietString * 0.025),
    silence: Math.max(0.00003, floor * 1.8, quietString * 0.015),
    reference: quietString,
    noise: floor,
  };
}

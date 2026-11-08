import { CREDIT, CAMPAIGN_TURNS } from './types.js';

/** Render yoctoNEAR as credits with exactly 3 decimals. */
export function formatCredits(yocto: bigint): string {
  const credits = yocto / CREDIT;
  const rem = yocto % CREDIT;
  if (rem !== 0n) {
    // Display fidelity: creditBOR is integer; fractional yocto should not
    // normally exist. Keep it honest rather than rounding silently.
    return `${credits + (rem >= CREDIT / 2n ? 1n : 0n)}.000`;
  }
  return `${credits}.000`;
}

/** Human format for a yocto amount, e.g. "+4.000" or "-2.000". */
export function formatSignedCredits(delta: bigint): string {
  const sign = delta >= 0n ? '+' : '-';
  const abs = delta < 0n ? -delta : delta;
  return `${sign}${formatCredits(abs)}`;
}

export function creditCount(yocto: bigint): number {
  return Number(yocto / CREDIT);
}

/** Turn progress like "3 / 6". */
export function turnProgress(turn: number): string {
  const played = Math.max(0, Math.min(CAMPAIGN_TURNS, turn - 1));
  return `${played} / ${CAMPAIGN_TURNS}`;
}

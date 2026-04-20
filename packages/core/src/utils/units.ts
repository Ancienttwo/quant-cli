/**
 * Convert a human-readable amount to raw units (smallest token unit).
 * Uses string-based arithmetic to avoid floating-point precision loss.
 *
 * Example: toRawUnits("1.5", 9) => "1500000000"
 */
export function toRawUnits(amount: string, decimals: number): string {
  if (decimals === 0) {
    const dotIdx = amount.indexOf(".");
    return dotIdx === -1 ? amount : amount.slice(0, dotIdx);
  }

  const [intPart = "0", fracPart = ""] = amount.split(".");
  const paddedFrac = fracPart.padEnd(decimals, "0").slice(0, decimals);
  const raw = `${intPart}${paddedFrac}`;

  // Remove leading zeros but keep at least "0"
  const trimmed = raw.replace(/^0+/, "") || "0";
  return trimmed;
}

/**
 * Convert raw units (smallest token unit) to a human-readable amount.
 *
 * Example: fromRawUnits("1500000000", 9) => "1.5"
 */
export function fromRawUnits(rawUnits: string, decimals: number): string {
  if (decimals === 0) {
    return rawUnits;
  }

  const padded = rawUnits.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);

  // Remove trailing zeros from fractional part
  const trimmedFrac = fracPart.replace(/0+$/, "");

  if (trimmedFrac === "") {
    return intPart;
  }
  return `${intPart}.${trimmedFrac}`;
}

/**
 * Calculate USD value: amount × price, formatted to 2 decimal places.
 */
export function calcUsdValue(humanAmount: string, priceUsd: string): string {
  const amount = Number.parseFloat(humanAmount);
  const price = Number.parseFloat(priceUsd);
  if (Number.isNaN(amount) || Number.isNaN(price)) {
    return "0.00";
  }
  return (amount * price).toFixed(2);
}

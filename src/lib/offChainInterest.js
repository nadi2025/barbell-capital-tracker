// Helpers for off-chain investor interest calculations.
// Supports Simple and Compound interest with configurable compounding frequency.

const FREQ_PER_YEAR = {
  Annual: 1,
  "Semi-Annual": 2,
  Quarterly: 4,
  Monthly: 12,
};

/**
 * Returns the projected total value at maturity (principal + accrued interest)
 * for an "At Maturity" investor. For "Monthly" investors interest is paid out
 * along the way, so this returns the principal.
 */
export function projectedMaturityValue(investor) {
  if (!investor) return 0;
  const principal = investor.principal_usd || 0;
  const rate = (investor.interest_rate || 0) / 100;
  if (!principal || !rate) return principal;

  if (investor.interest_schedule !== "At Maturity") return principal;

  const start = investor.start_date ? new Date(investor.start_date) : null;
  const end = investor.maturity_date ? new Date(investor.maturity_date) : null;
  if (!start || !end || end <= start) return principal;

  const years = (end - start) / (365.25 * 86400000);

  if (investor.interest_type === "Compound") {
    const n = FREQ_PER_YEAR[investor.compound_frequency] || 1;
    return principal * Math.pow(1 + rate / n, n * years);
  }

  // Simple interest (default)
  return principal * (1 + rate * years);
}

/** Total interest accrued at maturity. */
export function projectedTotalInterest(investor) {
  return projectedMaturityValue(investor) - (investor.principal_usd || 0);
}
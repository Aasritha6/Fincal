export function calculateFutureGoalValue(
  presentCost: number,
  inflation: number,
  years: number
): number {
  if (presentCost <= 0 || years <= 0) return 0;

  return Math.round(
    presentCost * Math.pow(1 + inflation, years)
  );
}

/**
 * Annuity Due Formula (MANDATORY)
 *
 * Required SIP =
 * FV × r ÷ [((1 + r)^n − 1) × (1 + r)]
 */
export function calculateRequiredSIP(
  futureValue: number,
  annualReturn: number,
  years: number
): number {
  if (futureValue <= 0 || years <= 0) return 0;

  const r = annualReturn / 12;
  const n = years * 12;

  if (r === 0) return futureValue / n;

  const sip =
    (futureValue * r) /
    ((Math.pow(1 + r, n) - 1) * (1 + r));

  return Math.round(sip);
}
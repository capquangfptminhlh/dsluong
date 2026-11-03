'use strict';

function evaluateMinimumAmountRule({ amount, rule }) {
  if (!rule) return { status: 'RULE_NOT_FOUND', matched: null, threshold: null };
  const threshold = Number(rule.parameters?.minimum_amount);
  const value = Number(amount);
  if (!Number.isFinite(threshold) || !Number.isFinite(value)) {
    return { status: 'RULE_INVALID', matched: null, threshold: Number.isFinite(threshold) ? threshold : null };
  }
  return { status: 'EVALUATED', matched: value >= threshold, threshold };
}

module.exports = { evaluateMinimumAmountRule };

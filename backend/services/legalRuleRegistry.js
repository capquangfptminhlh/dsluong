'use strict';

const { formatBusinessDate } = require('../utils/businessDate');

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

async function findApprovedRule(db, { tenantId, ruleCode, effectiveAt }) {
  const at = effectiveAt || formatBusinessDate();
  const row = await get(
    db,
    `SELECT * FROM legal_rule_versions
     WHERE user_id = ?
       AND rule_code = ?
       AND status = 'active'
       AND TRIM(COALESCE(source_url, '')) != ''
       AND TRIM(COALESCE(approved_by, '')) != ''
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to = '' OR effective_to >= ?)
     ORDER BY effective_from DESC, id DESC
     LIMIT 1`,
    [tenantId, ruleCode, at, at],
  );

  if (!row) return null;
  let parameters = {};
  try { parameters = JSON.parse(row.parameters_json || '{}'); } catch (_) { return null; }
  return { ...row, parameters };
}

module.exports = { findApprovedRule };

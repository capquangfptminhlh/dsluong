// Four-branch acceptance smoke: run against an isolated backend only.
const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3107/api';
function assert(value, message) { if (!value) throw new Error(message); }
async function call(path, { token, method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json().catch(() => ({}));
  assert(response.status === status, `${method} ${path}: expected ${status}, received ${response.status} ${JSON.stringify(value)}`);
  return value;
}
const owner = await call('/auth/register', {
  method: 'POST',
  body: { phone: '0976000801', name: 'Multi Branch Owner', password: 'BranchSecure2026!', sector: 'retail' },
});
const t = owner.token;
assert(t, 'Owner JWT missing');
const first = (await call('/branches', { token: t }))[0];
assert(first?.id, 'Default branch missing');
const locations = [first];
for (const name of ['Binh Thanh', 'Go Vap', 'Thu Duc']) {
  const b = await call('/branches', { token: t, method: 'POST', body: { name } });
  locations.push({ id: b.id, name });
}
const [, second, third, fourth] = locations;
const product = await call('/products', {
  token: t, method: 'POST',
  body: { name: 'Four Branch USB Cable', sku: 'FOUR-BRANCH-USB-01', price: 100000, cost_price: 50000, stock: 20, category: 'Cables' },
});
assert(product.id, 'Product missing');
await call('/branches/chuyen-kho', {
  token: t, method: 'POST',
  body: { from_branch_id: first.id, to_branch_id: second.id, items: [{ product_id: product.id, quantity: 5 }] },
});
await call('/branches/chuyen-kho', {
  token: t, method: 'POST',
  body: { from_branch_id: first.id, to_branch_id: third.id, items: [{ product_id: product.id, quantity: 5 }] },
});
const cashier = await call('/staff', {
  token: t, method: 'POST',
  body: { name: 'Cashier Two', username: 'cashier_four_branches_02', password: 'BranchSecure2026!', role: 'Thu ngân', permissions: ['pos','orders','reports'], branch_id: second.id },
});
await call('/staff', {
  token: t, method: 'POST',
  status: 400,
  body: { name: 'Unassigned Cashier', username: 'cashier_unassigned_04', password: 'BranchSecure2026!', permissions: ['pos'] },
});
const staffLogin = await call('/auth/staff-login', {
  method: 'POST',
  body: { username: 'cashier_four_branches_02', password: 'BranchSecure2026!' },
});
const cashierToken = staffLogin.token;
assert(cashierToken, 'Cashier JWT missing');
let context = await call('/branches/pos-context', { token: cashierToken });
assert(context.branch_id === second.id && context.can_select === false && context.branches.length === 1, 'Cashier context leaked branches');
const staffBranches = await call('/branches', { token: cashierToken });
assert(staffBranches.length === 1 && Number(staffBranches[0].id) === second.id, 'Branch list must not leak other locations');
const staffStockSummary = await call('/branches/ton-kho/tong-hop', { token: cashierToken });
assert(staffStockSummary.branches.length === 1 && Number(staffStockSummary.branches[0].id) === second.id, 'Branch-wide stock summary leaked');
await call('/branches/' + first.id + '/ton-kho', { token: cashierToken, status: 403 });
const ownerContext = await call('/branches/pos-context', { token: t });
assert(ownerContext.branches.length === 4 && ownerContext.can_select, 'Owner must see four branches');
await call('/branches/pos-stock?branch_id=' + first.id, { token: cashierToken, status: 403 });
await call('/pos/checkout', {
  token: cashierToken, method: 'POST', status: 403,
  body: { cart: [{ id: product.id, quantity: 1 }], payment_method: 'cash', branch_id: first.id },
});
const sold = await call('/pos/checkout', {
  token: cashierToken, method: 'POST',
  body: { cart: [{ id: product.id, quantity: 2 }], payment_method: 'cash', branch_id: second.id },
});
assert(sold.order_code, 'POS checkout missing order code');
await call('/pos/checkout', {
  token: t, method: 'POST',
  body: { cart: [{ id: product.id, quantity: 1 }], payment_method: 'cash', branch_id: first.id },
});
const cashierOrders = await call('/pos', { token: cashierToken });
assert(cashierOrders.length === 1 && cashierOrders[0].branch_id === second.id, 'Orders must be restricted to assigned branch');
const branchStock = await call('/branches/pos-stock?branch_id=' + second.id, { token: cashierToken });
assert(Number(branchStock.stock[product.id]) === 3, 'Cashier branch stock should decrease by 2');
await call('/reports/dashboard?branch_id=' + first.id, { token: cashierToken, status: 403 });
await call('/reports/inventory-valuation?branch_id=' + first.id, { token: cashierToken, status: 403 });
await call('/reports/profit-by-product?branch_id=' + first.id, { token: cashierToken, status: 403 });
await call('/reports/top-slow-selling?branch_id=' + first.id, { token: cashierToken, status: 403 });
const ownDashboard = await call('/reports/dashboard', { token: cashierToken });
assert(ownDashboard.overview.totalOrders === 1 && ownDashboard.overview.totalRevenue === 200000, 'Staff revenue scope incorrect');
const ownerDashboard = await call('/reports/dashboard', { token: t });
assert(ownerDashboard.overview.totalOrders === 2 && ownerDashboard.overview.totalRevenue === 300000, 'Owner aggregate incorrect');
const ownerSummary = await call('/branches/sales-summary', { token: t });
assert(ownerSummary.length === 4 && Number(ownerSummary.find((b) => b.id === second.id)?.revenue) === 200000, 'Branch revenue summary incorrect');
const inventoryManager = await call('/staff', {
  token: t, method: 'POST',
  body: { name: 'Inventory Manager', username: 'inventory_four_branches_02', password: 'BranchSecure2026!', role: 'Quản lý', permissions: ['inventory','pos','reports','finance'], branch_id: second.id },
});
assert(inventoryManager.id, 'Inventory manager creation failed');
const managerSession = await call('/auth/staff-login', {
  method: 'POST', body: { username: 'inventory_four_branches_02', password: 'BranchSecure2026!' },
});
await call('/branches/chuyen-kho', {
  token: managerSession.token, method: 'POST', status: 403,
  body: { from_branch_id: first.id, to_branch_id: third.id, items: [{ product_id: product.id, quantity: 1 }] },
});
await call('/staff/' + cashier.id, { token: t, method: 'PUT', body: { branch_id: third.id } });
context = await call('/branches/pos-context', { token: cashierToken });
assert(context.branch_id === third.id, 'Branch assignment must be live; re-login must not be required');
await call('/pos/checkout', {
  token: cashierToken, method: 'POST', status: 403,
  body: { cart: [{ id: product.id, quantity: 1 }], payment_method: 'cash', branch_id: second.id },
});
const thirdStock = await call('/branches/pos-stock?branch_id=' + third.id, { token: cashierToken });
assert(Number(thirdStock.stock[product.id]) === 5, 'New staff branch stock invalid');
const finalStock = await call('/branches/ton-kho/tong-hop', { token: t });
const p = finalStock.products.find((row) => row.id === product.id);
assert(p && Number(p.stock) === 17, 'Total stock must remain in sync after branch sales');
await call('/inventory/import', {
  token: managerSession.token, method: 'POST', status: 403,
  body: { product_id: product.id, quantity: 1, branch_id: first.id },
});
await call('/inventory/import', {
  token: managerSession.token, method: 'POST',
  body: { product_id: product.id, quantity: 1 },
});
let secondAfterInventory = await call('/branches/pos-stock?branch_id=' + second.id, { token: managerSession.token });
assert(Number(secondAfterInventory.stock[product.id]) === 4, 'Inventory movement must target assigned branch');
await call('/returns/eligibility/' + cashierOrders[0].id, { token: cashierToken, status: 403 });
await call('/returns', {
  token: cashierToken, method: 'POST', status: 403,
  body: { order_id: cashierOrders[0].id, reason: 'Wrong branch', items: [{ product_id: product.id, quantity: 1 }] },
});
const noBranchField = await call('/pos/checkout', {
  token: cashierToken, method: 'POST',
  body: { cart: [{ id: product.id, quantity: 1 }], payment_method: 'cash' },
});
assert(noBranchField.order_code, 'Assigned staff checkout without branch_id must work');
const newest = await call('/pos', { token: cashierToken });
assert(newest.length === 1 && Number(newest[0].branch_id) === third.id, 'Staff must see only reassigned branch sales');
const afterAll = await call('/branches/ton-kho/tong-hop', { token: t });
assert(Number(afterAll.products.find((row) => row.id === product.id)?.stock) === 17, 'Stock must balance across purchases, sales, and inventory');
// Hospitality: two restaurants must never share tables, open sessions or
// complete a session with a POS order from a different location.
const secondTable = await call('/rooms', { token: t, method: 'POST',
  status: 201, body: { name: 'Table at branch two', type: 'Bàn', branch_id: second.id },
});
const thirdTable = await call('/rooms', { token: t, method: 'POST',
  status: 201, body: { name: 'Table at branch three', type: 'Bàn', branch_id: third.id },
});
const fourthRoom = await call('/rooms', {
  token: t, method: 'POST', status: 201,
  body: { name: 'Empty fourth store table', type: 'Bàn', branch_id: fourth.id },
});
assert(fourthRoom.id, 'Fourth branch table was not created');
await call('/branches/' + fourth.id, { token: t, method: 'DELETE', status: 409 });
const staffRooms = await call('/rooms', { token: managerSession.token });
assert(staffRooms.length === 1 && Number(staffRooms[0].id) === Number(secondTable.id), 'Other restaurant tables leaked');
await call('/fnb/rooms/' + thirdTable.id + '/session', { token: managerSession.token, method: 'PUT', status: 403,
  body: { items: [{ product_id: product.id, quantity: 1 }] },
});
await call('/fnb/rooms/' + secondTable.id + '/session', { token: managerSession.token, method: 'PUT',
  body: { items: [{ product_id: product.id, quantity: 1 }], branch_id: second.id },
});
const activeSecond = await call('/fnb/sessions/active', { token: managerSession.token });
assert(activeSecond.length === 1 && activeSecond[0].room_id === secondTable.id, 'F&B branch two session missing');
await call('/fnb/rooms/' + secondTable.id + '/transfer', { token: managerSession.token, method: 'POST', status: 403,
  body: { target_room_id: thirdTable.id, branch_id: second.id },
});
await call('/fnb/rooms/' + thirdTable.id + '/kitchen', { token: managerSession.token, method: 'POST', status: 403 });
await call('/pos/checkout', { token: managerSession.token, method: 'POST', status: 403,
  body: { fnb_session_id: activeSecond[0].id, branch_id: third.id,
    cart: [{ id: product.id, quantity: 1 }], payment_method: 'cash' },
});
const secondFnbSale = await call('/pos/checkout', { token: managerSession.token, method: 'POST',
  body: { fnb_session_id: activeSecond[0].id, branch_id: second.id,
    cart: [{ id: product.id, quantity: 1 }], payment_method: 'cash' },
});
await call('/fnb/sessions/' + activeSecond[0].id + '/complete', { token: managerSession.token, method: 'POST',
  body: { branch_id: second.id, order_code: secondFnbSale.order_code },
});
const finalSecondSessions = await call('/fnb/sessions/active', { token: managerSession.token });
assert(finalSecondSessions.length === 0, 'F&B session was not completed');

const managerVisibleStaff = await call('/staff', { token: managerSession.token });
assert(managerVisibleStaff.length === 1 && managerVisibleStaff[0].name === 'Inventory Manager',
  'Branch manager must not see other locations staff');
const managerStockLogs = await call('/inventory/logs', { token: managerSession.token });
assert(managerStockLogs.length > 0 && managerStockLogs.every((record) => Number(record.branch_id) === second.id),
  'Inventory logs must be restricted to the assigned warehouse');
await call('/inventory/check', { token: managerSession.token, status: 403 });
await call('/inventory/transfer', { token: managerSession.token, status: 403 });
const secondMargin = await call('/reports/branch-gross-profit?branch_id=' + second.id, { token: t });
assert(Number(secondMargin.net_revenue) === 300000 &&
       secondMargin.expense_allocation !== 'complete' &&
       secondMargin.net_profit === null, 'Branch margin must report sales but never fabricate net profit');
const scopedMargin = await call('/reports/branch-gross-profit', { token: managerSession.token });
assert(Number(scopedMargin.branch_id) === second.id && Number(scopedMargin.net_revenue) === 300000,
  'Staff margin must resolve their assigned branch');
await call('/reports/branch-gross-profit?branch_id=' + third.id, { token: managerSession.token, status: 403 });
await call('/reports/branch-gross-profit', { token: t, status: 400 });
const financeChoices = await call('/branches/finance-context', { token: managerSession.token });
assert(Number(financeChoices.branch_id) === second.id && financeChoices.branches.length === 1,
  'Staff cashbook must expose only one permitted location');
await call('/finance/cash-flows', { token: managerSession.token, method: 'POST', status: 403,
  body: { transaction_type: 'out', category: 'electric', amount: 100000, payment_method: 'cash', branch_id: third.id },
});
const secondExpense = await call('/finance/cash-flows', { token: managerSession.token, method: 'POST',
  body: { transaction_type: 'out', category: 'electric', amount: 100000, payment_method: 'cash' },
});
assert(Number(secondExpense.branch_id) === second.id, 'Staff expense must inherit branch from DB');
const thirdExpense = await call('/finance/cash-flows', { token: t, method: 'POST',
  body: { transaction_type: 'out', category: 'rent', amount: 200000, payment_method: 'bank', branch_id: third.id },
});
assert(Number(thirdExpense.branch_id) === third.id, 'Owner explicit location not saved');
const commonExpense = await call('/finance/cash-flows', { token: t, method: 'POST',
  body: { transaction_type: 'out', category: 'shared', amount: 50000, payment_method: 'cash' },
});
assert(commonExpense.branch_id === null, 'Common cost must stay unallocated');
const staffLedger = await call('/finance/cash-flows', { token: managerSession.token });
assert(staffLedger.some((item) => item.id === secondExpense.id) &&
  staffLedger.every((item) => Number(item.branch_id) === second.id), 'Staff cashbook leaked other locations');
assert(staffLedger.some((item) => item.category === 'sales' && Number(item.branch_id) === second.id),
  'Checkout cash receipts must be visible in the selling branch cashbook');
await call('/finance/cash-flows?branch_id=' + third.id, { token: managerSession.token, status: 403 });
const thirdLedger = await call('/finance/cash-flows?branch_id=' + third.id, { token: t });
assert(thirdLedger.some((item) => item.id === thirdExpense.id) &&
  thirdLedger.every((item) => Number(item.branch_id) === third.id), 'Owner cashbook filter leaked other branches');
const allLedger = await call('/finance/cash-flows', { token: t });
assert(allLedger.some((item) => item.id === commonExpense.id && item.branch_id === null),
  'Owner must see historical and shared costs without invented attribution');
const attributedMargin = await call('/reports/branch-gross-profit?branch_id=' + second.id, { token: t });
assert(Number(attributedMargin.attributed_operating_expenses) === 100000 &&
  Number(attributedMargin.shared_operating_expenses) === 50000 &&
  attributedMargin.net_profit === null &&
  Number(attributedMargin.profit_after_attributed_expenses) ===
    Number(attributedMargin.gross_profit) - 100000,
  'Only explicitly allocated operating expenses may reduce local indicative profit');
await call('/finance/pnl', { token: managerSession.token, status: 403 });
const debtStaff = await call('/staff', { token: t, method: 'POST', body: {
  name: 'Debt Cashier', username: 'debt_cashier_four_branches', password: 'BranchSecure2026!',
  role: 'Thu ngân', permissions: ['debt', 'finance'], branch_id: second.id,
}});
assert(debtStaff.id, 'Debt staff setup missing');
const debtStaffLogin = await call('/auth/staff-login', { method: 'POST', body: {
  username: 'debt_cashier_four_branches', password: 'BranchSecure2026!',
}});
await call('/finance/debts', { token: debtStaffLogin.token, status: 403 });
await call('/finance/debts', { token: debtStaffLogin.token, method: 'POST', status: 403,
  body: { type: 'receivable', partner_name: 'Cross-branch partner', amount: 123456 },
});
const shiftFirst = await call('/shifts/open', { token: t, method: 'POST',
  body: { opening_cash: 100000, branch_id: first.id },
});
const shiftSecond = await call('/shifts/open', { token: t, method: 'POST',
  body: { opening_cash: 200000, branch_id: second.id },
});
assert(shiftFirst.id && shiftSecond.id && shiftFirst.id !== shiftSecond.id,
  'Two stores must open different cash drawers');
await call('/shifts/open', { token: managerSession.token, method: 'POST', status: 409,
  body: { opening_cash: 200000, branch_id: second.id },
});
const scopedShift = await call('/shifts/current', { token: managerSession.token });
assert(scopedShift.id === shiftSecond.id && Number(scopedShift.expected_now) === 200000,
  'Cashier must see only own shift, not another store');
await call('/shifts/current?branch_id=' + first.id, { token: managerSession.token, status: 403 });
await call('/shifts/close', { token: managerSession.token, method: 'POST', status: 403,
  body: { closing_cash: 100000, branch_id: first.id } });
// Payments may happen immediately after a shift opens. Ledger watermark,
 // not rounded wall-clock time, must decide which shift owns the cash.
await call('/finance/cash-flows', { token: t, method: 'POST',
  body: { transaction_type: 'in', category: 'manual_first', amount: 3000,
    payment_method: 'cash', branch_id: first.id },
});
await call('/finance/cash-flows', { token: managerSession.token, method: 'POST',
  body: { transaction_type: 'in', category: 'manual_second', amount: 7000,
    payment_method: 'cash' },
});
const firstDrawer = await call('/shifts/current?branch_id=' + first.id, { token: t });
const secondDrawer = await call('/shifts/current', { token: managerSession.token });
assert(Number(firstDrawer.expected_now) === 103000 && Number(secondDrawer.expected_now) === 207000,
  'Cash flow from one outlet contaminated the other cash drawer');
await call('/shifts/close', { token: managerSession.token, method: 'POST',
  body: { closing_cash: 207000 } });
await call('/shifts/close', { token: t, method: 'POST',
  body: { closing_cash: 103000, branch_id: first.id } });
const firstHistory = await call('/shifts?branch_id=' + first.id, { token: t });
const secondHistory = await call('/shifts', { token: managerSession.token });
assert(firstHistory.length === 1 && firstHistory[0].id === shiftFirst.id &&
  secondHistory.length === 1 && secondHistory[0].id === shiftSecond.id,
  'Closed shifts must be visible only at their own branch');
console.log('PASS: four branches, POS/F&B, finance/privacy, separate concurrent cash drawers and close reconciliation');

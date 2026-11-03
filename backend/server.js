const express = require('express');
const cors = require('cors');
const path = require('path');
const mappingRoutes = require('./routes/mappingRoutes');
const reportRoutes = require('./routes/reportRoutes');
const registrationIntegrityRoutes = require('./routes/registrationIntegrityRoutes');
const accountIntegrityRoutes = require('./routes/accountIntegrityRoutes');
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const productIntegrityRoutes = require('./routes/productIntegrityRoutes');
const productRoutes = require('./routes/productRoutes');
const posPreflightRoutes = require('./routes/posPreflightRoutes');
const posPromotionPreflightRoutes = require('./routes/posPromotionPreflightRoutes');
const posIntegrityRoutes = require('./routes/posIntegrityRoutes');
const posRoutes = require('./routes/posRoutes');
const customerIntegrityRoutes = require('./routes/customerIntegrityRoutes');
const customerRoutes = require('./routes/customerRoutes');
const inventoryMovementIntegrityRoutes = require('./routes/inventoryMovementIntegrityRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const commissionIntegrityRoutes = require('./routes/commissionIntegrityRoutes');
const staffRoutes = require('./routes/staffRoutes');
const roomCheckinIntegrityRoutes = require('./routes/roomCheckinIntegrityRoutes');
const roomRoutes = require('./routes/roomRoutes');
const fnbRoutes = require('./routes/fnbRoutes');
const appointmentIntegrityRoutes = require('./routes/appointmentIntegrityRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const aiRoutes = require('./routes/aiRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const systemRoutes = require('./routes/systemRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const loyaltyRoutes = require('./routes/loyaltyRoutes');
const omniRoutes = require('./routes/omniRoutes');
const inventoryAdvRoutes = require('./routes/inventoryRoutes');
const bomRoutes = require('./routes/bomRoutes');
const hrmRoutes = require('./routes/hrmRoutes');
const hrmPayrollRoutes = require('./routes/hrmPayrollRoutes');
const hrmSelfRoutes = require('./routes/hrmSelfRoutes');
const hrmExtrasRoutes = require('./routes/hrmExtrasRoutes');
const hrmPaymentRoutes = require('./routes/hrmPaymentRoutes');
const hrmAttendanceCorrectionRoutes = require('./routes/hrmAttendanceCorrectionRoutes');
const promoIntegrityRoutes = require('./routes/promoIntegrityRoutes');
const promoRoutes = require('./routes/promoRoutes');
const financeIntegrityRoutes = require('./routes/financeIntegrityRoutes');
const financeRoutes = require('./routes/financeRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const supplierIntegrityRoutes = require('./routes/supplierIntegrityRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const auditComplianceRoutes = require('./routes/auditComplianceRoutes');
const outputAuditRoutes = require('./routes/outputAuditRoutes');
const returnRoutes = require('./routes/returnRoutes');
const shiftCloseIntegrityRoutes = require('./routes/shiftCloseIntegrityRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const backupRoutes = require('./routes/backupRoutes');
const pricingIntegrityRoutes = require('./routes/pricingIntegrityRoutes');
const pricingRoutes = require('./routes/pricingRoutes');
const batchIntegrityRoutes = require('./routes/batchIntegrityRoutes');
const batchRoutes = require('./routes/batchRoutes');
const comboIntegrityRoutes = require('./routes/comboIntegrityRoutes');
const comboRoutes = require('./routes/comboRoutes');
const branchIntegrityRoutes = require('./routes/branchIntegrityRoutes');
const branchModule = require('./routes/branchRoutes');
const supplierOrderCreateIntegrityRoutes = require('./routes/supplierOrderCreateIntegrityRoutes');
const supplierOrderCancelIntegrityRoutes = require('./routes/supplierOrderCancelIntegrityRoutes');
const supplierReturnIntegrityRoutes = require('./routes/supplierReturnIntegrityRoutes');
const supplierOrderRoutes = require('./routes/supplierOrderRoutes');
const db = require('./db');
const { ensureRuntimeSchema } = require('./runtimeSchema');
const { ensureAuditComplianceSchema } = require('./auditComplianceSchema');
const { ensureInventoryCompatibility } = require('./inventoryCompatibility');
const { ensurePosIntegritySchema } = require('./posIntegritySchema');
const { ensurePromotionIntegritySchema } = require('./promotionIntegritySchema');
const { ensureBatchIntegritySchema } = require('./batchIntegritySchema');
const { ensureComboIntegritySchema } = require('./comboIntegritySchema');
const { protectExistingSensitiveSettings } = require('./utils/secretSettings');
const { protectExistingAiCredentials } = require('./utils/aiCredentials');
const { formatBusinessDate } = require('./utils/businessDate');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/mappings', mappingRoutes);
app.use('/api/reports', reportRoutes);
// New-shop onboarding is all-or-nothing; account lifecycle blocks unsafe hard deletes
// and provides tenant lock/unlock before the remaining legacy auth routes.
app.use('/api/auth', registrationIntegrityRoutes);
app.use('/api/auth', accountIntegrityRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
// Atomic write handlers run before the legacy product router and shadow only the
// high-risk create/variant/bulk-price endpoints. Product reads/import remain unchanged.
app.use('/api/products', productIntegrityRoutes);
app.use('/api/products', productRoutes);
// Cancel preflight runs first. Selected promotion preflight then replaces client discount
// from authoritative prices before the atomic POS handler persists the order.
app.use('/api/pos', posPreflightRoutes);
app.use('/api/pos', posPromotionPreflightRoutes);
app.use('/api/pos', posIntegrityRoutes);
app.use('/api/pos', posRoutes);
// Customer identity writes are guarded before legacy reads/create routes. Phone changes
// and hard deletes cannot detach existing POS/loyalty/appointment/warranty history.
app.use('/api/customers', customerIntegrityRoutes);
app.use('/api/customers', customerRoutes);
// Manual stock movement must update branch_stock + products.stock + inventory_logs atomically.
// Legacy inventory reads/check/transfer routes continue unchanged below.
app.use('/api/inventory', inventoryMovementIntegrityRoutes);
app.use('/api/inventory', inventoryRoutes);
// Order-linked commission writes serialize duplicate submissions and reject cancelled orders.
// Staff reads, management and commission summary remain in the legacy router below.
app.use('/api/staff', commissionIntegrityRoutes);
app.use('/api/staff', staffRoutes);
// Hotel check-in obtains the SQLite writer boundary before checking active bookings and
// persists booking + occupied room status atomically. Other room behavior stays legacy.
app.use('/api/rooms', roomCheckinIntegrityRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/fnb', fnbRoutes);
// Appointment writes are tenant-authoritative, overlap-safe and lifecycle-guarded.
// Legacy GET remains unchanged below.
app.use('/api/appointments', appointmentIntegrityRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/workflows', workflowRoutes.router);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/omni', omniRoutes);
app.use('/api/inventory-adv', inventoryAdvRoutes);
app.use('/api/bom', bomRoutes);
app.use('/api/hrm', hrmSelfRoutes);
app.use('/api/hrm', hrmExtrasRoutes);
app.use('/api/hrm', hrmPaymentRoutes);
app.use('/api/hrm', hrmAttendanceCorrectionRoutes);
app.use('/api/hrm', hrmPayrollRoutes);
app.use('/api/hrm', hrmRoutes);
// Promotion create/delete writes are finite-safe and history-safe. Promotion reads stay legacy.
app.use('/api/promo', promoIntegrityRoutes);
app.use('/api/promo', promoRoutes);
// Atomic finance write handlers shadow only the high-risk debt/cash endpoints.
// Finance reads and P&L routes continue unchanged below.
app.use('/api/finance', financeIntegrityRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/categories', categoryRoutes);
// Hard supplier deletion is restricted to entirely unused suppliers; all supplier reads,
// create/update and other legacy behavior continue unchanged below.
app.use('/api/suppliers', supplierIntegrityRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/audit-compliance', auditComplianceRoutes);
app.use('/api/audit-compliance', outputAuditRoutes);
app.use('/api/returns', returnRoutes);
// Shift close obtains the SQLite writer boundary before reading cash-flow totals so the
// stored drawer snapshot cannot miss a cash movement that commits while closing.
app.use('/api/shifts', shiftCloseIntegrityRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/backup', backupRoutes);
// High-risk pricing writes are finite-safe and price-level cleanup is one IMMEDIATE transaction.
// Pricing reads and low-risk deletes/base-unit behavior remain in the legacy router.
app.use('/api/pricing', pricingIntegrityRoutes);
app.use('/api/pricing', pricingRoutes);
// Batch reads/create/destroy/legacy-branch assignment are branch-aware and atomic.
// Alert summaries remain in the legacy router below.
app.use('/api/batches', batchIntegrityRoutes);
app.use('/api/batches', batchRoutes);
// Combo create/delete are finite-safe, atomic and history-safe; legacy combo reads plus
// serial/warranty endpoints continue unchanged below.
app.use('/api/pd', comboIntegrityRoutes);
app.use('/api/pd', comboRoutes);
// Hard branch deletion is allowed only for a truly unused non-default branch.
// Branch reads/create/update/default-switch and transfer behavior remain unchanged below.
app.use('/api/branches', branchIntegrityRoutes);
app.use('/api/branches', branchModule.router);
// Atomic POST /requests, /requests/:id/huy and /returns shadow high-risk supplier-order writes.
// Supplier order reads/receiving and return history continue unchanged below.
app.use('/api/supplier-orders', supplierOrderCreateIntegrityRoutes);
app.use('/api/supplier-orders', supplierOrderCancelIntegrityRoutes);
app.use('/api/supplier-orders', supplierReturnIntegrityRoutes);
app.use('/api/supplier-orders', supplierOrderRoutes);

function tuDongSaoLuu() {
  const fs = require('fs');
  const backupPath = path.resolve(__dirname, 'backups');
  try {
    if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });
    const businessDate = formatBusinessDate();
    const today = businessDate.replace(/-/g, '');
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const byType = Object.fromEntries(timeParts.map((part) => [part.type, part.value]));
    const alreadyExists = fs.readdirSync(backupPath).some((file) => file.startsWith(`autotax-${today}`));
    if (alreadyExists) return;

    const fileName = `autotax-${today}-${byType.hour}${byType.minute}${byType.second}.db`;
    db.run('VACUUM INTO ?', [path.join(backupPath, fileName)], (err) => {
      if (err) return console.error('[SAO LUU] Loi:', err.message);
      console.log('[SAO LUU] Da tao ban sao luu tu dong:', fileName);
      const backups = fs.readdirSync(backupPath).filter((file) => file.endsWith('.db'))
        .map((file) => ({ file, modified: fs.statSync(path.join(backupPath, file)).mtime }))
        .sort((a, b) => b.modified - a.modified);
      backups.slice(30).forEach((item) => {
        try { fs.unlinkSync(path.join(backupPath, item.file)); } catch (_) {}
      });
    });
  } catch (error) {
    console.error('[SAO LUU] Loi:', error.message);
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const fs = require('fs');
const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
const indexHtmlPath = path.resolve(__dirname, '../frontend/dist/index.html');

app.use(express.static(frontendDistPath, { fallthrough: true }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  try {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  if (err && err.status === 404 && !req.path.startsWith('/api')) {
    try {
      const html = fs.readFileSync(indexHtmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (_) { /* fall through */ }
  }
  res.status(err.status || 500).send(err.message || 'Internal Server Error');
});

async function startServer() {
  try {
    await ensureRuntimeSchema(db);
    await ensureAuditComplianceSchema(db);
    await ensurePosIntegritySchema(db);
    await ensurePromotionIntegritySchema(db);
    await ensureBatchIntegritySchema(db);
    await ensureComboIntegritySchema(db);
    await ensureInventoryCompatibility(db);
    const migratedSecrets = await protectExistingSensitiveSettings(db);
    if (migratedSecrets > 0) console.log(`[SECURITY] Encrypted ${migratedSecrets} legacy sensitive shop settings.`);
    const migratedAiKeys = await protectExistingAiCredentials(db);
    if (migratedAiKeys > 0) console.log(`[SECURITY] Encrypted ${migratedAiKeys} legacy AI API keys.`);
    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      setTimeout(tuDongSaoLuu, 2000);
      const backupTimer = setInterval(tuDongSaoLuu, 60 * 60 * 1000);
      backupTimer.unref();
    });
    return server;
  } catch (error) {
    console.error('[STARTUP] Runtime compatibility gate failed:', error.message);
    process.exitCode = 1;
    throw error;
  }
}

startServer().catch(() => {
  setImmediate(() => process.exit(1));
});

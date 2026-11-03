import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Patch target missing: ${label}`);
  return source.replace(before, after);
}

// 1) Make every POS cart line independently addressable, even when product/variant ids overlap.
{
  const path = 'frontend/src/pages/RetailPOS.jsx';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceOnce(source,
`      return [...prev, {
        ...product,
        base_price: variantPrice,`,
`      return [...prev, {
        ...product,
        cart_line_id: \`line-\${product.id}-\${defaultVariant?.id || 0}-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`,
        base_price: variantPrice,`,
  'POS cart_line_id');

  source = replaceOnce(source,
`  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const updateQuantityValue = (id, value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const quantity = Math.max(1, Math.trunc(parsed));
    setCart(prev => prev.map(item => item.id === id ? { ...item, quantity } : item));
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateItemPrice = (id, value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setCart(prev => prev.map(item => item.id === id ? { ...item, price: parsed, manual_price: parsed } : item));
  };

  const updateVariantSelection = (id, variantId) => {
    const parsedId = Number(variantId);
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      const source = products.find((product) => Number(product.id) === Number(id));
      const variants = Array.isArray(source?.variants) ? source.variants : [];
      const selected = variants.find((variant) => Number(variant.id) === parsedId);
      if (!selected) return item;
      const options = Array.isArray(item.warranty_options) ? item.warranty_options : [];
      const selectedPackage = options.find((option) => Number(option.months) === Number(item.warranty_months));
      const basePrice = Number(selected.price) || 0;
      return {
        ...item,
        variant_id: selected.id,
        variant_label: variantLabel(selected),
        sku: selected.sku || item.sku,
        image_url: selected.image_url || source?.image_url || item.image_url,
        base_price: basePrice,
        price: selectedPackage ? (Number(selectedPackage.price) || 0) : basePrice,
        manual_price: undefined,
      };
    }));
  };

  const updateWarrantyMonths = (id, value) => {
    const parsed = Number(value);
    const months = Number.isFinite(parsed) ? Math.max(0, Math.min(240, Math.trunc(parsed))) : 0;
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      const options = Array.isArray(item.warranty_options) ? item.warranty_options : [];
      if (options.length) {
        const selected = options.find((option) => Number(option.months) === months);
        return selected ? { ...item, warranty_months: months, price: Number(selected.price) || 0, manual_price: undefined } : item;
      }
      return { ...item, warranty_months: months };
    }));
  };`,
`  const isCartLine = (item, lineId) => String(item.cart_line_id || '') === String(lineId || '');

  const updateQuantity = (lineId, delta) => {
    setCart(prev => prev.map(item => {
      if (isCartLine(item, lineId)) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const updateQuantityValue = (lineId, value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const quantity = Math.max(1, Math.trunc(parsed));
    setCart(prev => prev.map(item => isCartLine(item, lineId) ? { ...item, quantity } : item));
  };

  const removeFromCart = (lineId) => {
    setCart(prev => prev.filter(item => !isCartLine(item, lineId)));
  };

  const updateItemPrice = (lineId, value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setCart(prev => prev.map(item => isCartLine(item, lineId) ? { ...item, price: parsed, manual_price: parsed } : item));
  };

  const updateVariantSelection = (lineId, variantId) => {
    const parsedId = Number(variantId);
    setCart(prev => prev.map(item => {
      if (!isCartLine(item, lineId)) return item;
      const source = products.find((product) => Number(product.id) === Number(item.id));
      const variants = Array.isArray(source?.variants) ? source.variants : [];
      const selected = variants.find((variant) => Number(variant.id) === parsedId);
      if (!selected) return item;
      const options = Array.isArray(item.warranty_options) ? item.warranty_options : [];
      const selectedPackage = options.find((option) => Number(option.months) === Number(item.warranty_months));
      const basePrice = Number(selected.price) || 0;
      return {
        ...item,
        variant_id: selected.id,
        variant_label: variantLabel(selected),
        sku: selected.sku || item.sku,
        image_url: selected.image_url || source?.image_url || item.image_url,
        base_price: basePrice,
        price: selectedPackage ? (Number(selectedPackage.price) || 0) : basePrice,
        manual_price: undefined,
      };
    }));
  };

  const updateWarrantyMonths = (lineId, value) => {
    const parsed = Number(value);
    const months = Number.isFinite(parsed) ? Math.max(0, Math.min(240, Math.trunc(parsed))) : 0;
    setCart(prev => prev.map(item => {
      if (!isCartLine(item, lineId)) return item;
      const options = Array.isArray(item.warranty_options) ? item.warranty_options : [];
      if (options.length) {
        const selected = options.find((option) => Number(option.months) === months);
        return selected ? { ...item, warranty_months: months, price: Number(selected.price) || 0, manual_price: undefined } : item;
      }
      return { ...item, warranty_months: months };
    }));
  };`,
  'POS line-scoped mutations');

  const uiReplacements = [
    ['key={idx}', 'key={item.cart_line_id || `${item.id}-${item.variant_id || 0}-${idx}`}'],
    ['removeFromCart(item.id)', 'removeFromCart(item.cart_line_id)'],
    ['updateItemPrice(item.id, e.target.value)', 'updateItemPrice(item.cart_line_id, e.target.value)'],
    ['updateQuantity(item.id, -1)', 'updateQuantity(item.cart_line_id, -1)'],
    ['updateQuantityValue(item.id, e.target.value)', 'updateQuantityValue(item.cart_line_id, e.target.value)'],
    ['updateQuantity(item.id, 1)', 'updateQuantity(item.cart_line_id, 1)'],
    ['updateVariantSelection(item.id, e.target.value)', 'updateVariantSelection(item.cart_line_id, e.target.value)'],
    ['updateWarrantyMonths(item.id, e.target.value)', 'updateWarrantyMonths(item.cart_line_id, e.target.value)'],
  ];
  for (const [before, after] of uiReplacements) {
    if (!source.includes(before)) throw new Error(`Patch target missing: ${before}`);
    source = source.split(before).join(after);
  }
  fs.writeFileSync(path, source);
}

// 2) Keep variant stock authoritative during checkout and order cancellation.
{
  const path = 'backend/routes/posIntegrityRoutes.js';
  let source = fs.readFileSync(path, 'utf8');

  source = replaceOnce(source,
`function stockRequirements(lines) {`,
`function variantStockRequirements(lines) {
  const requirements = new Map();
  for (const line of lines) {
    if (line.kind !== 'product' || !line.variant_id) continue;
    const key = \`\${line.product_id}:\${line.variant_id}\`;
    const current = requirements.get(key) || {
      product_id: Number(line.product_id), variant_id: Number(line.variant_id), quantity: 0, name: line.name,
    };
    current.quantity += Number(line.quantity) * Number(line.unit_ratio || 1);
    requirements.set(key, current);
  }
  return [...requirements.values()];
}

async function assertVariantStock(userId, requirements) {
  for (const item of requirements) {
    const row = await get(
      \`SELECT pv.stock
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = ? AND pv.product_id = ? AND p.user_id = ?\`,
      [item.variant_id, item.product_id, userId],
    );
    if (!row) {
      const error = new Error(\`Phân loại của "\${item.name}" không còn hợp lệ.\`);
      error.status = 409;
      throw error;
    }
    const available = Number(row.stock) || 0;
    if (available < item.quantity) {
      const error = new Error(\`Không đủ tồn phân loại "\${item.name}": cần \${item.quantity}, hiện có \${available}.\`);
      error.status = 409;
      throw error;
    }
  }
}

async function changeVariantStock(userId, productId, variantId, delta) {
  if (!variantId) return;
  const result = await run(
    \`UPDATE product_variants
     SET stock = stock + ?
     WHERE id = ? AND product_id = ?
       AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_variants.product_id AND p.user_id = ?)\`,
    [delta, variantId, productId, userId],
  );
  if (!result.changes) {
    const error = new Error(\`Không thể cập nhật tồn phân loại \${variantId} của sản phẩm \${productId}.\`);
    error.status = 409;
    throw error;
  }
}

function stockRequirements(lines) {`,
  'variant stock helpers');

  source = replaceOnce(source,
`    const requirements = stockRequirements(lines);
    const classification = await revenueClassification(userId);`,
`    const requirements = stockRequirements(lines);
    const variantRequirements = variantStockRequirements(lines);
    const classification = await revenueClassification(userId);`,
  'checkout variant requirements');

  source = replaceOnce(source,
`      await assertStock(userId, branchId, requirements);

      if (req.body.promotion_id) {`,
`      await assertStock(userId, branchId, requirements);
      await assertVariantStock(userId, variantRequirements);

      if (req.body.promotion_id) {`,
  'checkout variant assertion');

  source = replaceOnce(source,
`          if (branchId) await doiTonChiNhanh(branchId, line.product_id, -baseQuantity);
          else await run('UPDATE products SET stock = stock - ? WHERE id = ? AND user_id = ?', [baseQuantity, line.product_id, userId]);
          await consumeBatches`,
`          if (branchId) await doiTonChiNhanh(branchId, line.product_id, -baseQuantity);
          else await run('UPDATE products SET stock = stock - ? WHERE id = ? AND user_id = ?', [baseQuantity, line.product_id, userId]);
          await changeVariantStock(userId, line.product_id, line.variant_id, -baseQuantity);
          await consumeBatches`,
  'checkout decrement variant stock');

  source = replaceOnce(source,
`        \`SELECT product_id, combo_id, product_name, quantity, COALESCE(unit_ratio, 1) AS unit_ratio
         FROM pos_order_items WHERE order_id = ?\`,`,
`        \`SELECT product_id, combo_id, product_name, quantity, COALESCE(unit_ratio, 1) AS unit_ratio, variant_id
         FROM pos_order_items WHERE order_id = ?\`,`,
  'cancel load variant id');

  source = replaceOnce(source,
`          if (order.branch_id) await doiTonChiNhanh(order.branch_id, item.product_id, quantity);
          else await run('UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?', [quantity, item.product_id, userId]);
          await run(`,
`          if (order.branch_id) await doiTonChiNhanh(order.branch_id, item.product_id, quantity);
          else await run('UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?', [quantity, item.product_id, userId]);
          await changeVariantStock(userId, item.product_id, item.variant_id, quantity);
          await run(`,
  'cancel restore variant stock');

  fs.writeFileSync(path, source);
}

// 3) Make the E2E input helper replace controlled React values reliably instead of appending.
{
  const path = 'frontend/smoke-customer-journey.mjs';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceOnce(source,
`async function replaceInput(page, selector, value, index = 0) {
  const handles = await page.$$(selector);
  const handle = handles[index];
  assert(handle, \`Không tìm thấy input \${selector}[\${index}]\`);
  await handle.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await handle.type(String(value));
}

async function replaceLabeled(page, labelText, value, controlSelector = 'input, textarea') {
  const control = await page.evaluateHandle((needle, css) => {
    const labels = [...document.querySelectorAll('label')];
    const label = labels.find((node) => (node.textContent || '').trim().includes(needle));
    if (!label) return null;
    if (label.matches(css)) return label;
    return label.querySelector(css) || label.parentElement?.querySelector(css) || null;
  }, labelText, controlSelector);
  const element = control.asElement();
  assert(element, \`Không tìm thấy control của label "\${labelText}"\`);
  await element.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await element.type(String(value));
  await control.dispose();
}`,
`async function setControlValue(page, element, value) {
  await page.evaluate((node, nextValue) => {
    const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (!setter) throw new Error('Không tìm thấy native value setter');
    setter.call(node, String(nextValue));
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, element, String(value));
  await sleep(80);
}

async function replaceInput(page, selector, value, index = 0) {
  const handles = await page.$$(selector);
  const handle = handles[index];
  assert(handle, \`Không tìm thấy input \${selector}[\${index}]\`);
  await setControlValue(page, handle, value);
}

async function replaceLabeled(page, labelText, value, controlSelector = 'input, textarea') {
  const control = await page.evaluateHandle((needle, css) => {
    const labels = [...document.querySelectorAll('label')];
    const label = labels.find((node) => (node.textContent || '').trim().includes(needle));
    if (!label) return null;
    if (label.matches(css)) return label;
    return label.querySelector(css) || label.parentElement?.querySelector(css) || null;
  }, labelText, controlSelector);
  const element = control.asElement();
  assert(element, \`Không tìm thấy control của label "\${labelText}"\`);
  await setControlValue(page, element, value);
  await control.dispose();
}`,
  'E2E controlled input replacement');

  source = replaceOnce(source,
`  await qtyInputs[0].click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await qtyInputs[0].type('3');`,
`  await setControlValue(page, qtyInputs[0], '3');`,
  'E2E quantity replacement');

  source = replaceOnce(source,
`  await priceInputs[0].click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await priceInputs[0].type('1250000');`,
`  await setControlValue(page, priceInputs[0], '1250000');`,
  'E2E price replacement');

  fs.writeFileSync(path, source);
}

console.log('Applied customer-journey fixes: POS line identity + variant inventory + stable E2E inputs');

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';
const headers = { 'X-User-Id': '0979164124' }; // default user for testing

describe('AUTOTAX ERP - Core API E2E Tests', () => {
  
  test('1. POS System is alive (Products)', async () => {
    const res = await axios.get(`${API_BASE}/products`, { headers });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  test('2. Finance / Cash Flow Endpoint responds', async () => {
    const res = await axios.get(`${API_BASE}/finance/cash-flows`, { headers });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  test('3. CRM RFM Analysis returns correct schema', async () => {
    const res = await axios.get(`${API_BASE}/customers/rfm`, { headers });
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('stats');
    expect(res.data).toHaveProperty('customers');
    expect(Array.isArray(res.data.customers)).toBe(true);
  });

  test('4. AI Insights Endpoint generates insights', async () => {
    const res = await axios.get(`${API_BASE}/ai/insights`, { headers });
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('insight');
    expect(res.data).toHaveProperty('recommendation');
  });

});

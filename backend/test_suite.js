async function runTests() {
  console.log('--- STARTING AUTOMATED TESTS ---\n');
  const API = 'http://localhost:3001/api';
  
  const post = async (url, body, headers = {}) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    return res.json();
  };
  
  const get = async (url, headers = {}) => {
    const res = await fetch(url, { headers });
    return res.json();
  };

  // Test 1: Register User A
  const userA = { name: 'Shop A', phone: '0903333333', accessCode: '686868' };
  console.log('1. Registering User A:', userA.phone);
  let resA = await post(`${API}/auth/register`, userA);
  console.log(' -> Result:', resA);
  
  if (!resA.isNew) {
    console.log(' -> WARNING: User A already existed. Wow effect seeding might be skipped.');
  }

  // Wait a second for DB to settle
  await new Promise(r => setTimeout(r, 1000));

  // Fetch User A products
  let prodA = await get(`${API}/products`, { 'x-user-id': userA.phone });
  console.log(` -> User A Products Count: ${prodA.length}`);
  if (prodA.length < 3) throw new Error("Wow effect failed: Did not seed 3 products!");
  
  // Test 2: Register User B
  const userB = { name: 'Shop B', phone: '0904444444', accessCode: '686868' };
  console.log('\n2. Registering User B:', userB.phone);
  let resB = await post(`${API}/auth/register`, userB);
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Fetch User B products
  let prodB = await get(`${API}/products`, { 'x-user-id': userB.phone });
  console.log(` -> User B Products Count: ${prodB.length}`);
  if (prodB.length < 3) throw new Error("Wow effect failed for User B!");

  // Verify Isolation
  console.log('\n3. Verifying Multi-tenant Isolation...');
  const aFirstProd = prodA[0];
  const bFirstProd = prodB[0];
  if (aFirstProd.id === bFirstProd.id) {
    throw new Error(`DATA LEAK DETECTED: User A and User B share the same product ID ${aFirstProd.id}`);
  }
  console.log(' -> ISOLATION PASSED: Users have separate product records.');

  // Test 3: Add Custom Product for User A
  console.log('\n4. User A adds a new custom product...');
  await post(`${API}/products`, {
    name: 'Món đặc biệt của A',
    price: 99000
  }, { 'x-user-id': userA.phone });
  
  let prodA_after = await get(`${API}/products`, { 'x-user-id': userA.phone });
  let prodB_after = await get(`${API}/products`, { 'x-user-id': userB.phone });
  
  console.log(` -> User A product count: ${prodA_after.length}`);
  console.log(` -> User B product count: ${prodB_after.length}`);
  
  if (prodA_after.length === prodB_after.length) {
    throw new Error("DATA LEAK: User B can see User A's custom product!");
  }
  console.log(' -> ISOLATION PASSED: Custom product only visible to User A.');

  console.log('\n✅ ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
});

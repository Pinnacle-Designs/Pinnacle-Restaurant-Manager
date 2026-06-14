const BASE = process.env.ANALYTICS_TEST_URL || "http://localhost:3000";

async function login() {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "owner@pinnacle.com",
      password: "demo1234",
      demoMode: "seeded",
    }),
  });
  const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) throw new Error(`Login failed: ${loginRes.status}`);
  return cookie;
}

async function main() {
  const cookie = await login();
  const seedRes = await fetch(`${BASE}/api/seed`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  console.log("seed:", seedRes.status, await seedRes.text());

  const analyticsRes = await fetch(`${BASE}/api/analytics`, {
    headers: { Cookie: cookie },
  });
  const data = await analyticsRes.json();
  console.log("analytics:", analyticsRes.status);
  console.log("netSales:", data.sales?.netSales);
  console.log("orders in menu items:", data.sales?.byMenuItem?.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

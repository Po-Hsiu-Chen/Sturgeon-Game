export async function authWithLine(idToken: string) {
  const r = await fetch(`/auth/line`, {   // 不要寫死域名
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!r.ok) throw new Error('auth/line failed');
  return r.json();
}

export async function createLinePayOrder(userId: string, planId: string) {
  const apiBase = "http://localhost:3000"; // 之後須改成正式網域

  const r = await fetch(`${apiBase}/linepay/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, planId }),
  });

  if (!r.ok) throw new Error(`linepay/request failed: ${r.status}`);
  return r.json();
}


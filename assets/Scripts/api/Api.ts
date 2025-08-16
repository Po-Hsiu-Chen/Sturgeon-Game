export async function authWithLine(idToken: string) {
  const r = await fetch(`/auth/line`, {   // 不要寫死域名
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ idToken })
  });
  if (!r.ok) throw new Error('auth/line failed');
  return r.json();
}


import { sys } from 'cc';
declare const liff: any;

export async function initLiff(liffId: string) {
  if (!sys.isBrowser) return;                 // 非瀏覽器（原生）直接略過
  if (typeof (window as any).liff === 'undefined') {
    throw new Error('LIFF SDK not loaded');
  }
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) liff.login();
}

export async function getIdentity() {
  if (!sys.isBrowser || typeof (window as any).liff === 'undefined') {
    return { idToken: null, profile: null };
  }
  const profile = await liff.getProfile();    // { userId, displayName, pictureUrl }
  const idToken = liff.getIDToken();          // 後端驗證用
  return { idToken, profile };
}

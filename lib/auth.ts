import { cookies } from 'next/headers';
import { encrypt, decrypt, type UserSession } from './jwt';

export type { UserSession };

/**
 * Retrieves the currently logged-in user session from the cookie store.
 */
export async function getSession(): Promise<UserSession | null> {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  if (!sessionCookie) return null;
  return await decrypt(sessionCookie);
}

/**
 * Encrypts a new session and sets a secure, HTTP-only cookie.
 */
export async function setSessionCookie(userId: string, email: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const token = await encrypt({ userId, email });
  const cookieStore = cookies();
  
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Deletes the session cookie to log the user out.
 */
export async function deleteSessionCookie() {
  const cookieStore = cookies();
  cookieStore.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
    sameSite: 'lax',
    path: '/',
  });
}

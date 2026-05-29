import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secretKey = process.env.JWT_SECRET || 'nxtstile_default_jwt_secret_must_be_overridden_in_production_for_security';
const key = new TextEncoder().encode(secretKey);

export interface UserSession {
  userId: string;
  email: string;
}

/**
 * Encrypts a user session payload into a signed JWT.
 */
export async function encrypt(payload: UserSession): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

/**
 * Decrypts and verifies a session token. Returns null if invalid or expired.
 */
export async function decrypt(input: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(input, key, {
      algorithms: ['HS256'],
    });
    return {
      userId: payload.userId as string,
      email: payload.email as string,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Retrieves the currently logged-in user session from the cookie store.
 */
export async function getSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
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
  const cookieStore = await cookies();
  
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
  const cookieStore = await cookies();
  cookieStore.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
    sameSite: 'lax',
    path: '/',
  });
}

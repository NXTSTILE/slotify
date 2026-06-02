import { SignJWT, jwtVerify } from 'jose';

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

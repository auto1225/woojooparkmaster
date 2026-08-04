/**
 * 비밀번호 해싱·검증.
 * bcrypt cost 12는 2026년 기준 권장값(서버 1요청당 ~150ms).
 */
import bcrypt from "bcrypt";

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

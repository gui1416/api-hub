import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * Senha temporária pra criação de usuário/reset: 12 caracteres base64url
 * (~72 bits), exibida uma única vez pro admin repassar — só o hash persiste.
 */
export function generateTemporaryPassword(): string {
  return randomBytes(9).toString('base64url')
}

export const MIN_PASSWORD_LENGTH = 8

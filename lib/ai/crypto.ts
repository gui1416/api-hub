import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12

function getEncryptionKey(): Buffer {
  const key = process.env.AI_CONFIG_ENCRYPTION_KEY
  if (!key) {
    throw new Error('AI_CONFIG_ENCRYPTION_KEY não está configurado.')
  }
  let decoded: Buffer
  try {
    decoded = Buffer.from(key, 'base64')
  } catch {
    throw new Error('AI_CONFIG_ENCRYPTION_KEY não é uma string base64 válida.')
  }
  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `AI_CONFIG_ENCRYPTION_KEY deve decodificar para ${KEY_BYTES} bytes (recebeu ${decoded.length}).`,
    )
  }
  return decoded
}

/**
 * Encrypts `plaintext` with AES-256-GCM using a random IV per call, returning
 * a single string safe to store directly (e.g. in `aiProviders.apiKeyEncrypted`):
 * `<iv base64>:<authTag base64>:<ciphertext base64>`.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':')
}

/**
 * Reverses `encrypt`. Throws a clear error if `encrypted` isn't in the
 * expected `iv:authTag:ciphertext` shape, or if GCM authentication fails
 * (e.g. the ciphertext or auth tag was tampered with).
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey()
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error(
      'Formato inválido para valor criptografado: esperado "iv:authTag:ciphertext".',
    )
  }
  const [ivPart, authTagPart, ciphertextPart] = parts
  let iv: Buffer
  let authTag: Buffer
  let ciphertext: Buffer
  try {
    iv = Buffer.from(ivPart, 'base64')
    authTag = Buffer.from(authTagPart, 'base64')
    ciphertext = Buffer.from(ciphertextPart, 'base64')
  } catch {
    throw new Error('Formato inválido para valor criptografado: base64 malformado.')
  }
  if (iv.length !== IV_BYTES || authTag.length === 0 || ciphertext.length === 0) {
    throw new Error('Formato inválido para valor criptografado: componentes com tamanho inesperado.')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    throw new Error('Falha ao decriptar: autenticação GCM inválida (dado corrompido ou adulterado).')
  }
}

/** Returns the last 4 characters of `plaintext`, for display without ever decrypting. */
export function last4(plaintext: string): string {
  return plaintext.slice(-4)
}

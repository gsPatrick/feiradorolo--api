'use strict';

/**
 * Criptografia simétrica AES-256-GCM para segredos armazenados no banco
 * (payment_gateway_settings, integration_settings). Formato do ciphertext:
 *   base64( iv[12] | authTag[16] | ciphertext )  prefixado por "enc:v1:".
 * A master key vem de APP_ENCRYPTION_KEY (hex 32 bytes); em dev, derivada do
 * JWT_SECRET via scrypt.
 */
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function masterKey() {
  const hex = process.env.APP_ENCRYPTION_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  const secret = process.env.JWT_SECRET || 'feiradorolo-dev-secret';
  return crypto.scryptSync(secret, 'feiradorolo.encryption.salt', 32);
}

/** Cifra uma string. Retorna o ciphertext serializado (ou null se entrada vazia). */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const key = masterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decifra um ciphertext gerado por encrypt(). Retorna null se entrada vazia. */
function decrypt(payload) {
  if (!payload) return null;
  if (!String(payload).startsWith(PREFIX)) return payload; // compat: texto não cifrado
  const raw = Buffer.from(String(payload).slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

const encryptJson = (obj) => (obj == null ? null : encrypt(JSON.stringify(obj)));
const decryptJson = (payload) => {
  const txt = decrypt(payload);
  return txt == null ? null : JSON.parse(txt);
};

module.exports = { encrypt, decrypt, encryptJson, decryptJson };

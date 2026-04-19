import crypto from "node:crypto";

/**
 * AES-256-GCM 加密。格式：`v1:<ivHex>:<authTagHex>:<cipherHex>`
 * 主密钥来自 APP_SECRET（需要至少 32 字节 hex，即 64 字符）。
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("APP_SECRET 未配置；无法加密 / 解密敏感字段");
  }
  // 允许两种形式：hex(64) 或 任意字符串（做 sha256 派生）
  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(cipherText: string): string {
  const key = getKey();
  const [ver, ivHex, tagHex, dataHex] = cipherText.split(":");
  if (ver !== "v1" || !ivHex || !tagHex || !dataHex) {
    throw new Error("密文格式不正确");
  }
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

export function maskKey(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 8) return "*".repeat(plain.length);
  return `${plain.slice(0, 4)}${"*".repeat(Math.min(plain.length - 8, 16))}${plain.slice(-4)}`;
}

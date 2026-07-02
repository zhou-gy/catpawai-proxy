const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROJECT_EXTENSION_JS = path.resolve(__dirname, '..', 'vendor', 'catpaw-extension', 'extension.js');
const WINDOWS_EXTENSION_JS =
  'D:\\Programs\\CatPawAI\\resources\\app\\extensions\\mt-idekit.mt-idekit-code\\out\\extension.js';
const XOR_KEY = 'ThisIsMyXorKey';

let cachedKeys;

function xorDecipher(encoded, key = XOR_KEY) {
  if (!encoded || !key) return '';
  const input = Buffer.from(encoded, 'base64').toString('binary');
  let output = '';
  for (let index = 0; index < input.length; index += 1) {
    const sourceCode = input.charCodeAt(index);
    const keyCode = key.charCodeAt(index % key.length);
    output += String.fromCharCode(sourceCode ^ keyCode);
  }
  return output;
}

function resolveDefaultExtensionPath() {
  if (fs.existsSync(PROJECT_EXTENSION_JS)) return PROJECT_EXTENSION_JS;
  return WINDOWS_EXTENSION_JS;
}

function readKeyPairFromExtension(extensionPath = resolveDefaultExtensionPath()) {
  if (cachedKeys && cachedKeys.extensionPath === extensionPath) return cachedKeys;
  const source = fs.readFileSync(extensionPath, 'utf8');
  const matches = [...source.matchAll(/this\.key([12])=this\.xorDecipher\("([^"]+)",this\.xorKey\)/g)];
  const encodedByName = new Map(matches.map((match) => [`key${match[1]}`, match[2]]));
  const publicKey = xorDecipher(encodedByName.get('key1'));
  const privateKey = xorDecipher(encodedByName.get('key2'));
  if (!publicKey.includes('BEGIN PUBLIC KEY') || !privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error('CatPawAI encryption keys were not found in the installed extension.');
  }
  cachedKeys = { extensionPath, publicKey, privateKey };
  return cachedKeys;
}

function createCatPawCrypto({ publicKey, privateKey }) {
  if (!publicKey || !privateKey) {
    throw new Error('CatPawAI encryption requires both public and private keys.');
  }

  function generateAesKey() {
    return crypto.randomBytes(16);
  }

  function encryptAesKey(aesKey) {
    const encodedAesKey = Buffer.from(aesKey.toString('base64'));
    return crypto
      .publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha1',
        },
        encodedAesKey
      )
      .toString('base64');
  }

  function decryptAesKey(encryptedKey) {
    const encrypted = Buffer.from(encryptedKey, 'base64');
    const encodedAesKey = crypto
      .privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha1',
        },
        encrypted
      )
      .toString();
    return Buffer.from(encodedAesKey, 'base64');
  }

  function encryptWithAes(payload, aesKey) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null);
    return cipher.update(text, 'utf8', 'base64') + cipher.final('base64');
  }

  function decryptWithAes(payload, aesKey) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', aesKey, null);
    const text = decipher.update(payload, 'base64', 'utf8') + decipher.final('utf8');
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  function encryptRequest(payload, headers) {
    const aesKey = generateAesKey();
    const encryptedPayload = encryptWithAes(payload, aesKey);
    headers['encrypted-key'] = encryptAesKey(aesKey);
    return encryptedPayload;
  }

  function decryptResponse(payload, headers) {
    const encryptedKey = headers?.['encrypted-key'] || headers?.get?.('encrypted-key');
    if (!encryptedKey || !payload) return payload;
    const aesKey = decryptAesKey(encryptedKey);
    const encryptedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return decryptWithAes(encryptedPayload, aesKey);
  }

  return {
    decryptResponse,
    encryptRequest,
    encryptWithAes,
    decryptWithAes,
  };
}

function createInstalledCatPawCrypto(env = process.env) {
  const extensionPath = env.CATPAWAI_EXTENSION_JS || resolveDefaultExtensionPath();
  const { publicKey, privateKey } = readKeyPairFromExtension(extensionPath);
  return createCatPawCrypto({ publicKey, privateKey });
}

function shouldEncryptCatPawTraffic(env = process.env) {
  const value = String(env.CATPAWAI_ENCRYPTION || 'auto').toLowerCase();
  if (value === '0' || value === 'false' || value === 'off') return false;
  if (value === '1' || value === 'true' || value === 'on') return true;
  return (env.CATPAWAI_AUTH_MODE || '').toLowerCase() === 'catpaw' || Boolean(env.CATPAWAI_ACCESS_TOKEN);
}

module.exports = {
  DEFAULT_EXTENSION_JS: WINDOWS_EXTENSION_JS,
  PROJECT_EXTENSION_JS,
  WINDOWS_EXTENSION_JS,
  createCatPawCrypto,
  createInstalledCatPawCrypto,
  readKeyPairFromExtension,
  resolveDefaultExtensionPath,
  shouldEncryptCatPawTraffic,
  xorDecipher,
};

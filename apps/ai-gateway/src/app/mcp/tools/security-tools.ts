import { createTool, getToolRegistry } from '../tool-registry';
import crypto from 'crypto';

/** ─── generate_password ──────────────────────────────────────────── */

const generatePassword = createTool(
  {
    name: 'generate_password',
    description:
      'Generate a cryptographically secure random password with configurable length and character sets.',
    category: 'security',
    tags: ['password', 'generate', 'security', 'random'],
    parameters: {
      type: 'object',
      properties: {
        length: { type: 'number', description: 'Password length. Default: 16' },
        include_uppercase: {
          type: 'boolean',
          description: 'Include A-Z. Default: true',
        },
        include_lowercase: {
          type: 'boolean',
          description: 'Include a-z. Default: true',
        },
        include_digits: {
          type: 'boolean',
          description: 'Include 0-9. Default: true',
        },
        include_symbols: {
          type: 'boolean',
          description: 'Include special chars. Default: true',
        },
        exclude_ambiguous: {
          type: 'boolean',
          description: 'Exclude ambiguous chars (0,O,I,l,1). Default: false',
        },
        count: {
          type: 'number',
          description: 'Number of passwords to generate. Default: 1, max: 20',
        },
      },
      required: [],
    },
  },
  async (params) => {
    const length = Math.min(Math.max((params.length as number) ?? 16, 4), 256);
    const count = Math.min(Math.max((params.count as number) ?? 1, 1), 20);
    const useUpper = (params.include_uppercase as boolean) ?? true;
    const useLower = (params.include_lowercase as boolean) ?? true;
    const useDigits = (params.include_digits as boolean) ?? true;
    const useSymbols = (params.include_symbols as boolean) ?? true;
    const excludeAmbiguous = (params.exclude_ambiguous as boolean) ?? false;

    const AMBIGUOUS = new Set('0O1lI');
    let charset = '';
    if (useUpper) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (useLower) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (useDigits) charset += '0123456789';
    if (useSymbols) charset += '!@#$%^&*()-_=+[]{}|;:,.<>?';

    if (excludeAmbiguous)
      charset = charset
        .split('')
        .filter((c) => !AMBIGUOUS.has(c))
        .join('');
    if (!charset)
      return {
        success: false,
        error: 'At least one character set must be selected',
      };

    const passwords = Array.from({ length: count }, () => {
      const bytes = crypto.randomBytes(length * 2);
      let pw = '';
      let i = 0;
      while (pw.length < length) {
        const byte = bytes[i++ % bytes.length];
        if (byte < Math.floor(256 / charset.length) * charset.length) {
          pw += charset[byte % charset.length];
        }
      }
      return pw;
    });

    return {
      success: true,
      data: {
        passwords: count === 1 ? undefined : passwords,
        password: count === 1 ? passwords[0] : undefined,
        length,
        charset_size: charset.length,
        entropy_bits: parseFloat(
          (Math.log2(charset.length) * length).toFixed(1)
        ),
      },
    };
  }
);

/** ─── generate_uuid ──────────────────────────────────────────────── */

const generateUuid = createTool(
  {
    name: 'generate_uuid',
    description:
      'Generate UUID(s). Supports v4 (random) and v7 (time-ordered).',
    category: 'security',
    tags: ['uuid', 'guid', 'generate', 'id'],
    parameters: {
      type: 'object',
      properties: {
        version: {
          type: 'string',
          enum: ['v4', 'v7'],
          description:
            'UUID version: "v4" (random) or "v7" (time-ordered, sortable). Default: v4',
        },
        count: {
          type: 'number',
          description: 'Number of UUIDs to generate. Default: 1, max: 100',
        },
        uppercase: {
          type: 'boolean',
          description: 'Return in uppercase. Default: false',
        },
      },
      required: [],
    },
  },
  async (params) => {
    const version = (params.version as string) ?? 'v4';
    const count = Math.min(Math.max((params.count as number) ?? 1, 1), 100);
    const upper = (params.uppercase as boolean) ?? false;

    const uuids = Array.from({ length: count }, () => {
      let uuid: string;
      if (version === 'v4') {
        uuid = crypto.randomUUID();
      } else {
        // UUIDv7: 48-bit unix timestamp in ms + 4-bit version (0111) + 12-bit random + 2-bit variant (10) + 62-bit random
        const ms = BigInt(Date.now());
        const randA = crypto.randomBytes(2);
        const randB = crypto.randomBytes(8);

        const msHex = ms.toString(16).padStart(12, '0');
        const randAVal = (((randA[0] & 0x0f) << 8) | randA[1])
          .toString(16)
          .padStart(3, '0');
        const randBHex = randB.toString('hex');

        uuid = `${msHex.slice(0, 8)}-${msHex.slice(8, 12)}-7${randAVal}-${(
          (parseInt(randBHex.slice(0, 2), 16) & 0x3f) |
          0x80
        ).toString(16)}${randBHex.slice(2, 4)}-${randBHex.slice(4, 16)}`;
      }
      return upper ? uuid.toUpperCase() : uuid;
    });

    return {
      success: true,
      data: {
        version,
        uuids: count > 1 ? uuids : undefined,
        uuid: count === 1 ? uuids[0] : undefined,
        count,
      },
    };
  }
);

/** ─── hash_text ──────────────────────────────────────────────────── */

const hashText = createTool(
  {
    name: 'hash_text',
    description:
      'Hash a string using MD5, SHA-1, SHA-256, SHA-512, or SHA-3. Optionally compute HMAC.',
    category: 'security',
    tags: ['hash', 'sha', 'md5', 'hmac', 'security'],
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Input text to hash' },
        algorithm: {
          type: 'string',
          enum: ['md5', 'sha1', 'sha256', 'sha512', 'sha3-256', 'sha3-512'],
          description: 'Hashing algorithm. Default: sha256',
        },
        encoding: {
          type: 'string',
          enum: ['hex', 'base64', 'binary'],
          description: 'Output encoding. Default: hex',
        },
        hmac_key: {
          type: 'string',
          description:
            'Optional HMAC secret key (produces HMAC instead of plain hash)',
        },
      },
      required: ['text'],
    },
  },
  async (params) => {
    const text = params.text as string;
    const algorithm = (params.algorithm as string) ?? 'sha256';
    const encoding = ((params.encoding as string) ??
      'hex') as crypto.BinaryToTextEncoding;
    const hmacKey = params.hmac_key as string | undefined;

    try {
      let hash: string;
      if (hmacKey) {
        hash = crypto
          .createHmac(algorithm, hmacKey)
          .update(text, 'utf8')
          .digest(encoding);
      } else {
        hash = crypto
          .createHash(algorithm)
          .update(text, 'utf8')
          .digest(encoding);
      }

      return {
        success: true,
        data: {
          input: text,
          algorithm,
          encoding,
          type: hmacKey ? 'hmac' : 'hash',
          hash,
          length_bits: algorithm.includes('512')
            ? 512
            : algorithm.includes('256')
            ? 256
            : algorithm === 'sha1'
            ? 160
            : 128,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `Algorithm "${algorithm}" not supported: ${
          (e as Error).message
        }`,
      };
    }
  }
);

/** ─── check_password_strength ────────────────────────────────────── */

const COMMON_PASSWORDS = new Set([
  'password',
  '123456',
  'password1',
  '12345678',
  'abc123',
  'qwerty',
  'letmein',
  'monkey',
  'dragon',
  'master',
  'sunshine',
  'princess',
  'iloveyou',
  'shadow',
  'superman',
  '1234567890',
  'password123',
  'admin',
  'login',
  'welcome',
]);

const checkPasswordStrength = createTool(
  {
    name: 'check_password_strength',
    description:
      'Evaluate password strength (0-4 score), estimate crack time, and get actionable improvement suggestions.',
    category: 'security',
    tags: ['password', 'strength', 'security'],
    parameters: {
      type: 'object',
      properties: {
        password: { type: 'string', description: 'Password to evaluate' },
      },
      required: ['password'],
    },
  },
  async (params) => {
    const pw = params.password as string;
    const issues: string[] = [];
    let score = 0;

    // Check common passwords
    if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
      return {
        success: true,
        data: {
          score: 0,
          label: 'Very Weak',
          issues: [
            'This is one of the most commonly used passwords — never use it',
          ],
          estimated_crack_time: 'Instantly',
        },
      };
    }

    // Length scoring
    if (pw.length >= 8) score++;
    else issues.push('Use at least 8 characters');
    if (pw.length >= 12) score++;
    else if (pw.length >= 8) issues.push('Consider using 12+ characters');
    if (pw.length >= 20) score++;
    if (pw.length < 8) score = 0;

    // Character variety
    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    const hasDigit = /\d/.test(pw);
    const hasSymbol = /[^A-Za-z0-9]/.test(pw);
    const varietyCount = [hasUpper, hasLower, hasDigit, hasSymbol].filter(
      Boolean
    ).length;

    if (varietyCount >= 3) score++;
    else {
      if (!hasUpper) issues.push('Add uppercase letters');
      if (!hasLower) issues.push('Add lowercase letters');
      if (!hasDigit) issues.push('Add numbers');
      if (!hasSymbol) issues.push('Add symbols (!@#$%...)');
    }

    // Penalise patterns
    if (/(.)\1{2,}/.test(pw)) {
      score = Math.max(score - 1, 0);
      issues.push('Avoid repeating characters (e.g. "aaa")');
    }
    if (/^[a-zA-Z]+\d{1,4}$/.test(pw)) {
      score = Math.max(score - 1, 0);
      issues.push('Avoid word + simple number pattern');
    }
    if (
      /012|123|234|345|456|567|678|789|890|abc|bcd|cde|qwerty|qwert/i.test(pw)
    ) {
      score = Math.max(score - 1, 0);
      issues.push('Avoid sequential characters or keyboard patterns');
    }

    score = Math.min(4, Math.max(0, score));

    const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    const crackTimes = [
      'Instantly',
      'Seconds to minutes',
      'Hours to days',
      'Months to years',
      'Centuries+',
    ];

    // Entropy estimate
    let charsetSize = 0;
    if (hasLower) charsetSize += 26;
    if (hasUpper) charsetSize += 26;
    if (hasDigit) charsetSize += 10;
    if (hasSymbol) charsetSize += 32;
    const entropy = charsetSize > 0 ? Math.log2(charsetSize) * pw.length : 0;

    return {
      success: true,
      data: {
        score,
        label: labels[score],
        estimated_crack_time: crackTimes[score],
        entropy_bits: parseFloat(entropy.toFixed(1)),
        length: pw.length,
        has_uppercase: hasUpper,
        has_lowercase: hasLower,
        has_digits: hasDigit,
        has_symbols: hasSymbol,
        issues: issues.length ? issues : undefined,
        suggestions:
          score < 4
            ? [
                'Use a passphrase of 4+ random words',
                'Use a password manager to generate and store passwords',
                'Enable multi-factor authentication (MFA)',
              ]
            : undefined,
      },
    };
  }
);

/** ─── generate_totp_uri ──────────────────────────────────────────── */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function toBase32(buf: Buffer): string {
  let result = '';
  let bits = 0,
    value = 0;
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32_CHARS[(value << (5 - bits)) & 31];
  // Pad to multiple of 8
  while (result.length % 8 !== 0) result += '=';
  return result;
}

const generateTotpUri = createTool(
  {
    name: 'generate_totp_uri',
    description:
      'Generate a TOTP (Time-based One-Time Password) secret and otpauth:// URI for use with authenticator apps like Google Authenticator or Authy.',
    category: 'security',
    tags: ['totp', 'mfa', '2fa', 'otp', 'security'],
    parameters: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description:
            'Account label shown in the authenticator app (e.g. "user@example.com")',
        },
        issuer: {
          type: 'string',
          description: 'Service/issuer name (e.g. "MyApp")',
        },
        algorithm: {
          type: 'string',
          enum: ['SHA1', 'SHA256', 'SHA512'],
          description:
            'HMAC algorithm. Most apps only support SHA1. Default: SHA1',
        },
        digits: {
          type: 'number',
          description: 'OTP digits (6 or 8). Default: 6',
        },
        period: {
          type: 'number',
          description: 'Token validity period in seconds. Default: 30',
        },
        secret: {
          type: 'string',
          description:
            'Existing base32 secret to use (optional, generates new if omitted)',
        },
      },
      required: ['label'],
    },
  },
  async (params) => {
    const label = params.label as string;
    const issuer = (params.issuer as string) ?? '';
    const algorithm = (params.algorithm as string) ?? 'SHA1';
    const digits = (params.digits as number) ?? 6;
    const period = (params.period as number) ?? 30;

    let secret: string;
    if (params.secret) {
      secret = (params.secret as string).toUpperCase().replace(/\s/g, '');
    } else {
      const rawSecret = crypto.randomBytes(20);
      secret = toBase32(rawSecret);
    }

    const encodedLabel = encodeURIComponent(
      issuer ? `${issuer}:${label}` : label
    );
    const params_str = new URLSearchParams({
      secret,
      algorithm,
      digits: String(digits),
      period: String(period),
      ...(issuer ? { issuer } : {}),
    });

    const uri = `otpauth://totp/${encodedLabel}?${params_str.toString()}`;

    return {
      success: true,
      data: {
        secret,
        uri,
        label,
        issuer: issuer || undefined,
        algorithm,
        digits,
        period,
        qr_code_url: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
          uri
        )}&size=200x200`,
        instructions:
          'Scan the QR code or manually enter the secret in your authenticator app. Store the secret key securely — it cannot be recovered if lost.',
        warning:
          'This secret will appear in plain text. Only share it with the intended user via a secure channel.',
      },
    };
  }
);

// Register all security tools
const registry = getToolRegistry();
registry.register(generatePassword);
registry.register(generateUuid);
registry.register(hashText);
registry.register(checkPasswordStrength);
registry.register(generateTotpUri);

export {
  generatePassword,
  generateUuid,
  hashText,
  checkPasswordStrength,
  generateTotpUri,
};

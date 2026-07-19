export interface CryptoPolicy {
  readonly weakHashes: ReadonlySet<string>;
  readonly weakCiphers: readonly RegExp[];
  readonly ecbModes: readonly RegExp[];
  readonly minimumPbkdf2Iterations: number;
  readonly minimumRsaBits: number;
  readonly tokenNamePattern: RegExp;
  readonly cryptoMaterialNamePattern: RegExp;
  readonly passwordNamePattern: RegExp;
  readonly customCryptoNamePattern: RegExp;
}

export const DEFAULT_CRYPTO_POLICY: CryptoPolicy = {
  weakHashes: new Set([
    "md2",
    "md4",
    "md5",
    "ripemd128",
    "sha",
    "sha1",
    "sha-1",
  ]),
  weakCiphers: [
    /^des(?:-|$)/i,
    /^des-ede(?:3)?(?:-|$)/i,
    /^rc2(?:-|$)/i,
    /^rc4(?:-|$)/i,
    /^bf(?:-|$)/i,
    /^blowfish(?:-|$)/i,
    /^idea(?:-|$)/i,
  ],
  ecbModes: [/-ecb$/i, /^aes-ecb$/i],
  minimumPbkdf2Iterations: 210_000,
  minimumRsaBits: 2048,
  tokenNamePattern: /(?:token|session|csrf|nonce|otp|reset|invite|verification|authcode|securitycode)/i,
  cryptoMaterialNamePattern: /(?:key|salt|secret|seed|nonce|iv$|initialization.?vector)/i,
  passwordNamePattern: /(?:password|passwd|passphrase|pwd)/i,
  customCryptoNamePattern: /(?:encrypt|decrypt|cipher|decipher|hash|digest|derivekey|sign|verify)/i,
};

export function normalizeCryptoAlgorithm(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

export function isWeakHash(policy: CryptoPolicy, algorithm: string): boolean {
  return policy.weakHashes.has(normalizeCryptoAlgorithm(algorithm));
}

export function isWeakCipher(policy: CryptoPolicy, algorithm: string): boolean {
  const normalized = normalizeCryptoAlgorithm(algorithm);
  return policy.weakCiphers.some((pattern) => pattern.test(normalized));
}

export function isEcbMode(policy: CryptoPolicy, algorithm: string): boolean {
  const normalized = normalizeCryptoAlgorithm(algorithm);
  return policy.ecbModes.some((pattern) => pattern.test(normalized));
}

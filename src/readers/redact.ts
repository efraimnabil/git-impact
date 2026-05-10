/**
 * Privacy filter: scrubs sensitive paths and obvious secret-looking values
 * from git activity before it reaches the translator.
 *
 * Default-on. Users can disable via `context.json` { "privacy": { "redact": false } }
 * or extend the file/value patterns there.
 *
 * Why this exists: a manager update that leaks an API key, a customer name,
 * or an internal-only filename is a real career incident. The defaults here
 * are conservative — better to redact a benign filename than to leak.
 */

const DEFAULT_FILE_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..+)?$/i,                       // .env, .env.local, .env.production
  /(^|\/)\.npmrc$/i,                            // npm auth token file
  /(^|\/)\.pypirc$/i,                           // PyPI auth
  /(^|\/)\.netrc$/i,                            // generic auth tokens
  /(^|\/)\.aws\//i,                             // .aws/credentials etc.
  /(^|\/)\.ssh\//i,                             // private keys, known_hosts
  /(^|\/).*credentials.*$/i,                    // anything literally named credentials
  /(^|\/).*secret.*$/i,                         // anything with "secret" in the name
  /(^|\/).*\.pem$/i,                            // PEM private keys
  /(^|\/).*\.p12$/i,                            // PKCS12 keys
  /(^|\/).*\.key$/i,                            // generic .key files
];

// Things that look like leaked secrets in a commit message body or PR text.
// Conservative — we'd rather redact legit text than leak a token.
const DEFAULT_VALUE_PATTERNS: RegExp[] = [
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,             // Stripe keys
  /\bAKIA[0-9A-Z]{16}\b/g,                                     // AWS access key id
  /\bghp_[A-Za-z0-9]{36}\b/g,                                  // GitHub personal access token
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,                         // GitHub fine-grained PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,                         // Slack tokens
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,    // JWT-shaped strings
];

export interface RedactConfig {
  enabled: boolean;
  /** Extra file glob-ish patterns the user wants redacted. */
  filePatterns?: string[];
  /** Extra string patterns to redact from commit bodies. */
  valuePatterns?: string[];
}

const DEFAULT_CONFIG: RedactConfig = { enabled: true };

/**
 * Replace a filename with `[redacted-secret-file]` if it matches any sensitive
 * pattern. Otherwise return as-is. Pure function — safe to map over arrays.
 */
export function redactFilename(file: string, cfg: RedactConfig = DEFAULT_CONFIG): string {
  if (!cfg.enabled) return file;
  const patterns = [
    ...DEFAULT_FILE_PATTERNS,
    ...(cfg.filePatterns ?? []).map(globishToRegex),
  ];
  return patterns.some((p) => p.test(file)) ? "[redacted-secret-file]" : file;
}

/**
 * Scrub obvious-looking secrets from a free-text string (commit body, PR text).
 * Filenames are not redacted here — use `redactFilename` for those.
 */
export function redactText(text: string, cfg: RedactConfig = DEFAULT_CONFIG): string {
  if (!cfg.enabled || !text) return text;
  const patterns = [
    ...DEFAULT_VALUE_PATTERNS,
    ...(cfg.valuePatterns ?? []).map((s) => new RegExp(s, "g")),
  ];
  let out = text;
  for (const p of patterns) {
    out = out.replace(p, "[redacted-secret]");
  }
  return out;
}

/**
 * Convert a simple glob (*.env, foo/**, secret-*) into a RegExp. Not full glob —
 * just `*` (any chars except slash) and `**` (any chars). Anchored to full path.
 */
function globishToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLESTAR::/g, ".*");
  return new RegExp(`(^|/)${escaped}$`, "i");
}

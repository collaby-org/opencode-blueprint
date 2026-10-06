// Sanitizer core ported verbatim from opencode-log-sanitizer v1 (src/sanitizer.ts).
export interface SanitizerConfig {
  maxStringLength: number;
  enableJwtDetection: boolean;
  enableBcryptDetection: boolean;
  enableBase64Detection: boolean;
  debug: boolean;
  debugLogFile: string;
}

const DEFAULT_CONFIG: SanitizerConfig = {
  maxStringLength: 300,
  enableJwtDetection: true,
  enableBcryptDetection: true,
  enableBase64Detection: true,
  debug: false,
  debugLogFile: "~/.local/share/opencode/opencode-log-sanitizer.debug.log",
};

export function resolveConfig(config?: Partial<SanitizerConfig>): SanitizerConfig {
  if (!config) return { ...DEFAULT_CONFIG };
  return { ...DEFAULT_CONFIG, ...config };
}

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BCRYPT_PATTERN = /\$2[aby]\$\d{2}\$[A-Za-z0-9./]{53}/g;
const BASE64_PATTERN_300 = /(?=[A-Za-z0-9+/]*[+/])[A-Za-z0-9+/]{300,}={0,2}/g;

const base64PatternCache = new Map<number, RegExp>();

function getBase64Pattern(minLength: number): RegExp {
  if (minLength === 300) return BASE64_PATTERN_300;
  let pattern = base64PatternCache.get(minLength);
  if (!pattern) {
    pattern = new RegExp(`(?=[A-Za-z0-9+/]*[+/])[A-Za-z0-9+/]{${minLength},}={0,2}`, "g");
    base64PatternCache.set(minLength, pattern);
  }
  return pattern;
}

const NO_REDACT_OPEN = "<no-redact>";
const NO_REDACT_PATTERN = /<no-redact>([\s\S]*?)<\/no-redact>/g;

function extractNoRedactBlocks(text: string): { text: string; blocks: Array<{ placeholder: string; content: string }> } {
  const blocks: Array<{ placeholder: string; content: string }> = [];
  const result = text.replace(NO_REDACT_PATTERN, (match) => {
    const placeholder = `__NR${blocks.length}__`;
    blocks.push({ placeholder, content: match });
    return placeholder;
  });
  return { text: result, blocks };
}

function restoreNoRedactBlocks(
  text: string,
  blocks: Array<{ placeholder: string; content: string }>,
): string {
  if (blocks.length === 0) return text;
  const map: Record<string, string> = {};
  for (const b of blocks) map[b.placeholder] = b.content;
  return text.replace(/__NR\d+__/g, (ph) => map[ph] ?? ph);
}

function redactJwt(text: string): { text: string; count: number } {
  let count = 0;
  JWT_PATTERN.lastIndex = 0;
  const result = text.replace(JWT_PATTERN, () => {
    count++;
    return "[redacted:jwt]";
  });
  return { text: result, count };
}

function redactBcrypt(text: string): { text: string; count: number } {
  let count = 0;
  BCRYPT_PATTERN.lastIndex = 0;
  const result = text.replace(BCRYPT_PATTERN, () => {
    count++;
    return "[redacted:bcrypt]";
  });
  return { text: result, count };
}

function redactBase64(text: string, minLength: number): { text: string; count: number } {
  const pattern = getBase64Pattern(minLength);
  pattern.lastIndex = 0;
  let count = 0;
  const result = text.replace(pattern, (match) => {
    count++;
    return `[redacted:base64:${match.length}chars]`;
  });
  return { text: result, count };
}

function redactLongStrings(text: string, maxLength: number): { text: string; count: number } {
  const parts: string[] = [];
  let i = 0;
  let segStart = 0;
  let count = 0;
  const len = text.length;
  while (i < len) {
    const ch = text[i];
    if (ch !== '"' && ch !== "'") {
      i++;
      continue;
    }
    const openQuote = ch;
    let j = i + 1;
    let contentLength = 0;
    let closed = false;
    while (j < len) {
      const c = text[j];
      if (c === "\\") {
        j += 2;
        contentLength++;
        continue;
      }
      if (c === openQuote) {
        closed = true;
        j++;
        break;
      }
      contentLength++;
      j++;
    }
    if (!closed) {
      i++;
      continue;
    }
    const attributePrefix = text.slice(Math.max(0, i - 16), i);
    const isHtmlClassAttribute = /(?:class|className)\s*=\s*$/u.test(attributePrefix);
    if (contentLength > maxLength && !isHtmlClassAttribute) {
      parts.push(text.slice(segStart, i));
      parts.push('"redacted"');
      count++;
      i = j;
      segStart = j;
    } else {
      i = j;
    }
  }
  if (segStart < len) parts.push(text.slice(segStart));
  return { text: parts.join(""), count };
}

export interface SanitizeResult {
  text: string;
  redactionCount: number;
  redactions: { jwt: number; bcrypt: number; base64: number; longString: number };
}

export function sanitize(text: string, cfg: SanitizerConfig): SanitizeResult {
  if (!text) {
    return { text, redactionCount: 0, redactions: { jwt: 0, bcrypt: 0, base64: 0, longString: 0 } };
  }
  let totalRedactions = 0;
  const redactions = { jwt: 0, bcrypt: 0, base64: 0, longString: 0 };
  const hasNoRedact = text.includes(NO_REDACT_OPEN);
  let current = text;
  let blocks: Array<{ placeholder: string; content: string }> = [];
  if (hasNoRedact) {
    const extracted = extractNoRedactBlocks(text);
    current = extracted.text;
    blocks = extracted.blocks;
  }
  if (cfg.enableJwtDetection && current.includes("eyJ")) {
    const r = redactJwt(current);
    current = r.text;
    totalRedactions += r.count;
    redactions.jwt += r.count;
  }
  if (cfg.enableBcryptDetection && current.includes("$2")) {
    const r = redactBcrypt(current);
    current = r.text;
    totalRedactions += r.count;
    redactions.bcrypt += r.count;
  }
  if (cfg.enableBase64Detection && (current.includes("+") || current.includes("/"))) {
    const r = redactBase64(current, cfg.maxStringLength);
    current = r.text;
    totalRedactions += r.count;
    redactions.base64 += r.count;
  }
  const t5 = redactLongStrings(current, cfg.maxStringLength);
  current = t5.text;
  totalRedactions += t5.count;
  redactions.longString += t5.count;
  if (hasNoRedact) {
    current = restoreNoRedactBlocks(current, blocks);
  }
  return { text: current, redactionCount: totalRedactions, redactions };
}

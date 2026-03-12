import { MantleMcpError } from "../errors.js";

function isIpv4(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

function isPrivateIpv4(host: string): boolean {
  if (!isIpv4(host)) {
    return false;
  }
  const octets = host.split(".").map((part) => Number(part));
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80")
  );
}

function isLocalHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function parseAllowlist(): string[] {
  const raw = process.env.MANTLE_ALLOWED_ENDPOINT_DOMAINS ?? "";
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatchesAllowlist(host: string, allowlist: string[]): boolean {
  const normalized = host.toLowerCase();
  return allowlist.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

export function ensureEndpointAllowed(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new MantleMcpError(
      "ENDPOINT_NOT_ALLOWED",
      `Invalid endpoint URL: ${endpoint}`,
      "Provide a valid absolute endpoint URL.",
      { endpoint }
    );
  }

  const host = url.hostname;
  const allowHttpLocal = process.env.MANTLE_ALLOW_HTTP_LOCAL_ENDPOINTS === "true";
  const allowLoopbackHttp = allowHttpLocal && url.protocol === "http:" && isLocalHost(host);

  if (url.protocol !== "https:" && !allowLoopbackHttp) {
    throw new MantleMcpError(
      "ENDPOINT_NOT_ALLOWED",
      `Endpoint protocol not allowed: ${url.protocol}`,
      "Use https:// endpoints, or enable local http for localhost only.",
      { endpoint: url.toString() }
    );
  }

  if (!allowLoopbackHttp && (isPrivateIpv4(host) || isBlockedIpv6(host))) {
    throw new MantleMcpError(
      "ENDPOINT_NOT_ALLOWED",
      `Endpoint host is private or local and is not allowed: ${host}`,
      "Use a public endpoint host.",
      { endpoint: url.toString(), host }
    );
  }

  const metadataHosts = new Set(["169.254.169.254", "metadata.google.internal"]);
  if (metadataHosts.has(host.toLowerCase())) {
    throw new MantleMcpError(
      "ENDPOINT_NOT_ALLOWED",
      `Metadata endpoint is blocked: ${host}`,
      "Use a non-metadata endpoint.",
      { endpoint: url.toString(), host }
    );
  }

  const allowlist = parseAllowlist();
  if (allowlist.length > 0 && !hostMatchesAllowlist(host, allowlist)) {
    throw new MantleMcpError(
      "ENDPOINT_NOT_ALLOWED",
      `Endpoint host is not in allowlist: ${host}`,
      "Set MANTLE_ALLOWED_ENDPOINT_DOMAINS to include this host, or use an allowed endpoint.",
      { endpoint: url.toString(), host, allowlist }
    );
  }

  return url;
}

const SQL_MUTATION_PATTERN = /\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i;

export function ensureReadOnlySql(query: string): void {
  if (SQL_MUTATION_PATTERN.test(query)) {
    throw new MantleMcpError(
      "INDEXER_ERROR",
      "SQL mutation statements are not allowed.",
      "Submit read-only SELECT queries only.",
      { query }
    );
  }
}

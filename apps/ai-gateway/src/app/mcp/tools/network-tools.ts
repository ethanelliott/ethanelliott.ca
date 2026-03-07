import { createTool, getToolRegistry } from '../tool-registry';
import { promises as dns } from 'dns';
import https from 'https';

/** ─── get_ip_info ────────────────────────────────────────────────── */

const getIpInfo = createTool(
  {
    name: 'get_ip_info',
    description:
      'Look up geolocation and ASN information for an IP address (or the calling machine if IP is omitted).',
    category: 'network',
    tags: ['ip', 'geolocation', 'network'],
    parameters: {
      type: 'object',
      properties: {
        ip: {
          type: 'string',
          description:
            "IPv4 or IPv6 address. Omit for the current machine's public IP.",
        },
      },
      required: [],
    },
  },
  async (params) => {
    const ip = (params.ip as string) ?? '';
    try {
      const res = await fetch(`https://ipapi.co/${ip}/json/`, {
        headers: { 'User-Agent': 'ai-gateway/1.0' },
      });
      if (!res.ok)
        return { success: false, error: `ipapi.co returned ${res.status}` };
      const data = (await res.json()) as Record<string, unknown>;
      if (data.error)
        return { success: false, error: String(data.reason ?? data.error) };
      return {
        success: true,
        data: {
          ip: data.ip,
          country: data.country_name,
          country_code: data.country_code,
          region: data.region,
          city: data.city,
          postal: data.postal,
          latitude: data.latitude,
          longitude: data.longitude,
          timezone: data.timezone,
          isp: data.org,
          asn: data.asn,
          is_eu: data.in_eu,
        },
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }
);

/** ─── dns_lookup ─────────────────────────────────────────────────── */

const dnsLookup = createTool(
  {
    name: 'dns_lookup',
    description:
      'Perform DNS lookups for A, AAAA, MX, TXT, NS, CNAME, SOA, or reverse PTR records.',
    category: 'network',
    tags: ['dns', 'network'],
    parameters: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'Hostname or IP (for PTR) to look up',
        },
        type: {
          type: 'string',
          enum: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'PTR', 'ANY'],
          description: 'DNS record type. Default: A',
        },
      },
      required: ['hostname'],
    },
  },
  async (params) => {
    const hostname = params.hostname as string;
    const type = ((params.type as string) ?? 'A').toUpperCase();

    try {
      let records: unknown;
      switch (type) {
        case 'A':
          records = await dns.resolve4(hostname);
          break;
        case 'AAAA':
          records = await dns.resolve6(hostname);
          break;
        case 'MX':
          records = await dns.resolveMx(hostname);
          break;
        case 'TXT':
          records = await dns.resolveTxt(hostname);
          break;
        case 'NS':
          records = await dns.resolveNs(hostname);
          break;
        case 'CNAME':
          records = await dns.resolveCname(hostname);
          break;
        case 'SOA':
          records = await dns.resolveSoa(hostname);
          break;
        case 'PTR':
          records = await dns.reverse(hostname);
          break;
        case 'ANY':
          records = await dns.resolveAny(hostname);
          break;
        default:
          return { success: false, error: `Unsupported record type: ${type}` };
      }
      return { success: true, data: { hostname, type, records } };
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      return {
        success: false,
        error:
          err.code === 'ENOTFOUND'
            ? `No DNS records found for ${hostname}`
            : err.message,
      };
    }
  }
);

/** ─── ping_url ───────────────────────────────────────────────────── */

const pingUrl = createTool(
  {
    name: 'ping_url',
    description:
      'Check if a URL is reachable and measure HTTP response time and status.',
    category: 'network',
    tags: ['ping', 'http', 'uptime', 'network'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to ping' },
        method: {
          type: 'string',
          enum: ['HEAD', 'GET'],
          description: 'HTTP method to use. Default: HEAD',
        },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds. Default: 5000',
        },
      },
      required: ['url'],
    },
  },
  async (params) => {
    const url = params.url as string;
    const method = (params.method as string) ?? 'HEAD';
    const timeoutMs = (params.timeout_ms as number) ?? 5000;

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);
      const latency = Date.now() - start;

      return {
        success: true,
        data: {
          url,
          reachable: true,
          status: res.status,
          status_text: res.statusText,
          latency_ms: latency,
          content_type: res.headers.get('content-type'),
          server: res.headers.get('server'),
          redirected: res.redirected,
          final_url: res.redirected ? res.url : undefined,
        },
      };
    } catch (e: unknown) {
      const latency = Date.now() - start;
      const err = e as Error;
      return {
        success: true,
        data: {
          url,
          reachable: false,
          error:
            err.name === 'AbortError'
              ? `Timeout after ${timeoutMs}ms`
              : err.message,
          latency_ms: latency,
        },
      };
    }
  }
);

/** ─── parse_url ──────────────────────────────────────────────────── */

const parseUrl = createTool(
  {
    name: 'parse_url',
    description:
      'Parse a URL into its components: protocol, host, path, query params, hash, etc.',
    category: 'network',
    tags: ['url', 'parse', 'network'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to parse' },
      },
      required: ['url'],
    },
  },
  async (params) => {
    try {
      const u = new URL(params.url as string);
      const queryParams: Record<string, string | string[]> = {};
      u.searchParams.forEach((value, key) => {
        if (key in queryParams) {
          const existing = queryParams[key];
          queryParams[key] = Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
        } else {
          queryParams[key] = value;
        }
      });

      return {
        success: true,
        data: {
          original: params.url,
          protocol: u.protocol.replace(':', ''),
          username: u.username || undefined,
          password: u.password ? '***' : undefined,
          hostname: u.hostname,
          port: u.port || undefined,
          host: u.host,
          pathname: u.pathname,
          search: u.search || undefined,
          query_params: Object.keys(queryParams).length
            ? queryParams
            : undefined,
          hash: u.hash || undefined,
          origin: u.origin,
          is_secure: u.protocol === 'https:',
          path_segments: u.pathname.split('/').filter(Boolean),
        },
      };
    } catch (e) {
      return { success: false, error: `Invalid URL: ${(e as Error).message}` };
    }
  }
);

/** ─── qr_code_url ────────────────────────────────────────────────── */

const qrCodeUrl = createTool(
  {
    name: 'qr_code_url',
    description:
      'Generate a QR code image URL for any text or URL using the free qrserver.com API.',
    category: 'network',
    tags: ['qr', 'code', 'image'],
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'Text or URL to encode in the QR code',
        },
        size: {
          type: 'number',
          description: 'QR code size in pixels (square). Default: 200',
        },
        error_correction: {
          type: 'string',
          enum: ['L', 'M', 'Q', 'H'],
          description:
            'Error correction level: L (7%), M (15%), Q (25%), H (30%). Default: M',
        },
        format: {
          type: 'string',
          enum: ['png', 'svg', 'eps', 'pdf'],
          description: 'Output format. Default: png',
        },
      },
      required: ['data'],
    },
  },
  async (params) => {
    const data = params.data as string;
    const size = (params.size as number) ?? 200;
    const ecc = (params.error_correction as string) ?? 'M';
    const fmt = (params.format as string) ?? 'png';

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
      data
    )}&size=${size}x${size}&ecc=${ecc}&format=${fmt}`;

    return {
      success: true,
      data: {
        qr_url: qrUrl,
        data,
        size: `${size}x${size}`,
        error_correction: ecc,
        format: fmt,
        note: 'Image is served directly from qrserver.com. No API key required.',
      },
    };
  }
);

/** ─── shorten_url ────────────────────────────────────────────────── */

const shortenUrl = createTool(
  {
    name: 'shorten_url',
    description: 'Shorten a URL using the free is.gd service.',
    category: 'network',
    tags: ['url', 'shorten', 'link'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Long URL to shorten' },
        custom_alias: {
          type: 'string',
          description: 'Optional custom alias (is.gd may reject if taken)',
        },
      },
      required: ['url'],
    },
  },
  async (params) => {
    const url = params.url as string;
    const alias = params.custom_alias as string | undefined;

    try {
      let apiUrl = `https://is.gd/create.php?format=json&url=${encodeURIComponent(
        url
      )}`;
      if (alias) apiUrl += `&shorturl=${encodeURIComponent(alias)}`;

      const res = await fetch(apiUrl, {
        headers: { 'User-Agent': 'ai-gateway/1.0' },
      });
      if (!res.ok)
        return { success: false, error: `is.gd returned ${res.status}` };
      const data = (await res.json()) as Record<string, string>;

      if (data.errorcode)
        return {
          success: false,
          error: data.errormessage ?? `Error ${data.errorcode}`,
        };
      return {
        success: true,
        data: { original_url: url, short_url: data.shorturl, service: 'is.gd' },
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }
);

/** ─── check_ssl_cert ─────────────────────────────────────────────── */

const checkSslCert = createTool(
  {
    name: 'check_ssl_cert',
    description:
      'Inspect the SSL/TLS certificate of a domain: validity dates, issuer, SANs, and days until expiry.',
    category: 'network',
    tags: ['ssl', 'tls', 'certificate', 'security', 'network'],
    parameters: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'Domain name to inspect (e.g. "github.com")',
        },
        port: {
          type: 'number',
          description: 'Port to connect on. Default: 443',
        },
      },
      required: ['hostname'],
    },
  },
  async (params) => {
    const hostname = (params.hostname as string)
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    const port = (params.port as number) ?? 443;

    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname,
          port,
          method: 'HEAD',
          rejectUnauthorized: false,
          timeout: 5000,
        },
        (res) => {
          const socket = res.socket as import('tls').TLSSocket;
          const cert = socket.getPeerCertificate(true);
          if (!cert || Object.keys(cert).length === 0) {
            resolve({ success: false, error: 'No certificate returned' });
            return;
          }

          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const daysLeft = Math.floor(
            (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          const isValid = now >= validFrom && now <= validTo;

          const altNames: string[] = cert.subjectaltname
            ? cert.subjectaltname
                .split(', ')
                .map((s: string) => s.replace(/^DNS:/, ''))
            : [];

          resolve({
            success: true,
            data: {
              hostname,
              is_valid: isValid,
              days_until_expiry: daysLeft,
              expires_soon: daysLeft < 30,
              valid_from: validFrom.toISOString(),
              valid_to: validTo.toISOString(),
              subject: cert.subject,
              issuer: cert.issuer,
              san: altNames.slice(0, 20),
              serial: cert.serialNumber,
              fingerprint_sha256: cert.fingerprint256 ?? cert.fingerprint,
              chain_length: cert.issuerCertificate ? 2 : 1,
              protocol: socket.getProtocol?.() ?? undefined,
              cipher: socket.getCipher?.()?.name ?? undefined,
            },
          });
          req.destroy();
        }
      );

      req.on('error', (e) => resolve({ success: false, error: e.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Connection timed out' });
      });
      req.end();
    });
  }
);

// Register all network tools
const registry = getToolRegistry();
registry.register(getIpInfo);
registry.register(dnsLookup);
registry.register(pingUrl);
registry.register(parseUrl);
registry.register(qrCodeUrl);
registry.register(shortenUrl);
registry.register(checkSslCert);

export {
  getIpInfo,
  dnsLookup,
  pingUrl,
  parseUrl,
  qrCodeUrl,
  shortenUrl,
  checkSslCert,
};

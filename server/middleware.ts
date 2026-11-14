import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';

/**
 * Strips ASCII control characters (except optional newlines/tabs) and clamps length.
 */
export function sanitizeText(value: unknown, maxLength: number, allowNewlines = false): string {
  if (typeof value !== 'string') return '';
  const pattern = allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.replace(pattern, '').trim().slice(0, maxLength);
}

/**
 * Safe iframe-compatible security headers.
 * Deliberately omits X-Frame-Options: DENY so AI Studio preview iframe remains functional.
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
}

/**
 * Structured HTTP request/latency logger for API routes.
 */
export function apiRequestLogger(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api/')) {
    return next();
  }
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    if (res.statusCode >= 400 || durationMs > 1000) {
      console.log(
        JSON.stringify({
          level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs,
        })
      );
    }
  });
  next();
}

interface RateBucket {
  timestamps: number[];
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

/**
 * In-memory sliding-window per-IP rate limiter with bounded bucket cleanup.
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const buckets = new Map<string, RateBucket>();

  const pruneTimer = setInterval(() => {
    const cutoff = Date.now() - options.windowMs;
    for (const [key, bucket] of buckets.entries()) {
      const active = bucket.timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        buckets.delete(key);
      } else {
        bucket.timestamps = active;
      }
    }
  }, Math.max(30_000, options.windowMs));
  pruneTimer.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${options.keyPrefix}:${clientIp}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const bucket = buckets.get(key) || { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= options.maxRequests) {
      const oldest = bucket.timestamps[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((oldest + options.windowMs) / 1000)));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Please retry in ${retryAfterSec}s.`,
      });
      return;
    }

    bucket.timestamps.push(now);
    buckets.set(key, bucket);

    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.maxRequests - bucket.timestamps.length)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + options.windowMs) / 1000)));
    next();
  };
}

/**
 * Intercepts malformed JSON request bodies with structured HTTP 400 JSON.
 */
export const jsonSyntaxErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err && err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'Malformed JSON payload in request body.',
    });
    return;
  }
  next(err);
};

/**
 * Final API error handler returning structured JSON without leaking internals.
 */
export const centralErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error(
    JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status,
      message: err?.message || 'Unhandled server error',
    })
  );
  if (res.headersSent) return;
  res.status(status).json({
    success: false,
    error: status === 500 ? 'Internal server error processing request.' : String(err?.message || 'Request error'),
  });
};

// =========================================================================
// Endpoint Input Validators
// =========================================================================

export function validateScoutPayload(body: any): {
  valid: boolean;
  error?: string;
  data?: {
    homeTeam: string;
    awayTeam: string;
    competition: string;
    venue: string;
    kickoffTimeUtc: string;
  };
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const homeTeam = sanitizeText(body.homeTeam, 100);
  const awayTeam = sanitizeText(body.awayTeam, 100);
  if (!homeTeam || !awayTeam) {
    return { valid: false, error: 'Both homeTeam and awayTeam are required (1-100 characters).' };
  }
  if (homeTeam.toLowerCase() === awayTeam.toLowerCase()) {
    return { valid: false, error: 'homeTeam and awayTeam must be distinct teams.' };
  }
  return {
    valid: true,
    data: {
      homeTeam,
      awayTeam,
      competition: sanitizeText(body.competition, 120) || 'International / League Football',
      venue: sanitizeText(body.venue, 120) || 'Match Stadium',
      kickoffTimeUtc: sanitizeText(body.kickoffTimeUtc, 64) || 'Current Matchday',
    },
  };
}

export function validateChatPayload(body: any): {
  valid: boolean;
  error?: string;
  data?: {
    model: string;
    message: string;
    history: { role: 'user' | 'model'; text: string }[];
    fixtureContext: Record<string, unknown> | null;
    enableSearchGrounding: boolean;
  };
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const message = sanitizeText(body.message, 4000, true);
  if (!message) {
    return { valid: false, error: 'Message text is required (max 4,000 characters).' };
  }

  const rawHistory = Array.isArray(body.history) ? body.history.slice(-40) : [];
  const history = rawHistory
    .filter((item: any) => item && typeof item === 'object' && typeof item.text === 'string')
    .map((item: any) => ({
      role: (item.role === 'model' ? 'model' : 'user') as 'user' | 'model',
      text: sanitizeText(item.text, 4000, true),
    }))
    .filter((item: { text: string }) => item.text.length > 0);

  let fixtureContext: Record<string, unknown> | null = null;
  if (body.fixtureContext && typeof body.fixtureContext === 'object' && !Array.isArray(body.fixtureContext)) {
    const serialized = JSON.stringify(body.fixtureContext);
    if (serialized.length <= 16_000) {
      fixtureContext = body.fixtureContext;
    } else {
      return { valid: false, error: 'Attached fixtureContext exceeds maximum size (16 KB).' };
    }
  }

  return {
    valid: true,
    data: {
      model: sanitizeText(body.model, 64) || 'gemini-4-hydrogen',
      message,
      history,
      fixtureContext,
      enableSearchGrounding: body.enableSearchGrounding !== false,
    },
  };
}

export function validateVeoPayload(body: any): {
  valid: boolean;
  error?: string;
  data?: {
    prompt: string;
    imageBase64?: string;
    mimeType: string;
    aspectRatio: '16:9' | '9:16';
  };
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const aspectRatio = body.aspectRatio || '16:9';
  if (aspectRatio !== '16:9' && aspectRatio !== '9:16') {
    return { valid: false, error: 'aspectRatio must be strictly "16:9" or "9:16".' };
  }

  const prompt =
    sanitizeText(body.prompt, 1000, true) ||
    'Cinematic slow-motion football match camera dolly shot with vibrant stadium atmosphere and floodlights';

  let imageBase64: string | undefined;
  let mimeType = sanitizeText(body.mimeType, 40) || 'image/jpeg';

  if (typeof body.imageBase64 === 'string' && body.imageBase64.trim().length > 0) {
    const trimmed = body.imageBase64.trim();
    const mimeMatch = trimmed.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,/i);
    let extracted = '';
    if (mimeMatch) {
      mimeType = mimeMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : mimeMatch[1].toLowerCase();
      extracted = trimmed.slice(mimeMatch[0].length);
    } else if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
      extracted = trimmed;
    } else {
      return { valid: false, error: 'imageBase64 must be a valid base64-encoded image string or data URL.' };
    }
    if (extracted.length > 15_000_000) {
      return { valid: false, error: 'Uploaded image exceeds maximum 10 MB payload size.' };
    }
    imageBase64 = extracted;
  }

  return {
    valid: true,
    data: { prompt, imageBase64, mimeType, aspectRatio },
  };
}

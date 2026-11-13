import type { NotificationService } from './notifications/service.js';
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { TokenVerifier } from './auth/token.js';
import type { AppConfig } from './config/env.js';
import { jobRoutes, type JobHandler } from './jobs/routes.js';
import type { ReplayGuard } from './jobs/replay-guard.js';
import type { FieldCrypto } from './lib/crypto.js';
import { ApiError } from './lib/errors.js';
import type { Logger } from './lib/logger.js';
import { problemResponse } from './lib/problem.js';
import { payloadLogger } from './middleware/payload-logger.js';
import { rateLimit, type RateLimiter } from './middleware/rate-limit.js';
import { adminKybRoutes } from './modules/admin/kyb.js';
import { adminLotRoutes } from './modules/admin/lots.js';
import { adminReconciliationRoutes } from './modules/admin/reconciliation.js';
import { adminRoutes } from './modules/admin/routes.js';
import { adminBookingActionRoutes } from './modules/admin/booking-actions.js';
import { adminSupportRoutes } from './modules/admin/support.js';
import type { AuthAdmin } from './providers/auth-admin.js';
import { adminDataRequestRoutes } from './modules/admin/data-requests.js';
import { adminNetwork } from './middleware/admin-network.js';
import { adminIncidentRoutes } from './modules/admin/incidents.js';
import { privacyRoutes } from './modules/me/privacy-routes.js';
import { adminLotSuspensionRoutes } from './modules/admin/lot-suspension.js';
import { adminPlatformSettingsRoutes } from './modules/admin/platform-settings.js';
import { authRoutes } from './modules/auth/routes.js';
import { healthRoutes, type ReadinessCheck } from './modules/health/routes.js';
import { sendEmailHook } from './modules/hooks/send-email.js';
import { sendSmsHook } from './modules/hooks/send-sms.js';
import { meRoutes } from './modules/me/routes.js';
import { kybRoutes } from './modules/kyb/routes.js';
import { lotRoutes } from './modules/lots/routes.js';
import { operatorRoutes } from './modules/operators/routes.js';
import { operatorBookingRoutes } from './modules/operator-bookings/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { teamRoutes } from './modules/team/routes.js';
import { discoveryRoutes } from './modules/discovery/routes.js';
import { placesRoutes } from './modules/places/routes.js';
import { attendRoutes } from './modules/attend/routes.js';
import { bookingRoutes } from './modules/bookings/routes.js';
import { passRoutes } from './modules/passes/routes.js';
import { webhookRoutes } from './modules/webhooks/routes.js';
import type {
  IdentityVerificationProvider,
  MapsProvider,
  MalwareScanner,
  EmailProvider,
  PaymentProvider,
  SettlementProvider,
  SmsProvider,
  StorageProvider,
} from './providers/index.js';
import type { SessionRevoker } from './providers/supabase-sessions.js';
import type { Store } from './store/types.js';

export type AppDeps = {
  config: Pick<
    AppConfig,
    'appEnv' | 'corsOrigins' | 'jobHmacSecret' | 'smsHookSecret' | 'paystackWebhookIps'
  > & { adminIpAllowlist?: string; logPayloads?: boolean; testShortStays?: boolean };
  logger: Logger;
  readinessChecks: Record<string, ReadinessCheck>;
  rateLimiter: RateLimiter;
  replayGuard: ReplayGuard;
  jobs: Record<string, JobHandler>;
  now: () => Date;
  store: Store;
  verifyToken: TokenVerifier;
  crypto: FieldCrypto;
  sms: { primary: SmsProvider; secondary?: SmsProvider };
  /** Supabase Send Email Hook (ADR 0022): auth emails rendered by us, sent by `provider`. */
  authEmail?: { provider: EmailProvider; hookSecret: string; supabaseUrl: string };
  /** Queues booking and session notifications (ADR 0020). */
  notifications: NotificationService;
  sessions: SessionRevoker;
  /** Supabase Auth admin calls with the secret key (account erasure, doc 06 section 6.1). */
  authAdmin: AuthAdmin;
  settlement: SettlementProvider;
  /** Paystack checkout, verify and refunds (same key as settlement). */
  payments: PaymentProvider;
  /** Optional Flutterwave fallback payment provider (FR-PAY-007). */
  flutterwavePayments?: PaymentProvider;
  /** Nigerian identity verification (FRSC Driver's License / NIN, FR-AUTH-009). */
  identityVerification: IdentityVerificationProvider;
  storage: StorageProvider;
  scanner: MalwareScanner;
  maps: MapsProvider;
  /** FR-INC-004: pages on-call ops for a critical incident. Unset: an error-level log. */
  pageOnCall?: (alert: { incidentId: string; lotName: string; category: string }) => Promise<void>;
  /** Sentry in deployed envs; omitted locally and in tests. */
  reportError?: (err: unknown, ctx: { requestId: string | undefined; path: string }) => void;
};

export type AppEnv = { Variables: RequestIdVariables };

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        throw new ApiError('VALIDATION_FAILED', 'Request validation failed', {
          errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
    },
  });

  app.use(requestId());
  app.use(
    secureHeaders({
      xFrameOptions: 'DENY',
      strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
      // Inline styles only, for the signed receipt page; scripts stay blocked (gap review S-3).
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        styleSrc: ["'unsafe-inline'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: 'no-referrer',
    }),
  );
  app.use(
    cors({
      origin: (origin) => (deps.config.corsOrigins.includes(origin) ? origin : null),
      allowHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['x-request-id', 'retry-after'],
      maxAge: 600,
    }),
  );

  if (deps.config.logPayloads) {
    app.use('*', payloadLogger());
  }

  // Signed by pg_cron / Supabase Auth; not rate limited by IP (Supabase egress is shared).
  app.route(
    '/internal/jobs',
    jobRoutes({
      secret: deps.config.jobHmacSecret,
      jobs: deps.jobs,
      replayGuard: deps.replayGuard,
      now: deps.now,
    }),
  );
  app.route('/hooks', sendSmsHook(deps));
  app.route('/hooks', sendEmailHook(deps));

  app.use('*', rateLimit(deps.rateLimiter, deps.now));
  app.use('/v1/admin/*', adminNetwork(deps.config.adminIpAllowlist ?? '', deps.logger));
  app.route('/health', healthRoutes(deps.readinessChecks));
  app.route('/v1', authRoutes(deps));
  app.route('/v1', meRoutes(deps));
  app.route('/v1', operatorRoutes(deps));
  app.route('/v1', kybRoutes(deps));
  app.route('/v1', lotRoutes(deps));
  app.route('/v1', adminRoutes(deps));
  app.route('/v1', adminKybRoutes(deps));
  app.route('/v1', adminLotRoutes(deps));
  app.route('/v1', adminReconciliationRoutes(deps));
  app.route('/v1', adminSupportRoutes(deps));
  app.route('/v1', adminBookingActionRoutes(deps));
  app.route('/v1', adminIncidentRoutes(deps));
  app.route('/v1', adminDataRequestRoutes(deps));
  app.route('/v1', privacyRoutes(deps));
  app.route('/v1', adminLotSuspensionRoutes(deps));
  app.route('/v1', adminPlatformSettingsRoutes(deps));
  app.route('/v1', teamRoutes(deps));
  app.route('/v1', operatorBookingRoutes(deps));
  app.route('/v1', reportRoutes(deps));
  app.route('/v1', discoveryRoutes(deps));
  app.route('/v1', placesRoutes(deps));
  app.route('/v1', bookingRoutes(deps));
  app.route('/v1', passRoutes(deps));
  app.route('/v1', attendRoutes(deps));
  app.route('/v1', webhookRoutes(deps));

  app.notFound((c) => problemResponse(c, new ApiError('NOT_FOUND')));
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      if (err.status >= 500) {
        deps.logger.error({ err, requestId: c.get('requestId') }, err.code);
        deps.reportError?.(err, { requestId: c.get('requestId'), path: c.req.path });
      }
      return problemResponse(c, err);
    }
    deps.logger.error({ err, requestId: c.get('requestId'), path: c.req.path }, 'unhandled error');
    deps.reportError?.(err, { requestId: c.get('requestId'), path: c.req.path });
    return problemResponse(c, new ApiError('INTERNAL_ERROR'));
  });

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Supabase Auth access token (ES256)',
  });
  if (deps.config.appEnv !== 'prod') {
    app.doc31('/openapi.json', {
      openapi: '3.1.0',
      info: { title: 'Parkly API', version: '0.1.0' },
    });
  }

  return app;
}

export type App = ReturnType<typeof createApp>;

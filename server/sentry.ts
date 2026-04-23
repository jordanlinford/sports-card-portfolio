import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1, // Sample 10% of transactions for performance
    beforeSend(event) {
      // Strip sensitive data from error reports
      if (event.request?.headers) {
        delete event.request.headers["cookie"];
        delete event.request.headers["authorization"];
        delete event.request.headers["x-qa-token"];
      }
      return event;
    },
  });
  console.log("[Sentry] Error tracking initialized");
} else {
  console.log("[Sentry] No SENTRY_DSN set, error tracking disabled");
}

export { Sentry };

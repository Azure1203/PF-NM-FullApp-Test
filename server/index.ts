import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

// Increase server timeout for large file uploads (5 minutes)
httpServer.timeout = 300000;
httpServer.keepAliveTimeout = 300000;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '50mb', // Increase limit for large CSV imports
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      
      // Background sync job: Sync Asana statuses every 5 minutes
      const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      const runBackgroundSync = async () => {
        try {
          const response = await fetch(`http://localhost:${port}/api/sync-all-asana-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (response.ok) {
            const result = await response.json();
            log(`Background Asana sync completed: ${result.updated} projects updated`, 'sync');
          }
        } catch (err) {
          log(`Background Asana sync failed: ${err}`, 'sync');
        }
      };
      
      // Run backfill migration for existing orders (runs once on startup)
      import('./backfillMigration').then(({ runBackfillMigration }) => {
        runBackfillMigration();
      }).catch(err => {
        log(`Failed to run backfill migration: ${err}`, 'migration');
      });
      
      // Run initial sync after 1 minute (to let server fully initialize)
      setTimeout(() => {
        runBackgroundSync();
        // Then run every 5 minutes
        setInterval(runBackgroundSync, SYNC_INTERVAL);
        log(`Background Asana sync scheduled (every 5 minutes)`, 'sync');
        
        // Start Outlook sync after 2 minutes, then every 15 minutes
        // Uses direct function call to bypass authentication
        import('./outlookScheduler').then(({ startOutlookScheduler }) => {
          setTimeout(() => {
            startOutlookScheduler();
          }, 60000);
        }).catch(err => {
          log(`Failed to load Outlook scheduler: ${err}`, 'outlook');
        });

        if (process.env.AGENTMAIL_API_KEY) {
          import('./agentmailScheduler').then(({ startAgentMailScheduler }) => {
            startAgentMailScheduler();
          }).catch(err => {
            log(`Failed to load AgentMail scheduler: ${err}`, 'agentmail');
          });
        }
        
        import('./backupScheduler').then(({ startBackupScheduler }) => {
          startBackupScheduler();
        }).catch(err => {
          log(`Failed to load backup scheduler: ${err}`, 'backup');
        });
        
        import('./asanaImportScheduler').then(({ startAsanaImportScheduler }) => {
          setTimeout(() => {
            startAsanaImportScheduler();
          }, 120000);
        }).catch(err => {
          log(`Failed to load Asana import scheduler: ${err}`, 'asana-import');
        });

        import('./asanaNotesScheduler').then(({ startAsanaNotesScheduler }) => {
          startAsanaNotesScheduler();
        }).catch(err => {
          log(`Failed to load Asana notes scheduler: ${err}`, 'asana-notes');
        });
      }, 60000);
    },
  );
})();

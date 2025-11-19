import { Scraper } from "@the-convocation/twitter-scraper";
import { DBType, Schema } from "db";
import { eq } from "drizzle-orm";
import ora from "ora";
import { Cookie } from "tough-cookie";
import { oraPrefixer } from "utils/logs";

export async function createTwitterClient({
  twitterPassword,
  twitterUsername,
  db,
}: {
  twitterUsername?: string;
  twitterPassword?: string;
  db: DBType;
}): Promise<Scraper> {
  const log = ora({
    color: "gray",
    prefixText: oraPrefixer("𝕏 client"),
  }).start("connecting to twitter...");
  
  let client: Scraper;
  let usingCycleTLS = false;
  
  // Try to use cycleTLS, fall back to regular fetch if it fails
  try {
    const { cycleTLSFetch } = await import('@the-convocation/twitter-scraper/cycletls');
    client = new Scraper({
      fetch: cycleTLSFetch,
      rateLimitStrategy: {
        async onRateLimit(e) {
          console.error("Rate limit hit:", e);
          throw new Error("Rate limited");
        },
      },
    });
    usingCycleTLS = true;
    console.log("Using cycleTLS for requests");
  } catch (cycleTLSError) {
    console.warn("cycleTLS initialization failed, falling back to standard fetch:", cycleTLSError);
    client = new Scraper({
      rateLimitStrategy: {
        async onRateLimit(e) {
          console.error("Rate limit hit:", e);
          throw new Error("Rate limited");
        },
      },
    });
  }
  
  if (!twitterPassword || !twitterUsername) {
    log.warn("connected as guest | replies will not be synced");
    return client;
  }
  
  try {
    const prevCookie = await db
      .select()
      .from(Schema.TwitterCookieCache)
      .where(eq(Schema.TwitterCookieCache.userHandle, twitterUsername));
    const cookie = prevCookie.length ? prevCookie[0].cookie : null;
    
    if (cookie) {
      log.text = "restoring session from cache...";
      const cookies: Cookie[] = (JSON.parse(cookie) as unknown[])
        .map((o) => Cookie.fromJSON(o) as Cookie)
        .filter((o) => o);
      await client.setCookies(cookies.map((c) => c.toString()));
    }
    
    const loggedIn = await client.isLoggedIn();
    
    if (loggedIn) {
      log.succeed(`connected (session restored)${usingCycleTLS ? ' with cycleTLS' : ''}`);
    } else {
      log.text = "logging in with credentials...";
      await client.login(twitterUsername, twitterPassword);
      
      const loginVerified = await client.isLoggedIn();
      if (loginVerified) {
        log.succeed(`connected (using credentials)${usingCycleTLS ? ' with cycleTLS' : ''}`);
      } else {
        throw new Error("Login failed - could not verify authentication");
      }
    }
    
    if (await client.isLoggedIn()) {
      const cookies = await client.getCookies();
      const cookieString = JSON.stringify(cookies);
      await db
        .insert(Schema.TwitterCookieCache)
        .values({
          userHandle: twitterUsername,
          cookie: cookieString,
        })
        .onConflictDoUpdate({
          target: Schema.TwitterCookieCache.userHandle,
          set: {
            cookie: cookieString,
          },
        });
    }
  } catch (e) {
    log.fail(`Unable to login: ${e}`);
    console.error("Full error details:", e);
  } finally {
    log.stop();
  }
  
  return client;
}

// Cleanup handler - only if cycleTLS is available
let cleanupRegistered = false;
if (!cleanupRegistered) {
  cleanupRegistered = true;
  process.on('SIGINT', async () => {
    try {
      const { cycleTLSExit } = await import('@the-convocation/twitter-scraper/cycletls');
      cycleTLSExit();
    } catch {}
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    try {
      const { cycleTLSExit } = await import('@the-convocation/twitter-scraper/cycletls');
      cycleTLSExit();
    } catch {}
    process.exit(0);
  });
}

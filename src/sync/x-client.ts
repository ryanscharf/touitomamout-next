import { Scraper } from "@the-convocation/twitter-scraper";
import { type DBType, Schema } from "~/db";
import { eq } from "drizzle-orm";
import ora from "ora";
import { Cookie } from "tough-cookie";
import { debug, oraPrefix } from "~/utils/logs";
import { cycleTLSFetch } from "@the-convocation/twitter-scraper/cycletls";
import {
  formatTwitterAuthError,
  parseTwitterCookies,
  TwitterCookieError,
} from "./x-auth";

export async function createTwitterClient({
  twitterPassword,
  twitterUsername,
  twitterCookies,
  db,
}: {
  twitterUsername?: string;
  twitterPassword?: string;
  twitterCookies?: string;
  db: DBType;
}): Promise<Scraper> {
  const log = ora({
    color: "gray",
    prefixText: oraPrefix("𝕏 client"),
  }).start("connecting to X...");

  const client = new Scraper({
    // Fetch: fetch,
    fetch: cycleTLSFetch as typeof fetch,
    rateLimitStrategy: {
      async onRateLimit(e) {
        debug("Rate limited by X:", e);
        throw new Error("Rate limited by X");
      },
    },
  });
  const hasCredentials = Boolean(twitterPassword && twitterUsername);
  if (!twitterCookies && !hasCredentials) {
    log.warn("connected as guest | some features may be limited");
    log.stop();
    return client;
  }

  try {
    let sessionSource: "supplied cookies" | "session restored" | undefined;

    if (twitterCookies) {
      await client.setCookies(parseTwitterCookies(twitterCookies));
      sessionSource = "supplied cookies";
    } else if (twitterUsername) {
      const previousCookie = await db
        .select()
        .from(Schema.TwitterCookieCache)
        .where(eq(Schema.TwitterCookieCache.userHandle, twitterUsername));
      const cookie =
        previousCookie.length > 0 ? previousCookie[0]!.cookie : undefined;

      if (cookie) {
        const cookies: Cookie[] = (JSON.parse(cookie) as unknown[])
          .map((o) => Cookie.fromJSON(o)!)
          .filter(Boolean);
        await client.setCookies(cookies.map((c) => c.toString()));
        sessionSource = "session restored";
      }
    }

    let loggedIn = await client.isLoggedIn();
    if (loggedIn) {
      log.succeed(`connected (${sessionSource})`);
    } else if (hasCredentials) {
      await client.login(twitterUsername!, twitterPassword!);
      loggedIn = await client.isLoggedIn();
      if (!loggedIn) {
        throw new TwitterCookieError(
          "X did not establish an authenticated session",
        );
      }
      log.succeed("connected (using credentials)");
    } else {
      throw new TwitterCookieError(
        "the supplied cookies were rejected or have expired",
      );
    }

    if (loggedIn && twitterUsername) {
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
  } catch (error) {
    log.warn(formatTwitterAuthError(error, Boolean(twitterCookies)));
  } finally {
    log.stop();
  }

  return client;
}

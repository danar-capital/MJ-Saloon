/** Cloudflare Worker entry point for the MJ website and staff PWA. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { drainStaffPushOutbox, markPushCronHeartbeat } from "../lib/push-server";
import { stripSitesIdentityHeaders } from "../lib/hosting-security";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MJ_HOSTING?: string;
  MJ_RELEASE_SHA?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function secureResponse(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// SVG sources skip image optimization by default. Keep the existing image
// security policy and platform optimizer when moving between hosting targets.
const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (env.MJ_HOSTING === "cloudflare") {
      // A direct Worker has no trusted ChatGPT identity-injection gateway.
      // Normal username/password staff sessions and private install tokens remain.
      request = stripSitesIdentityHeaders(request);
      if (url.pathname === "/_meta/release") {
        if (request.method !== "GET") return secureResponse(request, new Response(null, { status: 405, headers: { Allow: "GET" } }));
        return secureResponse(request, Response.json(
          { hosting: "cloudflare", commit: env.MJ_RELEASE_SHA ?? null },
          { headers: { "Cache-Control": "no-store" } },
        ));
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return secureResponse(request, response);
    }

    return secureResponse(request, await handler.fetch(request, env, ctx));
  },
  async scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.allSettled([
      markPushCronHeartbeat(),
      drainStaffPushOutbox(),
    ]));
  },
};

export default worker;

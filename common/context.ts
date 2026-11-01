import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Identity of the caller for the request being handled (HTTP mode only).
 *
 * In HTTP mode the server sits behind an authentication gateway that has
 * already authenticated the person and forwards their own Planka API key in a
 * header. Each request runs inside `requestContext.run(...)`, so every Planka
 * call made while handling it uses that key, and only that key.
 *
 * In stdio mode there is no context and the environment variables apply.
 */
export type RequestContext = {
  /**
   * The caller's personal Planka API key, sent as `X-Api-Key`. `null` for a
   * keyless request (tool catalogue only): any Planka call then fails.
   */
  apiKey: string | null;
  /**
   * The caller's Planka user id, resolved lazily from `/api/users/me` and
   * cached for the rest of the request. `null` once a lookup has failed.
   */
  userId?: string | null;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

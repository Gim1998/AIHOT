import { AsyncLocalStorage } from "node:async_hooks";

const deadline = new AsyncLocalStorage<AbortSignal>();

/** A cron invocation owns its deadline; concurrent page/API requests keep their own context. */
export function withinDeadline<T>(milliseconds: number, fn: () => Promise<T>): Promise<T> {
  return deadline.run(AbortSignal.timeout(milliseconds), fn);
}

export function invocationSignal(): AbortSignal | undefined {
  return deadline.getStore();
}

import { consola } from "consola"
import { Elysia } from "elysia"

const map = new WeakMap<Request, { prefix: string; start: number }>()

export const logger = new Elysia()
  .onRequest(({ request }) => {
    const state = {
      prefix: `[${request.method}] ${new URL(request.url).pathname}`,
      start: performance.now(),
    }
    consola.start(state.prefix)
    map.set(request, state)
  })
  .onAfterResponse(({ request, set }) => {
    const state = map.get(request)
    if (!state) {
      return
    }

    const status = Number(set.status ?? 200)
    const time = String(Math.round(performance.now() - state.start)) + "ms"

    if (Number(status) >= 400) {
      consola.fail(state.prefix, String(status), time)
    } else {
      consola.success(state.prefix, String(status), time)
    }
  })
  .onError(({ code, error }) => {
    // Elysia answers unexpected errors with a 500 but logs nothing; validation and NotFound are not logged.
    if (code === "UNKNOWN" || code === "INTERNAL_SERVER_ERROR") {
      consola.error(error)
    }
  })
  .as("scoped")

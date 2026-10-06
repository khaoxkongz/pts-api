import { type PushHub } from "./publish-outbox-event.js"

type Send = (event: string, data: unknown) => void

const HEARTBEAT_INTERVAL_MS = 20_000

const encoder = new TextEncoder()

function formatSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export class SsePushHub implements PushHub {
  private readonly sendsByAccount = new Map<string, Set<Send>>()

  public push(accountId: string, event: string, payload: unknown) {
    for (const send of this.sendsByAccount.get(accountId) ?? []) {
      send(event, payload)
    }
  }

  public createStreamResponse(accountId: string) {
    let stop = () => {}

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const send: Send = (event, data) => {
          controller.enqueue(encoder.encode(formatSseEvent(event, data)))
        }
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": ping\n\n"))
        }, HEARTBEAT_INTERVAL_MS)

        const sends = this.sendsByAccount.get(accountId) ?? new Set<Send>()
        sends.add(send)
        this.sendsByAccount.set(accountId, sends)

        stop = () => {
          clearInterval(heartbeat)
          sends.delete(send)
          if (sends.size === 0) {
            this.sendsByAccount.delete(accountId)
          }
        }

        send("connected", { connected: true })
      },
      cancel: () => {
        stop()
      },
    })

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      },
    })
  }
}

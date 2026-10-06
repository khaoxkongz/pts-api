import { type ReadableStreamController } from "node:stream/web"

import { type PushHub } from "./publish-outbox-event.js"

interface Subscriber {
  close: () => void
  send: (event: string, data: unknown) => void
}

export class SsePushHub implements PushHub {
  private readonly encoder = new TextEncoder()
  private readonly subscribers = new Map<string, Set<Subscriber>>()

  public static formatSseEvent(event: string, data: unknown) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  }

  private addSubscriber(accountId: string, subscriber: Subscriber) {
    const existing = this.subscribers.get(accountId)
    if (existing) {
      existing.add(subscriber)
      return
    }

    this.subscribers.set(accountId, new Set([subscriber]))
  }

  private removeSubscriber(accountId: string, subscriber: Subscriber) {
    const existing = this.subscribers.get(accountId)
    if (!existing) {
      return
    }

    existing.delete(subscriber)
    if (existing.size === 0) {
      this.subscribers.delete(accountId)
    }
  }

  private createSseSubscriber(controller: ReadableStreamController<Uint8Array>, cleanup: () => void): Subscriber {
    return {
      send: (event: string, data: unknown) => {
        controller.enqueue(this.encoder.encode(SsePushHub.formatSseEvent(event, data)))
      },
      close: () => {
        cleanup()
      },
    }
  }

  public push(accountId: string, event: string, payload: unknown) {
    const listeners = this.subscribers.get(accountId)
    if (!listeners || listeners.size === 0) {
      return
    }

    for (const listener of listeners) {
      listener.send(event, payload)
    }
  }

  public createStreamResponse(accountId: string) {
    let cleanup = (_isCancel?: boolean) => {}

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let closed = false
        let heartbeat: ReturnType<typeof setInterval> | null = null
        let subscriber: Subscriber | null = null

        cleanup = (isCancel = false) => {
          if (closed) {
            return
          }

          closed = true
          if (heartbeat) {
            clearInterval(heartbeat)
          }
          if (subscriber) {
            this.removeSubscriber(accountId, subscriber)
          }
          if (!isCancel) {
            controller.close()
          }
        }

        subscriber = this.createSseSubscriber(controller, () => cleanup())

        heartbeat = setInterval(() => {
          if (closed) {
            return
          }

          controller.enqueue(this.encoder.encode(": ping\n\n"))
        }, 20_000)

        this.addSubscriber(accountId, subscriber)
        subscriber.send("connected", { connected: true })
      },
      cancel: () => {
        cleanup(true)
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

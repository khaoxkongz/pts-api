export interface PushHub {
  createStreamResponse(accountId: string): Response
  push(accountId: string, event: string, payload: unknown): void
}

export interface StreamAuth {
  findSessionByToken(token: string): Promise<{ userId: string } | null>
  findUserByAccountId(accountId: string): Promise<{ accountId: string } | null>
}

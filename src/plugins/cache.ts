import { LRUCache } from "lru-cache"

export const userSubordinatesCache = new LRUCache<string, string[]>({
  max: 100,
  ttl: 1000 * 60 * 60,
})

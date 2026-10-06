import { cors as elysiaCors } from "@elysiajs/cors"
import { Elysia } from "elysia"

import env from "@/env.js"

export const cors = new Elysia()
  .use(
    elysiaCors({
      exposeHeaders: ["Content-Type", "Content-Length", "ETag"],
      origin: env.ALLOWED_ORIGINS.split(","),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "x-authorized-token"],
      maxAge: 86_400,
    })
  )
  .as("global")

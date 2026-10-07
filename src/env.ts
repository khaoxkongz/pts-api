import { config } from "dotenv"
import { expand } from "dotenv-expand"
import path from "node:path"
import { z } from "zod"

expand(
  config({
    path: path.resolve(process.cwd(), process.env.NODE_ENV === "test" ? ".env.test" : ".env"),
  })
)

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.url(),
  ALLOWED_ORIGINS: z.string(),
  SESSION_SECRET: z.string().min(32).max(128),
  SESSION_EXPIRES_IN: z.coerce.number().min(1).max(1_000_000),
  SESSION_UPDATE_AGE: z.coerce.number().min(1).max(1_000_000),
  SESSION_DISABLE_REFRESH: z.coerce.boolean().default(false),
  ONE_TH_AUTH_CLIENT_ID: z.coerce.string().min(1).max(1000),
  ONE_TH_AUTH_CLIENT_SECRET: z.string().min(1).max(1000),
  RA_ONE_TH_API_KEY: z.string().min(1).max(1000),
  RA_AUTHENTICATE_API_KEY: z.string().min(1).max(1000),
  API_BASE_URL: z.string().url().default("http://uat-plannertag.inet.co.th/api/"),
  ALLOWANCE_API_BASE_URL: z.string().url().default(""),
  ALLOWANCE_API_USER: z.string().default(""),
  ALLOWANCE_API_PASS: z.string().default(""),
  ALLOWANCE_API_TIMEOUT_MS: z.coerce.number().min(1000).max(120_000).default(15_000),
  REJECT_SWEEP_INTERVAL_MS: z.coerce.number().min(60_000).max(86_400_000).default(600_000),
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().min(60_000).max(86_400_000).default(60_000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(1_000).default(10),
  OUTBOX_LEASE_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(300_000),
})

export type Env = z.infer<typeof EnvSchema>

const { data: parsedEnv, error } = EnvSchema.safeParse(process.env)

if (error) {
  console.error("❌ Invalid env:")
  console.error(JSON.stringify(error.flatten().fieldErrors, null, 2))
  process.exit(1)
}

const env = parsedEnv as Env
export default env

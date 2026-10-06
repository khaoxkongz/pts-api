import { node } from "@elysiajs/node"
import { Elysia } from "elysia"
import * as mongoose from "mongoose"

import env from "./env.js"
import { allowancePolicy } from "./modules/allowance-policy/index.js"
import { allowance } from "./modules/allowance/index.js"
import { auth } from "./modules/auth/index.js"
import { dashboard } from "./modules/dashboard/index.js"
import { DropDownEmployeeRA, migrateEmployeeRa } from "./modules/employee-ra/index.js"
import { exportModule } from "./modules/export/index.js"
import { ga } from "./modules/ga/index.js"
import { jv } from "./modules/jv/index.js"
import { location } from "./modules/location/index.js"
import { loginLogs } from "./modules/login-logs/index.js"
import { notification } from "./modules/notification/index.js"
import { participant } from "./modules/participant/index.js"
import { startRejectSweep, stopRejectSweep } from "./modules/participant/sweep.js"
import { planner } from "./modules/planner/index.js"
import { roleManager } from "./modules/role/index.js"
import { userRA } from "./modules/user/index.js"
import { webhook, webhookWelfare } from "./modules/webhook/index.js"
import { worthiness } from "./modules/worth/index.js"
import { cors } from "./plugins/cors.js"
import { logger } from "./plugins/logger.js"
import { openApi } from "./plugins/open-api.js"

try {
  await mongoose.connect(env.DATABASE_URL)
  console.log("Connected to MongoDB")
} catch (error) {
  console.error("Failed to connect to MongoDB:", error)
}

const app = new Elysia({ adapter: node() })
  .use(cors)
  .use(openApi)
  .use(logger)
  .get("/", ({ status }) => {
    return status(200, { success: true, message: "Welcome Planner Tag System" })
  })
  .use(auth)
  .use(migrateEmployeeRa)
  .use(DropDownEmployeeRA)
  .use(allowance)
  .use(allowancePolicy)
  .use(planner)
  .use(notification)
  .use(location)
  .use(userRA)
  .use(jv)
  .use(ga)
  .use(worthiness)
  .use(exportModule)
  .use(roleManager)
  .use(dashboard)
  .use(webhook)
  .use(webhookWelfare)
  .use(loginLogs)
  .use(participant)
  .listen(env.PORT)

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)

startRejectSweep(env.REJECT_SWEEP_INTERVAL_MS)

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down`)
  stopRejectSweep()
  process.exit(0)
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

export type App = typeof app
export default app

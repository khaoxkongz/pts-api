import { Elysia } from "elysia"

import { notification as notificationModule } from "./runtime.js"

export const notification = new Elysia().use(notificationModule)

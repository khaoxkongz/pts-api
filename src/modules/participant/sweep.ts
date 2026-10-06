import * as ParticipantService from "./service.js"

let timer: ReturnType<typeof setInterval> | null = null
let isRunning = false

// Skip a tick if the previous sweep is still in flight so runs never overlap.
async function tick(): Promise<void> {
  if (isRunning) return
  isRunning = true
  try {
    const result = await ParticipantService.runPendingConfirmSweep()
    if (result.plannersModified > 0) {
      console.log(`[reject-sweep] confirmed pending outcomes in ${result.plannersModified} planner(s)`)
    }
  } catch (error) {
    console.error("[reject-sweep] failed:", error)
  } finally {
    isRunning = false
  }
}

export function startRejectSweep(intervalMs: number): void {
  if (timer) return
  timer = setInterval(() => {
    void tick()
  }, intervalMs)
  console.log(`[reject-sweep] started, interval=${intervalMs}ms`)
}

export function stopRejectSweep(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

import * as fs from "node:fs"
import * as path from "node:path"
import * as stream from "node:stream"
import slug from "slug"
import { v7 } from "uuid"

import * as PlannerModel from "./model.js"

export async function saveFile(file: File, documentId: string, publicDir: string) {
  const uploadDir = path.join(publicDir, documentId, "employee")
  fs.mkdirSync(uploadDir, { recursive: true })

  const uuid = v7()
  const ext = path.extname(file.name)
  const nameWithoutExt = path.basename(file.name, ext)
  const filename = `${uuid}_${slug(nameWithoutExt, "-")}${ext}`
  const filePath = path.join(uploadDir, filename)

  const sourceStream = stream.Readable.fromWeb(file.stream())
  const destStream = fs.createWriteStream(filePath)
  await stream.promises.pipeline(sourceStream, destStream)

  return {
    filename,
    uuid,
    size: file.size,
    type: file.type,
  }
}

export async function processOutcomeFiles(
  outcome: { hasFile: boolean },
  files: File[] | undefined,
  documentId: string,
  accountId: string,
  publicDir: string
) {
  const outcomeFiles = []

  if (outcome.hasFile && files) {
    for (const file of files) {
      const { filename, uuid, size, type } = await saveFile(file, documentId, publicDir)
      outcomeFiles.push({
        name: file.name,
        size,
        type,
        url: `planner/${documentId}/employee/${filename}`,
        uuid,
        createdBy: accountId,
      })
    }
  }

  return outcomeFiles
}

export async function processActualBudgetFiles(
  items: (typeof PlannerModel.actualBudgetItem.static)[],
  files: File[] | undefined,
  documentId: string,
  accountId: string,
  publicDir: string
) {
  const actualBudgetMaps = []
  let actualBudgetFileCursor = 0

  for (const item of items) {
    const actualBudgetFiles = []

    if (item.hasFile && item.fileCount) {
      for (let i = 0; i < item.fileCount; i += 1) {
        const file = files?.[actualBudgetFileCursor]
        actualBudgetFileCursor += 1

        if (!file) {
          continue
        }

        const { filename, uuid, size, type } = await saveFile(file, documentId, publicDir)
        actualBudgetFiles.push({
          name: file.name,
          size,
          type,
          url: `planner/${documentId}/employee/${filename}`,
          uuid,
          createdBy: accountId,
        })
      }
    }

    actualBudgetMaps.push({
      type: item.type,
      name: item.name,
      price: item.price,
      sharedWith: item.sharedWith.map((user) => ({
        accountId: user.accountId,
        employeeId: user.employeeId,
        fullNameTh: user.fullNameTh,
      })),
      hasFile: item.hasFile,
      files: actualBudgetFiles,
      remark: item.remark,
    })
  }

  return actualBudgetMaps
}

export function getMime(name: string) {
  if (name.endsWith(".pdf")) {
    return "application/pdf"
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg"
  }
  if (name.endsWith(".png")) {
    return "image/png"
  }
  return "application/octet-stream"
}

export function toISO(value: Date | null | undefined): string {
  if (!value) {
    return ""
  }
  return value.toISOString()
}

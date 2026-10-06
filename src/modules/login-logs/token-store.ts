import { Types } from "mongoose"

import { LoginLogsToken } from "@/models/login-logs-token.js"

import { type LoginLogsHolder } from "./type.js"

export async function createToken(input: {
  holder: LoginLogsHolder
  tokenHash: string
  prefix: string
  expiresAt: Date | null
  createdBy: string
}) {
  try {
    const created = await LoginLogsToken.create(input)

    return created.toObject()
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการสร้าง key", { cause: error })
  }
}

/** ค้นด้วย prefix เพื่อให้เทียบ hash แบบ constant-time ได้ อาจได้หลายรายการถ้า prefix ชนกัน */
export async function findByPrefix(prefix: string) {
  try {
    return await LoginLogsToken.find({ prefix }).lean()
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการตรวจสอบ key", { cause: error })
  }
}

export async function findById(id: string) {
  if (!Types.ObjectId.isValid(id)) {
    return null
  }

  try {
    return await LoginLogsToken.findById(id).lean()
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการตรวจสอบ key", { cause: error })
  }
}

export async function listTokens() {
  try {
    return await LoginLogsToken.find({}, { tokenHash: 0 }).sort({ createdAt: -1 }).lean()
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการดึงรายการ key", { cause: error })
  }
}

export async function revokeById(id: string, revokedBy: string) {
  if (!Types.ObjectId.isValid(id)) {
    return null
  }

  try {
    return await LoginLogsToken.findOneAndUpdate(
      { _id: id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedBy } },
      { new: true }
    ).lean()
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการเพิกถอน key", { cause: error })
  }
}

/** อัปเดตแบบไม่รอผล ไม่ให้กระทบเวลาตอบกลับของ request หลัก */
export function touchLastUsed(id: string): void {
  void LoginLogsToken.updateOne({ _id: id }, { $set: { lastUsedAt: new Date() } })
    .exec()
    .catch((error: unknown) => {
      console.error("[login-logs] อัปเดต lastUsedAt ไม่สำเร็จ", error)
    })
}

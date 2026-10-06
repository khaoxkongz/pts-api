import { Session } from "@/models/session.js"
import { User } from "@/models/user.js"

export async function getLoginLogs(accountIds?: string[]) {
  try {
    const filter = accountIds ? { accountId: { $in: accountIds } } : {}
    const users = await User.find(filter, { fullName: 1, email: 1, emailOneId: 1, accountId: 1, companies: 1 }).lean()

    return users.map((user) => ({
      name: user.fullName ?? "",
      email: user.email ?? "",
      emailOneId: user.emailOneId ?? "",
      account_id: String(user.accountId),
      biz_details: (user.companies ?? []).map((c) => ({ biz_name: c.companyName, employee_id: c.employeeId })),
    }))
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการดึงข้อมูล login logs", { cause: error })
  }
}

export async function getLastLoginByAccount(accountIds: string[]) {
  try {
    const rows = await Session.aggregate<{ _id: string; lastLogin: Date }>([
      { $match: { userId: { $in: accountIds } } },
      { $group: { _id: "$userId", lastLogin: { $max: "$createdAt" } } },
    ])

    return rows.map((r) => ({
      account_id: String(r._id),
      updatedAt: r.lastLogin ? new Date(r.lastLogin).toISOString() : null,
    }))
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการดึงข้อมูล session", { cause: error })
  }
}

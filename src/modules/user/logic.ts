import { type MemberType, type UserSubordinatesResponse } from "./type.js"

export async function parseSubordinatesResponse(data: unknown, leaderId: string): Promise<MemberType[]> {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid response data format: expected object")
  }

  const response = data as UserSubordinatesResponse

  if (!response.result || !Array.isArray(response.result.memberIn)) {
    // If format is unexpected or empty, return empty array safely or throw specific error?
    // Based on original code, it expects strict structure.
    // Let's allow partial failure but ensure memberIn exists.
    if (!response.result) {
      return []
    }
    return []
  }
  const member = response.result.memberIn.filter(
    (m) => m.employeeId !== leaderId && m.employeeId !== "" && m.employeeId !== "-"
  )
  return member
}

import * as UserModels from "@/modules/user/model.js"

export type IUserDTO = typeof UserModels.user.static
export type ICreateUserDTO = typeof UserModels.createUser.static

export interface UserSubordinatesResponse {
  success: boolean
  result: {
    memberIn: {
      _id: string
      employeeId: string
      userId: string
    }[]
  }
}

export interface MemberType {
  _id: string
  employeeId: string
  userId: string
}

import env from "@/env.js"
import { EmployeeRA } from "@/models/employee-ra.js"
import { OneToken } from "@/models/one-token.js"
import { Session } from "@/models/session.js"
import { User, type TCompanyMember } from "@/models/user.js"
import * as UserProvider from "@/modules/user/provider.js"
import { type OneThAuth } from "@/types/one.js"

import { type MemberType } from "../user/type.js"
import { OneThAuthProvider } from "./oneth.provider.js"
import { RaThAuthProvider } from "./rath.provider.js"
import { createSignedToken, sessionTokenFrom, type SessionCredentials } from "./utils.js"

const ONE_DAY_MS = 1000 * 60 * 60 * 24

export const SESSION_CONFIG = {
  secret: env.SESSION_SECRET,
  expiresIn: env.SESSION_EXPIRES_IN,
  updateAge: env.SESSION_UPDATE_AGE,
  disableRefresh: env.SESSION_DISABLE_REFRESH,
}

// The one session resolution path (ADR-0001). Database errors propagate: an outage is a 500, not a logout.
export async function resolveSessionUser(credentials: SessionCredentials) {
  const token = sessionTokenFrom(credentials, SESSION_CONFIG.secret)
  if (!token) return null

  const session = await Session.findOne({ token, expiresIn: { $gt: new Date() } }).lean()
  if (!session) return null

  const user = await User.findOne({ accountId: session.userId }).lean()
  if (!user) return null

  return { session, user }
}

export function login() {
  return `https://one.th/api/oauth/getcode?client_id=${env.ONE_TH_AUTH_CLIENT_ID}&response_type=code&scope=&redirect_uri=`
}

export async function loginWithCode(params: { code: string; ipAddress: string; userAgent: string }) {
  const { code, ipAddress, userAgent } = params

  const oneThData = await OneThAuthProvider.getUserInfo(code)
  const user = await findOrCreateUser(oneThData)

  const { session, token, signedToken } = await createAndSaveSession(user.accountId, ipAddress, userAgent)

  await saveOneToken(oneThData, session._id.toString())

  return {
    token,
    signedToken,
    expiresIn: SESSION_CONFIG.expiresIn,
    user: user.toObject(),
  }
}

export async function loginWithSharedToken(params: { sharedToken: string; ipAddress: string; userAgent: string }) {
  const { sharedToken, ipAddress, userAgent } = params

  const oneThData = await OneThAuthProvider.getUserInfoWithSharedToken(sharedToken)
  const user = await findOrCreateUser(oneThData)

  const { session, token, signedToken } = await createAndSaveSession(user.accountId, ipAddress, userAgent)

  await saveOneToken(oneThData, session._id.toString())

  return {
    token,
    signedToken,
    expiresIn: SESSION_CONFIG.expiresIn,
    user: user.toObject(),
  }
}

async function findOrCreateUser(oneThData: OneThAuth) {
  let user = await User.findOne({ accountId: oneThData.account_id })

  if (user) {
    const hasPassedOneDay = Date.now() - user.updatedAt.getTime() >= ONE_DAY_MS
    if (!hasPassedOneDay) return user
  }

  const raUserData = await RaThAuthProvider.getUserInfo(oneThData.account_id)

  const employees = await EmployeeRA.find({ accountId: oneThData.account_id }).select("companyTaxId").lean()
  const companyTaxIds = new Set(employees.map((employee) => employee.companyTaxId))

  const companies: TCompanyMember[] = raUserData.userInCompany
    .filter((company) => companyTaxIds.has(company.taxId))
    .map((company) => ({
      companyTaxId: company.taxId || "",
      companyName: company.companyFullNameTh || "",
      employeeId: company.employeeId || "",
      positionName: company.positionName || "",
      positionLevel: company.positionLevel || "",
    }))

  const userData = {
    email: raUserData.email,
    emailOneId: raUserData.emailOneId || "",
    fullName: `${raUserData.firstNameTh} ${raUserData.lastNameTh}`,
    firstName: raUserData.firstNameTh,
    lastName: raUserData.lastNameTh,
    nickName: raUserData.nickName,
    phone: raUserData.tel,
    companies,
    title: raUserData.titleTh,
  }

  if (user) {
    user.set(userData)
    user.updatedAt = new Date()
    return await user.save()
  }

  let supervisor: MemberType[] = []
  for (const company of raUserData.userInCompany) {
    const subordinates = await UserProvider.getUserSubordinatesByLeaderId(company.employeeId)
    supervisor = supervisor.concat(subordinates)
  }

  user = new User({
    ...userData,
    accountId: raUserData.accountId,
    isSupervisor: supervisor.length > 0,
    role: "EMPLOYEE",
    gmCompany: [],
  })

  return await user.save()
}

async function createAndSaveSession(userId: string, ipAddress: string, userAgent: string) {
  const { token, signedToken } = createSignedToken(SESSION_CONFIG.secret)
  const now = new Date()
  const expiresIn = new Date(now.getTime() + SESSION_CONFIG.expiresIn * 1000)

  const session = new Session({
    token,
    expiresIn,
    ipAddress,
    userAgent,
    userId,
  })
  await session.save()

  return { session, token, signedToken }
}

async function saveOneToken(oneThData: OneThAuth, sessionId: string) {
  const oneToken = new OneToken({
    tokenType: oneThData.token_type,
    expiresIn: oneThData.expires_in,
    accessToken: oneThData.access_token,
    refreshToken: oneThData.refresh_token,
    expirationDate: oneThData.expiration_date,
    accountId: oneThData.account_id,
    result: oneThData.result,
    username: oneThData.username,
    sessionId: sessionId,
  })
  await oneToken.save()
}

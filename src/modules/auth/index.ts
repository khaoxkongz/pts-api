import { Elysia, InvalidCookieSignature, NotFoundError, t } from "elysia"

import env from "@/env.js"
import { session } from "@/plugins/session.js"

import * as AuthService from "./service.js"

export const auth = new Elysia({ prefix: "/auth" })
  .use(session)

  .get(
    "/login",
    () => {
      const uri = AuthService.login()

      return new Response(null, {
        status: 302,
        headers: {
          location: uri,
        },
      })
    },
    {
      detail: {
        description: "เปลี่ยนเส้นทางผู้ใช้ไปยังหน้าล็อกอินของ ONE.TH เพื่อเริ่มกระบวนการรับรองความถูกต้อง",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/login/code",
    async ({ body, cookie, server, request, status }) => {
      try {
        const ip = server?.requestIP(request)
        const userAgent = request.headers.get("user-agent") || "unknown"

        const result = await AuthService.loginWithCode({
          code: body.code,
          ipAddress: ip?.address || "unknown",
          userAgent,
        })

        cookie.auth?.set({
          value: result.signedToken,
          httpOnly: env.NODE_ENV === "production",
          maxAge: result.expiresIn,
          path: "/",
          sameSite: "lax",
          secure: env.NODE_ENV === "production",
        })

        return status(200, {
          status: 200,
          success: true,
          message: "เข้าสู่ระบบสำเร็จ",
          data: {
            token: result.token,
            user: {
              id: result.user._id.toString(),
              name: result.user.fullName,
              email: result.user.email,
              nickName: result.user.nickName,
              accountId: result.user.accountId,
              companies: result.user.companies.map((c) => ({
                companyTaxId: c.companyTaxId,
                companyName: c.companyName,
                employeeId: c.employeeId,
                positionName: c.positionName,
                positionLevel: c.positionLevel,
              })),
            },
          },
        })
      } catch (error) {
        if (error instanceof InvalidCookieSignature) {
          return status(401, {
            status: 401,
            success: false,
            message: "Authorized Code หมดอายุ หรือ ไม่ถูกต้อง",
          })
        } else if (error instanceof NotFoundError) {
          return status(404, {
            status: 404,
            success: false,
            message: "ไม่พบผู้ใช้ที่ตรงกับ Code ที่ให้มา",
          })
        }

        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      body: t.Object({
        code: t.String(),
      }),
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          status: t.Number({ examples: 200 }),
          success: t.Boolean({ examples: true }),
          message: t.String({ examples: "เข้าสู่ระบบสำเร็จ" }),
          data: t.Object({
            token: t.String(),
            user: t.Object({
              id: t.String(),
              name: t.Optional(t.String()),
              email: t.Optional(t.String()),
              nickName: t.Optional(t.String()),
              accountId: t.Optional(t.String()),
              companies: t.Array(
                t.Object({
                  companyTaxId: t.String(),
                  companyName: t.String(),
                  employeeId: t.String(),
                  positionName: t.String(),
                  positionLevel: t.String(),
                })
              ),
            }),
          }),
        }),
        401: t.Object({
          status: t.Number({ examples: 401 }),
          success: t.Boolean({ examples: false }),
          message: t.String({
            examples: "Authorized Code หมดอายุ หรือ ไม่ถูกต้อง",
          }),
        }),
        404: t.Object({
          status: t.Number({ examples: 404 }),
          success: t.Boolean({ examples: false }),
          message: t.String({ examples: "ไม่พบผู้ใช้ที่ตรงกับ Code ที่ให้มา" }),
        }),
        500: t.Object({
          status: t.Number({ examples: 500 }),
          success: t.Boolean({ examples: false }),
          message: t.String({ examples: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" }),
        }),
      },
      detail: {
        description: "ใช้ Authorized Code ที่ได้รับจาก ONE.TH เพื่อลงชื่อเข้าใช้ระบบ",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/login/shared-token",
    async ({ body, cookie, server, request, status }) => {
      try {
        const ip = server?.requestIP(request)
        const userAgent = request.headers.get("user-agent") || "unknown"

        const result = await AuthService.loginWithSharedToken({
          sharedToken: body.sharedToken,
          ipAddress: ip?.address || "unknown",
          userAgent,
        })

        cookie.auth?.set({
          value: result.signedToken,
          httpOnly: env.NODE_ENV === "production",
          maxAge: result.expiresIn,
          path: "/",
          sameSite: "lax",
          secure: env.NODE_ENV === "production",
        })

        return status(200, {
          status: 200,
          success: true,
          message: "เข้าสู่ระบบสำเร็จ",
          data: {
            token: result.token,
            user: {
              id: result.user._id.toString(),
              name: result.user.fullName,
              email: result.user.email,
              nickName: result.user.nickName,
              accountId: result.user.accountId,
              companies: result.user.companies.map((c) => ({
                companyTaxId: c.companyTaxId,
                companyName: c.companyName,
                employeeId: c.employeeId,
                positionName: c.positionName,
                positionLevel: c.positionLevel,
              })),
            },
          },
        })
      } catch (error) {
        if (error instanceof InvalidCookieSignature) {
          return status(401, {
            status: 401,
            success: false,
            message: "Authorized Code หมดอายุ หรือ ไม่ถูกต้อง",
          })
        } else if (error instanceof NotFoundError) {
          return status(404, {
            status: 404,
            success: false,
            message: "ไม่พบผู้ใช้ที่ตรงกับ Code ที่ให้มา",
          })
        }

        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      body: t.Object({
        sharedToken: t.String(),
      }),
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          status: t.Number({ examples: 200 }),
          success: t.Boolean({ examples: true }),
          message: t.String({ examples: "เข้าสู่ระบบสำเร็จ" }),
          data: t.Object({
            token: t.String(),
            user: t.Object({
              id: t.String(),
              name: t.Optional(t.String()),
              email: t.Optional(t.String()),
              nickName: t.Optional(t.String()),
              accountId: t.Optional(t.String()),
              companies: t.Array(
                t.Object({
                  companyTaxId: t.String(),
                  companyName: t.String(),
                  employeeId: t.String(),
                  positionName: t.String(),
                  positionLevel: t.String(),
                })
              ),
            }),
          }),
        }),
        401: t.Object({
          status: t.Number({ examples: 401 }),
          success: t.Boolean({ examples: false }),
          message: t.String({
            examples: "Authorized Code หมดอายุ หรือ ไม่ถูกต้อง",
          }),
        }),
        404: t.Object({
          status: t.Number({ examples: 404 }),
          success: t.Boolean({ examples: false }),
          message: t.String({ examples: "ไม่พบผู้ใช้ที่ตรงกับ Code ที่ให้มา" }),
        }),
        500: t.Object({
          status: t.Number({ examples: 500 }),
          success: t.Boolean({ examples: false }),
          message: t.String({ examples: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" }),
        }),
      },
      detail: {
        description: "ใช้ Authorized Code ที่ได้รับจาก ONE.TH เพื่อลงชื่อเข้าใช้ระบบ",
        tags: ["Authentication"],
      },
    }
  )

  .get(
    "/profile",
    ({ status, user, session }) => {
      if (!user || !session) {
        return status(401, {
          status: 401,
          success: false,
          message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง",
        })
      }

      return status(200, {
        status: 200,
        success: true,
        data: {
          session: {
            id: session._id.toString(),
            expiresIn: session.expiresIn,
            token: session.token,
            userId: session.userId,
            ipAddress: session?.ipAddress || "",
            userAgent: session?.userAgent || "",
          },
          user: {
            _id: user._id.toString(),
            accountId: user.accountId,
            titleTh: user.title,
            fullNameTh: user.fullName,
            firstNameTh: user.firstName,
            lastNameTh: user.lastName,
            nickNameTh: user.nickName,
            email: user.email,
            phone: user.phone,
            companies: user.companies && Array.isArray(user.companies) ? user.companies : [],
            isSupervisor: user.isSupervisor || false,
            role: user.role,
            gmCompany: user.gmCompany || [],
          },
        },
      })
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      response: {
        200: t.Object({
          status: t.Number({ examples: 200 }),
          success: t.Boolean({ examples: true }),
          data: t.Object({
            session: t.Object({
              id: t.String(),
              expiresIn: t.Date(),
              token: t.String(),
              userId: t.String(),
              ipAddress: t.Optional(t.String()),
              userAgent: t.Optional(t.String()),
            }),
            user: t.Object({
              _id: t.String(),
              accountId: t.String(),
              titleTh: t.String(),
              fullNameTh: t.String(),
              firstNameTh: t.String(),
              lastNameTh: t.String(),
              nickNameTh: t.String(),
              email: t.String(),
              phone: t.String(),
              companies: t.Array(
                t.Object({
                  companyTaxId: t.String(),
                  companyName: t.String(),
                  employeeId: t.String(),
                  positionName: t.String(),
                  positionLevel: t.String(),
                })
              ),
              role: t.String(),
              isSupervisor: t.Boolean(),
              gmCompany: t.Array(t.String()),
            }),
          }),
        }),
        401: t.Object({
          status: t.Number({ examples: 401 }),
          success: t.Boolean({ examples: false }),
          message: t.String({
            examples: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง",
          }),
        }),
      },
      detail: {
        description: "ดึงข้อมูลโปรไฟล์ของผู้ใช้ที่เข้าสู่ระบบอยู่ในปัจจุบัน",
        tags: ["User"],
      },
    }
  )

  .post(
    "/logout",
    ({ cookie, status, session }) => {
      if (!session) {
        return status(401, {
          status: 401,
          success: false,
          message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง",
        })
      }

      cookie.auth?.remove()

      return status(200, {
        status: 200,
        success: true,
        message: "ออกจากระบบสำเร็จ",
      })
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          status: t.Number({ examples: 200 }),
          success: t.Boolean({ examples: true }),
          message: t.String({ examples: "ออกจากระบบสำเร็จ" }),
        }),
        401: t.Object({
          status: t.Number({ examples: 401 }),
          success: t.Boolean({ examples: false }),
          message: t.String({
            examples: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง",
          }),
        }),
      },
      detail: {
        description: "ออกจากระบบโดยการลบคุกกี้รับรองความถูกต้อง",
        tags: ["Authentication"],
      },
    }
  )

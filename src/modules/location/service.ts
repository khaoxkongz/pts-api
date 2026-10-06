import { generateNormalizedName, type LocationData } from "./logic.js"
import { findLocations, upsertLocation } from "./store.js"

export async function upsertLocations(locations: LocationData[]) {
  const results = await Promise.allSettled(
    locations.map(async (location) => {
      const normalizedName = generateNormalizedName(location)

      const result = await upsertLocation(normalizedName, location as unknown as Record<string, unknown>)

      return {
        ...result,
        normalizedName,
      }
    })
  )

  return results
}

export async function searchLocations(q?: string) {
  const match = {
    ...(q ? { name: { $regex: q.trim(), $options: "i" } } : undefined),
  }
  const locations = await findLocations(match)

  return locations.map((location) => ({
    name: location.name,
    addressNo: location.addressNo,
    soi: location.soi,
    village: location.village,
    street: location.street,
    district: location.district,
    province: location.province,
    subdistrict: location.subdistrict,
    zipcode: location.zipcode,
    normalizedName: location.normalizedName,
  }))
}

import { Location } from "@/models/location.js"

export async function upsertLocation(normalizedName: string, locationData: Record<string, unknown>) {
  return await Location.updateOne(
    { normalizedName },
    {
      $setOnInsert: locationData,
    },
    { upsert: true }
  )
}

export async function findLocations(match: Record<string, unknown>) {
  return await Location.find(match).lean()
}

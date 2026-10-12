import type { Enrolled } from '@pehra/perpl'

// the web try page skips onboarding and has no perpl key
export const loadApiKey = async (_address: string): Promise<Enrolled | null> => null
export const saveApiKey = async (_address: string, _key: Enrolled) => {}
export const isOnboarded = async () => true
export const setOnboarded = async (_v: boolean) => {}

// the web try page has no keychain. the few things the app keeps (recent sends, the onboarded flag) live in
// the tab's local storage, and nothing secret is ever written on the web
const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

export const getItemAsync = async (k: string) => get(k)
export const setItemAsync = async (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} }
export const deleteItemAsync = async (k: string) => { try { localStorage.removeItem(k) } catch {} }

// the web try page never holds a session. reads go out plain and show what anyone can see, writes stop
// here and say what the app would do
import type { Session } from './account'
import { API } from './trade'
import { DemoError } from './web/demo'

export const setSigner = (_fn: (address: string) => Promise<Session>) => {}
export async function openSession(_s: Session): Promise<string> { throw new DemoError() }
export async function token(_address: string, _renew = false): Promise<string> { throw new DemoError() }
export async function quietToken(_address: string): Promise<string | null> { return null }
export async function forget(_address: string) {}
export async function authedPost<T>(_path: string, _address: string, _body: unknown): Promise<T> { throw new DemoError() }
export async function authedGet(path: string, _address: string): Promise<Response> { return fetch(`${API}${path}`) }

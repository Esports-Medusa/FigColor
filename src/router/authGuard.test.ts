import { shouldRedirectAuthenticatedGuest } from './authGuard'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const resetWithToken = { name: 'reset-password', query: { token: 'secret' }, meta: { guestOnly: true } }

expect(!shouldRedirectAuthenticatedGuest(resetWithToken as never, true), 'authenticated users must reach tokenized reset-password')
expect(!shouldRedirectAuthenticatedGuest(resetWithToken as never, false), 'unauthenticated users must reach tokenized reset-password')
expect(shouldRedirectAuthenticatedGuest({ name: 'login', query: {}, meta: { guestOnly: true } } as never, true), 'authenticated login access must retain its redirect')
expect(shouldRedirectAuthenticatedGuest({ name: 'register', query: {}, meta: { guestOnly: true } } as never, true), 'authenticated register access must retain its redirect')

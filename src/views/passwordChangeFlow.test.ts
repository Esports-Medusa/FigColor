import profile from './ProfileView.vue?raw'
import reset from './ResetPasswordView.vue?raw'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

expect(profile.includes("'Send password change link'"), 'Profile must use the initial action label')
expect(profile.includes("'Resend password change link'"), 'Profile must use resend only after a request')
expect(profile.includes('passwordLinkRequested.value=true'), 'a successful Profile request must switch to resend state')
const passwordRequestHandler = profile.slice(profile.indexOf('async function handlePasswordUpdate'))
expect(!passwordRequestHandler.includes('router.push'), 'password-change request must not navigate away')
expect(reset.includes('clearAuthentication()'), 'successful reset must clear frontend authentication')
expect(reset.includes("name:'login'"), 'successful reset must redirect to Login')
expect(reset.includes("route.query.token||''"), 'reset submission must preserve and submit the email token')

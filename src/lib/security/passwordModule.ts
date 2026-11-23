// src/lib/security/passwordModule.ts
//
// This is the one switch of the whole password module. Everything below is built, tested and ready, and does nothing while this is false:
//   - the "Change password" item in the account menu and its window,
//   - the 180-day life and the window that comes up by itself after sign-in when it has run out,
//   - the last-5-passwords rule, the three no-copy-paste boxes,
//   - the one-time-code step (which has its own second switch, PASSWORD_OTP on the host, and still needs an SMS / e-mail gateway: src/lib/security/otpSender.ts),
//   - the "first time? change it" line on the sign-in screen,
//   - the two server routes under src/app/api/account/password (they answer 404, touch no table and send nothing).
// To bring the module into use, change false to true here, commit and deploy. Nothing else needs to change.
// (Signing in with the SAIL P.No. and the HOD's password set by scripts/set-user-password.ts are not part of this module and work either way.)
// I keep this a plain constant with no imports: the screens and the server routes both read it.

export const PASSWORD_MODULE_ENABLED = false;

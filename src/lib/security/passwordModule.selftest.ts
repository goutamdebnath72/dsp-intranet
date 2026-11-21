// src/lib/security/passwordModule.selftest.ts
// The password module's one switch (passwordModule.ts) really is the only thing standing between the module and the users: every place that shows or serves the module reads it.
// Run: npx tsx src/lib/security/passwordModule.selftest.ts
import { readFileSync } from "node:fs";
import { PASSWORD_MODULE_ENABLED } from "./passwordModule";

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const read = (p: string) => readFileSync(p, "utf8");

check("the switch is a plain boolean", typeof PASSWORD_MODULE_ENABLED === "boolean");

const route = read("src/app/api/account/password/route.ts");
check("GET of the password route is closed first thing when off", /export async function GET\(\) \{\s*if \(!PASSWORD_MODULE_ENABLED\) return off\(\);/.test(route));
check("POST of the password route is closed first thing when off", /export async function POST\(request: Request\) \{\s*if \(!PASSWORD_MODULE_ENABLED\) return off\(\);/.test(route));
check("the one-time-code route is closed when off", /if \(!PASSWORD_MODULE_ENABLED \|\| !config\(\)\.on\) return fail\(404/.test(read("src/app/api/account/password/otp/route.ts")));

const bar = read("src/components/TopBar.tsx");
check("the menu item is shown only when on", /\{PASSWORD_MODULE_ENABLED && <button\s+data-change-password-item/.test(bar));
check("the window is rendered only when on", /\{PASSWORD_MODULE_ENABLED && <ChangePasswordModal/.test(bar));
check("no expiry request is made when off", /if \(!PASSWORD_MODULE_ENABLED \|\| !t\)/.test(bar));
check("the sign-in screen's change-password line is shown only when on", /\{PASSWORD_MODULE_ENABLED && <p[^>]*>First time\?/.test(read("src/components/StepTwo.tsx")));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);

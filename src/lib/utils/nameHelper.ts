// src/lib/utils/nameHelper.ts
//
// The name rules (a prefix such as MOHD or DR is never the name: "MOHD ANWAR ULLAH" is called Anwar, badge "AU") no longer live in this file. They live in ONE shared file, the dsp-shared package
// (github.com/goutamdebnath72/dsp-shared, src/nameHelper.ts), which ESS reads too. This file only passes them on, so TopBar.tsx and HomepageNew.tsx keep their imports.
// To change a rule: change it in dsp-shared, run `npm test` there, commit and push, then run `npm run shared:update` here and in ESS.
// Important: the SQL function public.name_prefixes() (04_phonetic_setup.sql), which employee phonetic search uses, still has its own copy of the prefix list; keep it in step by hand.

export { COMMON_PREFIXES, getFriendlyFirstName, getInitials } from "dsp-shared/nameHelper";

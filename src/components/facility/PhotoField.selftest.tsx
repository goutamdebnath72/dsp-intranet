// Run (from the project root):  npx tsx --tsconfig tsconfig.selftest.json src/components/facility/PhotoField.selftest.tsx
// Step 70: the photo field (five states) and its place in the employee form.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PHOTO_ACCEPT, PHOTO_HINT, PhotoField, photoUrlOf, type PhotoUiState } from "./PhotoField";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const noop = () => undefined;
const draw = (state: PhotoUiState, disabled = false) => renderToStaticMarkup(<PhotoField id="emp-add-photo" state={state} onPick={noop} onRemove={noop} disabled={disabled} />);

const empty = draw({ kind: "empty" });
ok("empty: 'Photo (optional)', the format in words (coloured, high-resolution, passport-size; JPG, JPEG, PNG, WebP; 8 MB; 400 x 400), a Choose button, 'or drop it here'", empty.includes("Photo") && empty.includes("(optional)") && empty.includes(PHOTO_HINT) && /coloured, high-resolution, passport-size/.test(empty) && /JPG, JPEG, PNG or WebP/.test(empty) && /8 MB/.test(empty) && /400 × 400/.test(empty) && /data-photo-choose="true"/.test(empty) && empty.includes("or drop it here") && /data-photo-field="empty"/.test(empty));
ok("the hidden file box takes only JPEG, PNG and WebP and carries the id the panel looks for", PHOTO_ACCEPT === "image/jpeg,image/png,image/webp" && /type="file"/.test(empty) && /id="emp-add-photo"/.test(empty) && /accept="image\/jpeg,image\/png,image\/webp"/.test(empty));
const checking = draw({ kind: "checking", fileName: "ojha.jpg" });
ok("checking: says so, names the file, shows a spinner, and offers no button", checking.includes("Checking the photo") && checking.includes("ojha.jpg") && /animate-spin/.test(checking) && !/data-photo-choose|data-photo-replace|data-photo-remove/.test(checking) && /data-photo-field="checking"/.test(checking));
const ready = draw({ kind: "ready", previewUrl: "blob:abc" });
ok("ready: the picture, 'Face found · made square', that it is on the ID card and saved with the employee, Replace and Remove", ready.includes('src="blob:abc"') && ready.includes("Face found · made square") && ready.includes("saved when you save the employee") && /data-photo-replace="true"/.test(ready) && /data-photo-remove="true"/.test(ready) && /data-photo-field="ready"/.test(ready));
const saved = draw({ kind: "saved", url: "/api/employees/photo?id=5&size=thumb&v=2" });
ok("saved: the picture by its address, 'Saved photo', how to change it, Replace and Remove", saved.includes('src="/api/employees/photo?id=5&amp;size=thumb&amp;v=2"') && saved.includes("Saved photo") && saved.includes("choose another") && /data-photo-replace="true"/.test(saved) && /data-photo-remove="true"/.test(saved));
const error = draw({ kind: "error", message: "No single face was found in this photo." });
ok("error: the reason in RED as an alert, and 'Try another photo'", /role="alert"/.test(error) && error.includes("No single face was found in this photo.") && /rose/.test(error) && error.includes("Try another photo") && /data-photo-field="error"/.test(error));
ok("what is printed is escaped (a tag in a message or a file name is text)", !draw({ kind: "error", message: "<img src=x onerror=1>" }).includes("<img src=x") && !draw({ kind: "checking", fileName: "<b>x</b>" }).includes("<b>x"));
ok("every button is off when the field is disabled (a save is on its way)", !/disabled=""/.test(empty) && (draw({ kind: "empty" }, true).match(/disabled=""/g) ?? []).length >= 2 && (draw({ kind: "ready", previewUrl: "blob:x" }, true).match(/disabled=""/g) ?? []).length >= 2);
ok("the picture for the ID card: the preview of a ready photo, the address of a saved one, nothing otherwise", photoUrlOf({ kind: "ready", previewUrl: "blob:p" }) === "blob:p" && photoUrlOf({ kind: "saved", url: "/u" }) === "/u" && photoUrlOf({ kind: "empty" }) === null && photoUrlOf({ kind: "checking", fileName: "f" }) === null && photoUrlOf({ kind: "error", message: "m" }) === null);

// ---- its place in the form and the panel ----
const ui = readFileSync("src/components/EmployeeAdminUi.tsx", "utf8");
const panel = readFileSync("src/components/EmployeeAdminPanel.tsx", "utf8");
ok("the form draws the field in the Identity card, after the Name, only when a photo slot is given; the ID card shows the picture instead of the initials", /\{p\.photo && <PhotoField id=\{id\("photo"\)\}/.test(ui) && /photoUrl=\{p\.photo \? photoUrlOf\(p\.photo\.state\) : null\}/.test(ui) && /data-emp-photo="true"/.test(ui));
ok("the panel checks the photo in the browser before anything is sent, and sends it only AFTER the employee is saved (add and modify)", /preparePhoto\(file, photoDeps\)/.test(panel) && /const photoProblem = await syncPhoto\(res\.employee\.id, mode\)/.test(panel) && /method: "POST", body: f/.test(panel));
ok("a photo chosen or removed counts as a change in Modify (the review lists it, the save button waits for it), and an 'unchanged' answer still sends it", /const photoChange: ChangeView \| null/.test(panel) && /\.\.\.\(photoChange \? \[photoChange\] : \[\]\)/.test(panel) && /no field changed: if a photo was chosen or removed, that is the change/.test(panel));
ok("a failed photo never undoes the save: the person is told, in words, that the employee is saved but the photo is not", /But the photo was not saved: \$\{photoProblem\} Choose it again in Modify\./.test(panel));
ok("the headings say who may use the tool, not only executives (non-executives can be in the list)", /Who may add and modify employees<\/p>/.test(panel) && /Authorise \(name or ticket number\)<\/label>/.test(panel) && /Who may change PAX numbers/.test(readFileSync("src/components/PaxAdminPanel.tsx", "utf8")) && /<p className="text-sm font-bold text-slate-800">Authorise<\/p>/.test(readFileSync("src/components/PaxAdminPanel.tsx", "utf8")));
ok("the real browser parts are loaded only when a photo is chosen (the face finder is a dynamic import), and the model is served from our own folder", /await import\("@vladmandic\/face-api"\)/.test(readFileSync("src/lib/employees/photo/browserDeps.ts", "utf8")) && /loadFromUri\("\/models\/face"\)/.test(readFileSync("src/lib/employees/photo/browserDeps.ts", "utf8")) && readFileSync("public/models/face/tiny_face_detector_model.bin").length > 150000);
console.log(`PhotoField selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

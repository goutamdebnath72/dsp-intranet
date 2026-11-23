// src/tools/converter/colour.selftest.ts: here I check RGB <-> HEX, the arithmetic and the typed line.
import { DEFAULT_HEX, cssHsl, cssRgb, hslToRgb, inkOn, parseChannel, parseChannels, parseColour, parseHex, parseHslBoxes, parseHslPart, rgbToHsl, stepPart, toHex } from "./colour";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => { if (cond) pass++; else { fail++; console.log("FAIL", name, extra); } };

// RGB -> HEX
ok("255,87,51 is #FF5733", toHex({ r: 255, g: 87, b: 51 }) === "#FF5733");
ok("0,0,0 is #000000 and 255,255,255 is #FFFFFF (two digits each, zero-padded)", toHex({ r: 0, g: 0, b: 0 }) === "#000000" && toHex({ r: 255, g: 255, b: 255 }) === "#FFFFFF");
ok("a small number is padded: 1,2,3 is #010203; 10,11,12 is #0A0B0C (upper case)", toHex({ r: 1, g: 2, b: 3 }) === "#010203" && toHex({ r: 10, g: 11, b: 12 }) === "#0A0B0C");
ok("the intranet's indigo, 79,70,229, is #4F46E5", toHex({ r: 79, g: 70, b: 229 }) === DEFAULT_HEX);
ok("the stylesheet form is rgb(79, 70, 229)", cssRgb({ r: 79, g: 70, b: 229 }) === "rgb(79, 70, 229)");

// HEX -> RGB
ok("#FF5733 is 255,87,51; with or without #, any case", JSON.stringify(parseHex("#FF5733")) === '{"r":255,"g":87,"b":51}' && JSON.stringify(parseHex("ff5733")) === '{"r":255,"g":87,"b":51}' && JSON.stringify(parseHex(" #Ff5733 ")) === '{"r":255,"g":87,"b":51}');
ok("a short HEX doubles each digit: #f53 is #ff5533 is 255,85,51; #000 and #fff", JSON.stringify(parseHex("#f53")) === '{"r":255,"g":85,"b":51}' && toHex(parseHex("#000")!) === "#000000" && toHex(parseHex("fff")!) === "#FFFFFF");
ok("not a HEX: 4 or 5 digits, 7 digits, a letter past F, empty, two #", ["#ff57", "#ff573", "#ff57331", "#gg5733", "", "##ff5733", "#ff 5733"].every((t) => parseHex(t) === null));
ok("every colour survives the round trip, HEX -> RGB -> HEX and RGB -> HEX -> RGB (all 256 values of each channel)", (() => {
  for (let n = 0; n < 256; n++) {
    const c = { r: n, g: 255 - n, b: (n * 7) % 256 };
    const back = parseHex(toHex(c));
    if (!back || back.r !== c.r || back.g !== c.g || back.b !== c.b) return false;
    const hex = toHex({ r: n, g: n, b: n });
    if (toHex(parseHex(hex)!) !== hex) return false;
  }
  return true;
})());

// a channel box
ok("a channel is a whole number 0 to 255: 0, 7, 255, ' 12 '", [["0", 0], ["7", 7], ["255", 255], [" 12 ", 12], ["007", 7]].every(([t, n]) => parseChannel(t as string) === n));
ok("not a channel: 256, -1, 1.5, 12a, empty, 1e2, 1000 (never rounded or clamped)", ["256", "-1", "1.5", "12a", "", "1e2", "1000", "0x10"].every((t) => parseChannel(t) === null));
ok("three boxes make a colour only when all three are channels", parseChannels("255", "87", "51")?.g === 87 && parseChannels("255", "87", "") === null && parseChannels("256", "0", "0") === null);

// RGB -> HSL: hue in degrees 0-359, saturation and lightness in per cent, all whole numbers
const hsl = (r: number, g: number, b: number): string => cssHsl(rgbToHsl({ r, g, b }));
ok("#FF5733 (255,87,51) is hsl(11, 100%, 60%); the intranet's indigo (79,70,229) is hsl(243, 75%, 59%)", hsl(255, 87, 51) === "hsl(11, 100%, 60%)" && hsl(79, 70, 229) === "hsl(243, 75%, 59%)");
ok("the pure colours: red 0, yellow 60, green 120, cyan 180, blue 240, magenta 300 degrees, all at 100% and 50%", hsl(255, 0, 0) === "hsl(0, 100%, 50%)" && hsl(255, 255, 0) === "hsl(60, 100%, 50%)" && hsl(0, 255, 0) === "hsl(120, 100%, 50%)" && hsl(0, 255, 255) === "hsl(180, 100%, 50%)" && hsl(0, 0, 255) === "hsl(240, 100%, 50%)" && hsl(255, 0, 255) === "hsl(300, 100%, 50%)");
ok("greys have no saturation and no hue: black hsl(0, 0%, 0%), white hsl(0, 0%, 100%), 128 grey hsl(0, 0%, 50%)", hsl(0, 0, 0) === "hsl(0, 0%, 0%)" && hsl(255, 255, 255) === "hsl(0, 0%, 100%)" && hsl(128, 128, 128) === "hsl(0, 0%, 50%)");
ok("the hue never reaches 360: a colour just short of red round the wheel (255,0,1) is hue 0, not 360", rgbToHsl({ r: 255, g: 0, b: 1 }).h === 0);

// HSL -> RGB
const rgbOf = (h: number, s: number, l: number): string => toHex(hslToRgb({ h, s, l }));
ok("the pure colours come back exactly: hsl(0,100%,50%) is #FF0000, 120 is #00FF00, 240 is #0000FF, 60 is #FFFF00, 180 is #00FFFF, 300 is #FF00FF", rgbOf(0, 100, 50) === "#FF0000" && rgbOf(120, 100, 50) === "#00FF00" && rgbOf(240, 100, 50) === "#0000FF" && rgbOf(60, 100, 50) === "#FFFF00" && rgbOf(180, 100, 50) === "#00FFFF" && rgbOf(300, 100, 50) === "#FF00FF");
ok("black and white and a grey, whatever the hue: lightness 0 is #000000, 100 is #FFFFFF, saturation 0 at 50% is #808080", rgbOf(200, 80, 0) === "#000000" && rgbOf(200, 80, 100) === "#FFFFFF" && rgbOf(77, 0, 50) === "#808080");
ok("hue 360 is hue 0 (red) and a negative or large hue wraps round the wheel", rgbOf(360, 100, 50) === "#FF0000" && rgbOf(-120, 100, 50) === "#0000FF" && rgbOf(480, 100, 50) === "#00FF00");
ok("HSL is shown in whole numbers, so RGB -> HSL -> RGB is within 3 of each channel (hsl(11, 100%, 60%) is #FF5833, a point from #FF5733), never wrong by more", (() => {
  for (let r = 0; r < 256; r += 15) for (let g = 0; g < 256; g += 15) for (let b = 0; b < 256; b += 15) {
    const back = hslToRgb(rgbToHsl({ r, g, b }));
    if (Math.abs(back.r - r) > 3 || Math.abs(back.g - g) > 3 || Math.abs(back.b - b) > 3) return false;
  }
  return rgbOf(11, 100, 60) === "#FF5833";
})());
ok("the stylesheet form is hsl(243, 75%, 59%)", cssHsl({ h: 243, s: 75, l: 59 }) === "hsl(243, 75%, 59%)");

// an HSL box
ok("hue 0 to 360, saturation and lightness 0 to 100, with or without % or the degree sign, decimals allowed: '11', '360', '11°', '100%', '50.5', ' 7 '", parseHslPart("11", 360) === 11 && parseHslPart("360", 360) === 360 && parseHslPart("11°", 360) === 11 && parseHslPart("100%", 100) === 100 && parseHslPart("50.5", 100) === 50.5 && parseHslPart(" 7 ", 100) === 7);
ok("not an HSL part: hue 361, saturation 101, -1, 'abc', '', '1e2', '5%%'", parseHslPart("361", 360) === null && parseHslPart("101", 100) === null && parseHslPart("-1", 100) === null && parseHslPart("abc", 100) === null && parseHslPart("", 100) === null && parseHslPart("1e2", 100) === null && parseHslPart("5%%", 100) === null);
ok("three boxes make an HSL colour only when all three are valid", parseHslBoxes("11", "100", "60")?.l === 60 && parseHslBoxes("11", "100", "") === null && parseHslBoxes("361", "0", "0") === null && parseHslBoxes("0", "101", "0") === null);

// readable ink
ok("black ink on white and yellow, white ink on black and indigo", inkOn({ r: 255, g: 255, b: 255 }) === "#0f172a" && inkOn({ r: 255, g: 255, b: 0 }) === "#0f172a" && inkOn({ r: 0, g: 0, b: 0 }) === "#ffffff" && inkOn({ r: 79, g: 70, b: 229 }) === "#ffffff");

// the typed line
const hexOf = (q: string): string | null => parseColour(q)?.hex ?? null;
ok("a HEX with # is a colour: '#ff5733', '#FF5733 to rgb', '#f53', '#ff5733 in rgb', 'css color #fff'", hexOf("#ff5733") === "#FF5733" && hexOf("#FF5733 to rgb") === "#FF5733" && hexOf("#f53") === "#FF5533" && hexOf("#ff5733 in rgb") === "#FF5733" && hexOf("css color #fff") === "#FFFFFF");
ok("a HEX without # needs the word hex: 'hex ff5733', 'hex code ff5733', 'ff5733 hex to rgb', 'hex #ff5733'", hexOf("hex ff5733") === "#FF5733" && hexOf("hex code ff5733") === "#FF5733" && hexOf("ff5733 hex to rgb") === "#FF5733" && hexOf("hex #ff5733") === "#FF5733");
ok("an RGB: 'rgb(255, 87, 51)', 'rgb(255,87,51) to hex', 'rgb 255 87 51', 'RGB 255,87,51 to hex', '255 87 51 to hex', '255,87,51 to hex', '(255, 87, 51) in hex'", ["rgb(255, 87, 51)", "rgb(255,87,51) to hex", "rgb 255 87 51", "RGB 255,87,51 to hex", "255 87 51 to hex", "255,87,51 to hex", "(255, 87, 51) in hex"].every((q) => hexOf(q) === "#FF5733"));
ok("the bare question opens with the default colour: 'rgb to hex', 'hex to rgb', 'rgb to hex converter', 'hex to rgb?', 'colour converter', 'color picker', 'hex code converter', 'hex to hsl', 'hsl to rgb', 'rgb to hex to hsl', 'rgb hex hsl converter'", ["rgb to hex", "hex to rgb", "rgb to hex converter", "hex to rgb?", "colour converter", "color picker", "hex code converter", "RGB TO HEX", "hex to hsl", "hsl to rgb", "rgb to hex to hsl", "rgb, hex and hsl", "hsl converter"].every((q) => hexOf(q) === DEFAULT_HEX));
ok("an HSL is a colour: 'hsl(0, 100%, 50%)', 'hsl 120 100 50', 'hsl(240deg 100% 50%) to hex', 'hsl(11, 100%, 60%) to rgb'; and '#ff5733 to hsl', '255,87,51 to hsl', 'rgb(255,87,51) to hsl' name the colour they hold", hexOf("hsl(0, 100%, 50%)") === "#FF0000" && hexOf("hsl 120 100 50") === "#00FF00" && hexOf("hsl(240deg 100% 50%) to hex") === "#0000FF" && hexOf("hsl(11, 100%, 60%) to rgb") === "#FF5833" && hexOf("#ff5733 to hsl") === "#FF5733" && hexOf("255,87,51 to hsl") === "#FF5733" && hexOf("rgb(255,87,51) to hsl") === "#FF5733");
ok("not a colour: a plain number or word, hex digits without a hint, a channel out of range, too long", ["ff5733", "bad", "add", "123456", "255 87 51", "255,87,51", "12 34 56", "rgb 256 0 0", "rgb(1,2)", "#12345", "#gggggg", "hex 12345", "hsl 361 0 0", "hsl(1,2)", "hsl 0 101 0", "rgb to rgb", "hex to hex", "hsl to hsl", "rgb to hex of the whole of the plant's office wall please now"].every((q) => parseColour(q) === null), ["ff5733", "bad", "add", "123456", "255 87 51", "255,87,51", "12 34 56", "rgb 256 0 0", "rgb(1,2)", "#12345", "#gggggg", "hex 12345"].filter((q) => parseColour(q) !== null).join(" | "));
ok("the other conversions are not taken: '5 km in miles', '100 usd to inr', '98.6 f to c', '12*45+7', 'calculator'", ["5 km in miles", "100 usd to inr", "98.6 f to c", "12*45+7", "calculator", "bhp to ps"].every((q) => parseColour(q) === null));

// Here I test the spinner arrows and the Up/Down keys
ok("stepping a channel: 87 up is 88, down is 86; Shift (10) gives 97", stepPart("87", 1, 0, 255, 0) === "88" && stepPart("87", -1, 0, 255, 0) === "86" && stepPart("87", 10, 0, 255, 0) === "97");
ok("a channel stops at its ends: 255 up stays 255, 0 down stays 0, 250 up by 10 is 255", stepPart("255", 1, 0, 255, 0) === "255" && stepPart("0", -1, 0, 255, 0) === "0" && stepPart("250", 10, 0, 255, 0) === "255");
ok("the hue goes to 360 and no further; saturation and lightness stop at 100", stepPart("359", 1, 0, 360, 0) === "360" && stepPart("360", 1, 0, 360, 0) === "360" && stepPart("100", 1, 0, 100, 0) === "100");
ok("text that is not a number steps from the colour's own value: '' up from 51 is 52, 'x' down from 0 is 0", stepPart("", 1, 0, 255, 51) === "52" && stepPart("x", -1, 0, 255, 0) === "0");
ok("a % or degree sign and spaces are read as in the boxes: '60%' up is 61, ' 11° ' down is 10; a decimal keeps no float dust: 11.1 up is 12.1", stepPart("60%", 1, 0, 100, 0) === "61" && stepPart(" 11° ", -1, 0, 360, 0) === "10" && stepPart("11.1", 1, 0, 360, 0) === "12.1");
ok("a wrong number is pulled back in range: 300 down in 0..255 is 255", stepPart("300", -1, 0, 255, 0) === "255");

console.log(`colour: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

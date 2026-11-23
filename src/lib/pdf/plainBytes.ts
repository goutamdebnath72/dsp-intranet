// src/lib/pdf/plainBytes.ts
//
// THE BYTES OF A PDF, AS A PLAIN COPY, FOR pdf-parse. pdf-parse (1.1.1, last released in 2018) carries an old pdf.js (1.10.100). On Node 24 that engine fails at random (about 4 reads in 10:
// "bad XRef entry", "Illegal character: 41") when it is handed a Node Buffer, and never fails when it is handed a plain Uint8Array holding the same bytes (36 of 36 reads, measured on Node 24.22 with two PDFs;
// Node 22 reads both forms every time). The copy costs one pass over the file and changes nothing on Node 22, so I send every call of pdf-parse through here (src/lib/pdf/plainBytes.selftest.ts checks that none forgets).
// pdf-to-img (a current pdfjs-dist) was measured on the same Node and reads a Buffer every time, so it does not need this.

export function plainBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

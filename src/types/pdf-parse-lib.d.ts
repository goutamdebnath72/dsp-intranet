// I import the text reader of pdf-parse from its lib folder, because the package's own index file tries to read a test file when it is bundled (the live fuel route does the same).
declare module "pdf-parse/lib/pdf-parse.js" {
  const pdfParse: (data: Uint8Array) => Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}

// The text reader of pdf-parse, taken from its lib folder: the package's own index file tries to read a test file when it is bundled, so the lib file is imported instead (as the live fuel route does).
declare module "pdf-parse/lib/pdf-parse.js" {
  const pdfParse: (data: Buffer) => Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}

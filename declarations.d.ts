declare module "pdf-poppler";

// Keep this in your declarations.d.ts file.

declare module "pdf-to-text" {
  // I define the TDocument type based on the library's output.
  type TDocument = string | string[];

  // I define the main 'pdf' function here.
  export function pdf(buffer: Buffer, options?: any): Promise<TDocument>;
}

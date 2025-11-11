declare module "pdf-poppler";

// Add this to your declarations.d.ts file

declare module "pdf-to-text" {
  // Define the TDocument type based on the library's output
  type TDocument = string | string[];

  // Define the main 'pdf' function
  export function pdf(buffer: Buffer, options?: any): Promise<TDocument>;
}

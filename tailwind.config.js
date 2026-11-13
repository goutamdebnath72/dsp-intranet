/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // helpers outside components that draw markup with Tailwind classes (the sticky toast's close button, the search highlighter): without these
    // folders their classes are never generated and the markup is drawn unstyled
    "./src/lib/ui/**/*.{ts,tsx}",
    "./src/lib/utils/**/*.{ts,tsx}",
    // the topics of the search bar's tools (calculators, converters, readers, guides): each folder draws its own cards, so without this folder none of their classes would be generated
    "./src/tools/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        "lg-custom": "1500px",
        "xl-custom": "1800px",
      },
      colors: {
        primary: {
          50: "var(--color-primary-50)",
          100: "var(--color-primary-100)",
          200: "var(--color-primary-200)",
          300: "var(--color-primary-300)",
          400: "var(--color-primary-400)",
          500: "var(--color-primary-500)",
          600: "var(--color-primary-600)",
          700: "var(--color-primary-700)",
          800: "var(--color-primary-800)",
          900: "var(--color-primary-900)",
          950: "var(--color-primary-950)",
        },
        neutral: {
          50: "var(--color-neutral-50)",
          100: "var(--color-neutral-100)",
          200: "var(--color-neutral-200)",
          300: "var(--color-neutral-300)",
          400: "var(--color-neutral-400)",
          500: "var(--color-neutral-500)",
          600: "var(--color-neutral-600)",
          700: "var(--color-neutral-700)",
          800: "var(--color-neutral-800)",
          900: "var(--color-neutral-900)",
          950: "var(--color-neutral-950)",
        },
        "link-blue": "var(--color-link-blue)",
      },
      fontFamily: {
        sans: ["var(--font-poppins)"],
        heading: ["var(--font-source-sans)"],
      },
    },
  },
  plugins: [],
};

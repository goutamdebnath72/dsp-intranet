// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],

    theme: {
        // Tailwind v4 automatically reads our @theme definitions
        // from globals.css, so we no longer need to extend here.
        // We can still define spacing, shadows, or other tokens if desired.
    },

    // Plugins (optional)
    plugins: [
        // Example: forms, typography, aspect-ratio, etc.
        // require('@tailwindcss/forms'),
        // require('@tailwindcss/typography'),
    ],
};

export default config;

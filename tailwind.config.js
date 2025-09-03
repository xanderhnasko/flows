/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          river: '#0ea5e9',
        },
        green: {
          normal: '#10b981',
          high: '#059669',
        },
        red: {
          low: '#ef4444',
        },
        yellow: {
          caution: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
}
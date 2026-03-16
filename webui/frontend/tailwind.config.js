/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow:{
        "login-card": "5px 5px 4px rgba(0, 0, 0, 0.3)",
        "content-card": "3px 3px 4px rgba(0, 0, 0, 0.57)",
        "shadow-light": "3px 3px 4px rgba(0, 0, 0, 0.2)"
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-fade-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "tab-enter": {
          from: { opacity: "0", maxWidth: "0px" },
          to: { opacity: "1", maxWidth: "300px" },
        },
        "login-fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "login-fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "notification-in": {
          from: { opacity: "0", transform: "translateX(80px)" },
          to: { opacity: "1", transform: "none" },
        },
        "notification-out": {
          from: { opacity: "1", transform: "none" },
          to: { opacity: "0", transform: "translateX(80px)" },
        },
        "card-enter": {
          from: { opacity: "0", transform: "translateY(24px) scale(0.97)" },
          to: { opacity: "1", transform: "none" },
        },
        "page-exit": {
          from: { filter: "opacity(1)", transform: "none" },
          to: { filter: "opacity(0)", transform: "translateY(-12px) scale(0.98)" },
        },
        "page-enter": {
          from: { opacity: "0", transform: "translateY(16px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s ease-out",
        "fade-slide-up": "fade-slide-up 0.35s ease-out both",
        "scale-fade-in": "scale-fade-in 0.2s ease-out",
        "tab-enter": "tab-enter 0.25s ease-out both",
        "login-fade-out": "login-fade-out 1s ease-in forwards",
        "login-fade-in": "login-fade-in 1s ease-out forwards",
        "notification-in": "notification-in 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "notification-out": "notification-out 0.3s ease-in forwards",
        "card-enter": "card-enter 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "page-exit": "page-exit 0.2s ease-in both",
        "page-enter": "page-enter 0.35s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
}

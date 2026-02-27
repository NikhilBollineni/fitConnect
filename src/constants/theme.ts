
// FitConnect Shared Design System
// We define these in a constant so we can swap them out OR use them as Tailwind tokens.
// This is your Source of Truth for colors.

export const COLORS = {
    primary: "#19e65e",
    primaryForeground: "#000000",

    background: "#112116",
    foreground: "#ffffff",

    backgroundLight: "#162b1d", // slightly lighter for cards
    backgroundDark: "#0a1a0f",  // darker for headers/footers
    muted: "#64748b",
    border: "rgba(255, 255, 255, 0.1)",

    destructive: "#ef4444",
};

export const FONTS = {
    display: "Lexend", // Will need to load this font in App.js
    body: "System",
};

export default { COLORS, FONTS };

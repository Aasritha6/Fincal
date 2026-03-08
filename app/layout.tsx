import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 1. CRITICAL VIEWPORT CONFIG (Mobile Responsive & Touch Friendly)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allows accessibility zooming (WCAG compliant)
  userScalable: true,
  themeColor: "#224c87", // HDFC Blue mobile browser header
};

// 2. UPDATED METADATA (Professional Title & Description)
export const metadata: Metadata = {
  title: "Goal-Based Planner | Investor Education",
  description: "Educational tool for SIP and goal-based financial planning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

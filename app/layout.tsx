import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "Opportunity",
  title: {
    default: "Opportunity — prospection locale pour refontes de sites",
    template: "%s — Opportunity",
  },
  description:
    "Workspace local-first qui repere les entreprises locales dont le site web merite une refonte, les score et genere un brief commercial.",
  keywords: [
    "prospection locale",
    "refonte site web",
    "audit site web",
    "Google Places",
    "lead generation",
  ],
  openGraph: {
    title: "Opportunity",
    description:
      "Reperez les entreprises locales dont le site web merite une refonte et preparez un brief commercial.",
    type: "website",
    images: [
      {
        url: "/screenshots/workspace.png",
        width: 1440,
        height: 960,
        alt: "Carte et liste de prospects scores dans Opportunity",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Opportunity",
    description:
      "Prospection locale pour vendeurs de refontes de sites web.",
    images: ["/screenshots/workspace.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

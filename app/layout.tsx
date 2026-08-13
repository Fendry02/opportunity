import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/*
 * Applique le thème choisi avant la première peinture : sans ça, une page
 * demandée en sombre s'afficherait en clair le temps que React s'hydrate, d'où
 * un flash blanc. Le système reste la valeur par défaut (géré en CSS).
 */
const THEME_INIT = `
try {
  var t = localStorage.getItem('opportunity:theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
`;

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
    <html
      lang="fr"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./tailwind.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPHEREx Time Machine | Ver el Cielo Moverse",
  description:
    "Escribe unas coordenadas o el nombre de una estrella y mira el cielo infrarrojo moverse. Descubre asteroides, enanas marrones y estrellas variables con el telescopio espacial SPHEREx de la NASA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <head>
        {/* Preconnect */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Fuente display: DM Serif Display (serif) */}
        {/* Fuente body: Inter (humanista sans) */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--bg)",
          color: "var(--ink)",
          margin: 0,
        }}
      >
        {children}
      </body>
    </html>
  );
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IOG Dashboard — Octopus Intelligent Go",
    short_name: "IOG Dashboard",
    description:
      "Daily electricity cost breakdown for Octopus Intelligent Go tariff",
    start_url: "/",
    display: "standalone",
    background_color: "#050509",
    theme_color: "#050509",
    icons: [
      {
        src: "/icon-192x192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512x512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

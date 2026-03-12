import { Banner, Head } from "nextra/components";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { getPageMap } from "nextra/page-map";
import type { Metadata } from "next";
import React from "react";
import "nextra-theme-docs/style.css";
import themeConfig from "../theme.config";

export const metadata: Metadata = {
  metadataBase: new URL("https://whisker17.github.io/mantle-agent-scaffold"),
  title: {
    default: "Mantle MCP Docs",
    template: "%s - Mantle MCP Docs"
  },
  description: "Documentation for Mantle MCP implementation up to v0.2.9."
};

const navbar = <Navbar logo={themeConfig.logo} projectLink={themeConfig.project?.link} />;
const footer = <Footer>{themeConfig.footer?.text}</Footer>;

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head
        color={{
          hue: {
            dark: 204,
            light: 212
          },
          saturation: {
            dark: 100,
            light: 100
          },
          lightness: {
            dark: 55,
            light: 45
          }
        }}
      >
        {themeConfig.head}
      </Head>
      <body>
        <Layout
          banner={<Banner storageKey="mantle-mcp-docs-banner">Mantle MCP v0.2.9</Banner>}
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase={themeConfig.docsRepositoryBase}
          footer={footer}
          editLink={null}
          feedback={{ content: null }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}

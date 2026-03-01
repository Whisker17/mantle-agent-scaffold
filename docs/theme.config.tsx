import React from "react";

const config = {
  logo: <span>Mantle MCP Docs</span>,
  project: {
    link: "https://github.com/Whisker17/mantle-agent-scaffold"
  },
  docsRepositoryBase:
    "https://github.com/Whisker17/mantle-agent-scaffold/tree/main/docs",
  footer: {
    text: "Mantle MCP Documentation (v0.2.5)"
  },
  useNextSeoProps() {
    return {
      titleTemplate: "%s - Mantle MCP Docs"
    };
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta
        name="description"
        content="Documentation for Mantle MCP implementation up to v0.2.5."
      />
      <meta name="og:title" content="Mantle MCP Docs" />
    </>
  )
};

export default config;

# Mantle MCP Docs Site

This directory hosts the Nextra documentation site for Mantle MCP.

## Scope

Current content is aligned to implementation status up to **v0.2.6**.

## Run Locally

```bash
cd docs
npm install --cache ../.npm-cache
npm run dev
```

## Build

```bash
cd docs
HOME=$PWD npm run build
```

Setting `HOME=$PWD` avoids cache write issues in restricted environments.

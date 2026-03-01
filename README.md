# SonarQube MCP Server

MCP server for integrating with SonarQube Server REST API via stdio.

Runtime: Bun

## Setup

```bash
cp .env.example .env

# Edit .env with your credentials
SONARQUBE_URL=https://your-server.example.com
SONARQUBE_TOKEN=your-user-token
```

## Installation

```bash
bun install
```

## Run

```bash
bun run src/index.ts
```

## Validation with MCP Inspector

```bash
npx @modelcontextprotocol/inspector bun /Users/ajcm/my-mcps/sonar-mcp-server/src/index.ts
```

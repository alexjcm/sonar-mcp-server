function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(
      `[sonarqube-mcp] ERROR: Environment variable "${name}" is required but not defined.\n` +
        `  Copy .env.example to .env and configure the value.\n`
    );
    process.exit(1);
  }
  return value;
}

export const config = {
  sonarqubeUrl: requireEnv("SONARQUBE_URL").replace(/\/$/, ""),
  sonarqubeToken: requireEnv("SONARQUBE_TOKEN"),
} as const;

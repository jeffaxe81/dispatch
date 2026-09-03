import net from "node:net";

type PortAvailabilityCheck = (port: number) => Promise<boolean>;

export function parseServerPort(value: string | undefined): number {
  if (value === undefined) return 3000;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("PORT deve ser um número inteiro entre 1 e 65535.");
  }

  const port = Number(normalized);
  if (port < 1 || port > 65_535) {
    throw new Error("PORT deve ser um número inteiro entre 1 e 65535.");
  }
  return port;
}

export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort(
  startPort = 3000,
  isAvailable: PortAvailabilityCheck = isPortAvailable,
): Promise<number> {
  const lastPort = Math.min(startPort + 19, 65_535);
  for (let port = startPort; port <= lastPort; port += 1) {
    if (await isAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function selectServerPort(input: {
  configuredPort: number;
  isProduction: boolean;
  isAvailable?: PortAvailabilityCheck;
}): Promise<number> {
  if (input.isProduction) return input.configuredPort;
  return findAvailablePort(input.configuredPort, input.isAvailable);
}

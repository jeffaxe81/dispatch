import { validateIntegrationEnvironment } from "./server/test/integrationEnvironment";

export default function setupIntegrationEnvironment(): void {
  validateIntegrationEnvironment(process.env);
}

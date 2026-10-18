import { getSlaMysqlTestSettings } from "./server/test/slaMysqlEnvironment";

export default function validateSlaMysqlHomologationEnvironment() {
  // Pure validation; no connection/migration before the test harness empty-schema check.
  getSlaMysqlTestSettings(process.env);
}

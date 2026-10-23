-- D-012J J31: additive one-shot probe execution intent bound to the fenced lease.
-- DO NOT execute on a production database without explicit approval.
ALTER TABLE `integration_circuit_state`
  ADD COLUMN `probe_execution_token` varchar(160),
  ADD COLUMN `probe_execution_expires_at_ms` bigint unsigned,
  ADD COLUMN `probe_execution_consumed_at_ms` bigint unsigned;

-- D-012J J27: additive fenced probe lease for tenant/system circuit state.
-- DO NOT execute on a production database without explicit approval.
ALTER TABLE `integration_circuit_state`
  ADD COLUMN `probe_lease_owner` varchar(120),
  ADD COLUMN `probe_lease_token` varchar(160),
  ADD COLUMN `probe_lease_expires_at_ms` bigint unsigned;

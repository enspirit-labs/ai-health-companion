// Runs before any spec file is imported. ConfigModule.forRoot reads and validates the environment
// when app.module.ts is first imported, so these must be set here, not inside createTestApp().
//
// The e2e specs drive chat send and assessment complete many times from one user, which the
// per-user AI throttle would otherwise cap, so raise its limits unless the caller set them.
for (const key of [
  'AI_THROTTLE_CHAT_PER_MINUTE',
  'AI_THROTTLE_CHAT_PER_HOUR',
  'AI_THROTTLE_COMPLETE_PER_MINUTE',
  'AI_THROTTLE_COMPLETE_PER_HOUR',
]) {
  process.env[key] ??= '10000';
}

// `server-only` throws when imported outside a React Server Component graph,
// which would break any unit test that touches a server module. Vitest aliases
// the package to this no-op so the pure logic inside those modules stays
// testable without loosening the guard in application code.
export {};

// Build-time stub used ONLY when the optional `@hot-labs/near-connect`
// dependency could not be installed (network issues). src/lib/near.ts
// imports it dynamically and treats any failure as "practice-only mode".
class StubError extends Error {
  constructor() {
    super('@hot-labs/near-connect is not available in this build; practice-only mode');
    this.name = 'DerelictVendorStubError';
  }
}

export class NearConnector {
  constructor() {
    throw new StubError();
  }
}

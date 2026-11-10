// Build-time stub used ONLY when the optional `near-api-js` dependency could
// not be installed (network issues). src/lib/near.ts imports it dynamically
// and treats any failure as "wallet signing unavailable".
class StubError extends Error {
  constructor() {
    super('near-api-js is not available in this build; wallet signing unavailable');
    this.name = 'DerelictVendorStubError';
  }
}

export class JsonRpcProvider {
  constructor() {
    throw new StubError();
  }
}

export class FailoverRpcProvider {
  constructor() {
    throw new StubError();
  }
}

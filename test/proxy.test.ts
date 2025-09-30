import { tiged } from 'tiged';

describe('proxy option', () => {
  it('prefers explicit proxy option over environment', () => {
    const t = tiged('tiged/tiged-test-repo', { proxy: 'http://cli-proxy:8080' } as any);
    // @ts-ignore access internal property for test
    expect((t as any).proxy).toBe('http://cli-proxy:8080');
  });

  it('falls back to env when option not provided', () => {
    const old = process.env.https_proxy;
    try {
      process.env.https_proxy = 'http://env-proxy:8080';
      const t = tiged('tiged/tiged-test-repo');
      // @ts-ignore access internal property for test
      expect((t as any).proxy).toBe('http://env-proxy:8080');
    } finally {
      process.env.https_proxy = old;
    }
  });
});

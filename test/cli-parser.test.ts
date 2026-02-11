import { describe, expect, it, vi } from 'vitest';
import parseCliArgs from '../src/cli-parser.js';

const tigedOptions = {
  alias: {
    f: 'force',
    c: 'cache',
    o: 'offline-mode',
    D: 'disable-cache',
    v: 'verbose',
    m: 'mode',
    s: 'subgroup',
    d: 'sub-directory',
    p: 'proxy',
  },
  boolean: [
    'force',
    'cache',
    'offline-mode',
    'disable-cache',
    'verbose',
    'subgroup',
  ],
};

const parse = (args: any[], options?: Parameters<typeof parseCliArgs>[1]) =>
  parseCliArgs(args, options);

describe('cli parser (tiged usage)', () => {
  it('parses tiged flags and aliases', () => {
    const argv = parse(
      ['-v', '-c', '--offline-mode', 'repo', 'dest'],
      tigedOptions,
    );

    expect(argv._).toEqual(['repo', 'dest']);
    expect(argv.verbose).toBe(true);
    expect(argv.v).toBe(true);
    expect(argv.cache).toBe(true);
    expect(argv.c).toBe(true);
    expect(argv['offline-mode']).toBe(true);
    expect(argv.o).toBe(true);
  });

  it('accepts flags anywhere with values', () => {
    const argv = parse(
      ['repo', '-v', 'dest', '--proxy', 'http://proxy.local'],
      tigedOptions,
    );

    expect(argv._).toEqual(['repo', 'dest']);
    expect(argv.verbose).toBe(true);
    expect(argv.proxy).toBe('http://proxy.local');
    expect(argv.p).toBe('http://proxy.local');
  });

  it('handles mixed ordering with aliases and values', () => {
    const argv = parse(
      ['-p', 'http://proxy.local', 'repo', '-v', 'dest', '--cache'],
      tigedOptions,
    );

    expect(argv._).toEqual(['repo', 'dest']);
    expect(argv.proxy).toBe('http://proxy.local');
    expect(argv.p).toBe('http://proxy.local');
    expect(argv.verbose).toBe(true);
    expect(argv.cache).toBe(true);
  });

  it('casts explicit boolean values', () => {
    const argv = parse(['--cache', 'false', 'repo'], tigedOptions);

    expect(argv.cache).toBe(false);
    expect(argv._).toEqual(['repo']);
  });
});

describe('cli parser (additional behavior)', () => {
  it('treats short flag groups as booleans by default', () => {
    const argv = parse(['-mtv', 'hello']);

    expect(argv.m).toBe(true);
    expect(argv.t).toBe(true);
    expect(argv.v).toBe('hello');
  });

  it('honors default types when parsing', () => {
    const argv = parse(['--foo', 'bar'], {
      default: { foo: true, baz: 'hello', bat: 42 },
    });

    expect(argv.foo).toBe(true);
    expect(argv.baz).toBe('hello');
    expect(argv.bat).toBe(42);
    expect(argv._).toEqual(['bar']);
  });

  it('handles empty strings for string options', () => {
    const argv = parse(['--str'], { string: 'str' });

    expect(argv.str).toBe('');
  });

  it('pushes boolean values into positional args', () => {
    const argv = parse(['-b', '123'], { boolean: 'b' });

    expect(argv.b).toBe(true);
    expect(argv._).toEqual([123]);
  });

  it('collects repeated values into arrays', () => {
    const argv = parse(['-v', 'a', '-v', 'b', '-v', 'c']);

    expect(argv.v).toEqual(['a', 'b', 'c']);
  });

  it('stops parsing on unknown flags when configured', () => {
    const unknown = vi.fn(() => 'stop');
    const localResult = parseCliArgs(['--known', '1', '--wat'], {
      alias: { known: 'k' },
      unknown,
    });

    expect(unknown).toHaveBeenCalledWith('--wat');
    expect(localResult).toBe('stop');
  });

  it('preserves arguments after --', () => {
    const argv = parse(['--foo', 'bar', '--', '--not-a-flag', 'arg']);

    expect(argv.foo).toBe('bar');
    expect(argv._).toEqual(['--not-a-flag', 'arg']);
  });

  it('parses multi-alias and repeated values', () => {
    const argv = parse(['-f', '11', '--zoom', '55'], {
      alias: { z: ['zm', 'zoom'] },
    });

    expect(argv.zoom).toBe(55);
    expect(argv.z).toBe(55);
    expect(argv.zm).toBe(55);
    expect(argv.f).toBe(11);
  });

  it('casts numbers and keeps non-numeric strings', () => {
    const argv = parse(['-x', '1234', '--hex', '0xdeadbeef', '789']);

    expect(argv.x).toBe(1234);
    expect(argv.hex).toBe(0xdeadbeef);
    expect(argv._).toEqual(['789']);
  });

  it('honors boolean defaults with --no-*', () => {
    const argv = parse(['--no-two'], { default: { two: true } });

    expect(argv.two).toBe(false);
  });

  it('keeps string aliases as strings', () => {
    const argv = parse(['--str', '000123'], {
      string: 's',
      alias: { s: 'str' },
    });

    expect(argv.str).toBe('000123');
    expect(argv.s).toBe('000123');
  });

  it('handles non-string positional values', () => {
    const argv = parse(['-x', 1234, 789] as any);

    expect(argv.x).toBe(1234);
    expect(argv._).toEqual([789]);
  });
});

type Arrayable<T> = T | T[];

type Dict<T> = Record<string, T>;

export interface CliParserOptions {
  boolean?: Arrayable<string>;
  string?: Arrayable<string>;
  alias?: Dict<Arrayable<string>>;
  default?: Dict<any>;
  unknown?(flag: string): any;
}

export type CliParserArgv<T = Dict<any>> = T & { _: any[] };

interface NormalizedOptions {
  alias: Record<string, string[]>;
  boolean: string[];
  string: string[];
  default: Dict<any>;
  unknown?: (flag: string) => any;
}

const toArray = <T>(value: Arrayable<T> | undefined | null): T[] => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const toValue = (
  out: CliParserArgv,
  key: string,
  val: any,
  opts: Pick<NormalizedOptions, 'string' | 'boolean'>,
) => {
  const oldValue = out[key];
  let nextValue: any;

  if (opts.string.indexOf(key) !== -1) {
    nextValue = val == null || val === true ? '' : String(val);
  } else if (typeof val === 'boolean') {
    nextValue = val;
  } else if (opts.boolean.indexOf(key) !== -1) {
    if (val === 'false') {
      nextValue = false;
    } else if (val === 'true') {
      nextValue = true;
    } else {
      const numeric = +val;
      out._.push(numeric * 0 === 0 ? numeric : val);
      nextValue = !!val;
    }
  } else {
    const numeric = +val;
    nextValue = numeric * 0 === 0 ? numeric : val;
  }

  if (oldValue == null) {
    out[key] = nextValue;
  } else if (Array.isArray(oldValue)) {
    out[key] = oldValue.concat(nextValue);
  } else {
    out[key] = [oldValue, nextValue];
  }
};

const normalizeAliases = (opts: NormalizedOptions) => {
  for (const key of Object.keys(opts.alias)) {
    const aliases = toArray(opts.alias[key] ?? []);
    opts.alias[key] = aliases;
    for (let i = 0; i < aliases.length; i += 1) {
      const alias = aliases[i];
      if (!alias) continue;
      const group = aliases.concat(key);
      group.splice(i, 1);
      opts.alias[alias] = group;
    }
  }
};

const normalizeOptions = (options: CliParserOptions): NormalizedOptions => {
  const alias: Record<string, string[]> = {};

  if (options.alias) {
    for (const key of Object.keys(options.alias)) {
      alias[key] = toArray(options.alias[key]);
    }
  }

  return {
    alias,
    boolean: toArray(options.boolean),
    string: toArray(options.string),
    default: options.default || {},
    unknown: options.unknown,
  };
};

export default function parseCliArgs<T = Dict<any>>(
  args: any[] = [],
  options: CliParserOptions = {},
): CliParserArgv<T> | any {
  const out: CliParserArgv = { _: [] };
  const opts = normalizeOptions(options);

  const hasAliases = options.alias !== undefined;
  const strict = options.unknown !== undefined;
  const hasDefaults = options.default !== undefined;
  if (hasAliases) {
    normalizeAliases(opts);
  }

  for (let i = opts.boolean.length; i-- > 0; ) {
    const key = opts.boolean[i];
    if (!key) continue;
    const list = opts.alias[key] ?? [];
    for (let j = list.length; j-- > 0; ) {
      const alias = list[j];
      if (alias) opts.boolean.push(alias);
    }
  }

  for (let i = opts.string.length; i-- > 0; ) {
    const key = opts.string[i];
    if (!key) continue;
    const list = opts.alias[key] ?? [];
    for (let j = list.length; j-- > 0; ) {
      const alias = list[j];
      if (alias) opts.string.push(alias);
    }
  }

  if (hasDefaults) {
    for (const key of Object.keys(opts.default)) {
      const type = typeof opts.default[key];
      const list = (opts.alias[key] = opts.alias[key] || []);
      const targetList =
        type === 'boolean'
          ? opts.boolean
          : type === 'string'
            ? opts.string
            : null;
      if (targetList) {
        targetList.push(key);
        for (const alias of list) {
          if (alias) targetList.push(alias);
        }
      }
    }
  }

  const allowedKeys = strict ? Object.keys(opts.alias) : [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--') {
      out._ = out._.concat(args.slice(i + 1));
      break;
    }

    if (typeof arg !== 'string') {
      out._.push(arg);
      continue;
    }

    let dashCount = 0;
    for (; dashCount < arg.length; dashCount += 1) {
      if (arg.charCodeAt(dashCount) !== 45) break;
    }

    if (dashCount === 0) {
      out._.push(arg);
      continue;
    }

    if (arg.substring(dashCount, dashCount + 3) === 'no-') {
      const name = arg.substring(dashCount + 3);
      if (strict && allowedKeys.indexOf(name) === -1) {
        return opts.unknown ? opts.unknown(arg) : undefined;
      }
      out[name] = false;
      continue;
    }

    let idx = dashCount + 1;
    for (; idx < arg.length; idx += 1) {
      if (arg.charCodeAt(idx) === 61) break;
    }

    let name = arg.substring(dashCount, idx);
    const nextIndex = idx + 1;
    const inlineValue = arg.substring(nextIndex);
    const nextArg = args[i + 1];
    const nextArgString = nextArg == null ? '' : String(nextArg);
    const nextIsFlag = nextArgString.charCodeAt(0) === 45;
    const value =
      inlineValue || (i + 1 === args.length || nextIsFlag ? true : args[++i]);

    const list = dashCount === 2 ? [name] : name;

    for (let j = 0; j < list.length; j += 1) {
      const nextName = typeof list === 'string' ? list.charAt(j) : list[j];
      if (!nextName) continue;
      name = nextName;
      if (strict && allowedKeys.indexOf(name) === -1) {
        return opts.unknown
          ? opts.unknown('-'.repeat(dashCount) + name)
          : undefined;
      }
      toValue(out, name, j + 1 < list.length || value, opts);
    }
  }

  if (hasDefaults) {
    for (const key of Object.keys(opts.default)) {
      if (out[key] === undefined) {
        out[key] = opts.default[key];
      }
    }
  }

  if (hasAliases) {
    for (const key of Object.keys(out)) {
      const list = opts.alias[key] ?? [];
      while (list.length > 0) {
        const alias = list.shift();
        if (alias) out[alias] = out[key];
      }
    }
  }

  return out as CliParserArgv<T>;
}

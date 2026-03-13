import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { TigedError } from './utils.js';

const gunzipAsync = promisify(gunzip);

type TarType = 'file' | 'directory' | 'other';

type TarHeader = {
  name: string;
  mode?: number;
  size: number;
  type: TarType;
};

const isZeroBlock = (block: Uint8Array): boolean => {
  for (const byteValue of block) {
    if (byteValue !== 0) {
      return false;
    }
  }

  return true;
};

const decodeCString = (bytes: Uint8Array): string => {
  const end = bytes.indexOf(0);

  const slice = end === -1 ? bytes : bytes.subarray(0, end);

  return Buffer.from(slice).toString('utf8');
};

const parseOctal = (bytes: Uint8Array): number => {
  const decodedString = decodeCString(bytes).trim().replaceAll(/\0/g, '');

  if (!decodedString) {
    return 0;
  }

  const value = Number.parseInt(decodedString, 8);

  return Number.isFinite(value) ? value : 0;
};

const parsePax = (data: Uint8Array): Record<string, string> => {
  // Records are: "%d key=value\n" where the length includes the whole record.
  const text = Buffer.from(data).toString('utf8');

  const result: Record<string, string> = {};

  let i = 0;

  while (i < text.length) {
    const space = text.indexOf(' ', i);

    if (space === -1) {
      break;
    }

    const lenStr = text.slice(i, space);

    const len = Number.parseInt(lenStr, 10);

    if (!Number.isFinite(len) || len <= 0) {
      break;
    }

    const record = text.slice(i, i + len);

    const eq = record.indexOf('=');

    if (eq !== -1) {
      const key = record.slice(space + 1, eq);

      const value = record.slice(eq + 1).replace(/\n$/, '');

      if (key) {
        result[key] = value;
      }
    }

    i += len;
  }

  return result;
};

const normalizeTarPath = (input: string): string => {
  const replaced = input.replaceAll(/\\/g, '/');

  const trimmed = replaced.replace(/^\/+/, '').replace(/^\.\//, '');

  return path.posix.normalize(trimmed);
};

const splitRootPrefix = (fullPosixPath: string, rootPrefix: string): string => {
  const normalizedTarPath = normalizeTarPath(fullPosixPath).replace(/\/+$/, '');

  if (!rootPrefix) {
    return normalizedTarPath;
  }

  const prefix = `${rootPrefix}/`;

  if (normalizedTarPath === rootPrefix) {
    return '';
  }

  if (normalizedTarPath.startsWith(prefix)) {
    return normalizedTarPath.slice(prefix.length);
  }

  return normalizedTarPath;
};

const ensureSafeOutPath = (
  destResolved: string,
  relativePosixPath: string,
): string | null => {
  const rel = normalizeTarPath(relativePosixPath).replace(/^\/+/, '');

  if (!rel || path.posix.isAbsolute(rel)) {
    return null;
  }

  const parts = rel.split('/').filter(part => !!part);

  if (parts.length === 0 || parts.some(part => part === '..')) {
    return null;
  }

  const outPath = path.resolve(destResolved, ...parts);

  if (
    outPath === destResolved ||
    !outPath.startsWith(destResolved + path.sep)
  ) {
    return null;
  }

  return outPath;
};

const parseHeaderAt = (tar: Uint8Array, offset: number) => {
  const block = tar.subarray(offset, offset + 512);

  if (block.length < 512) {
    return null;
  }

  if (isZeroBlock(block)) {
    return { header: null, nextOffset: offset + 512 };
  }

  const name = decodeCString(block.subarray(0, 100));
  const mode = parseOctal(block.subarray(100, 108));
  const size = parseOctal(block.subarray(124, 136));
  const typeFlag = block[156] ?? 0;
  const magic = decodeCString(block.subarray(257, 263));
  const prefix = decodeCString(block.subarray(345, 500));

  const typeChar = typeFlag === 0 ? '\0' : String.fromCharCode(typeFlag);

  const fullName =
    magic.startsWith('ustar') && prefix ? `${prefix}/${name}` : name;

  const type: TarType =
    typeChar === '5'
      ? 'directory'
      : typeChar === '0' || typeChar === '\0'
        ? 'file'
        : 'other';

  const header: TarHeader & {
    typeChar: string;
    rawName: string;
    rawPrefix: string;
  } = {
    name: fullName,
    mode,
    size,
    type,
    typeChar,
    rawName: name,
    rawPrefix: prefix,
  };

  const dataStart = offset + 512;
  const dataBlocks = Math.ceil(size / 512);
  const nextOffset = dataStart + dataBlocks * 512;

  return { header, dataStart, nextOffset };
};

/**
 * @internal
 * @since 3.0.0
 */
type ScanResult = {
  isSubDirFile: boolean;
  rootPrefix: string;
  subdirRelNorm: string | null;
  tar: Uint8Array<ArrayBuffer>;
};

const scanTarGz = async (
  tgz: Uint8Array,
  subdirNorm: string | null,
): Promise<ScanResult> => {
  const tar = new Uint8Array(await gunzipAsync(tgz));

  let rootPrefix = '';
  let subdirRelNorm: string | null = subdirNorm;
  let isSubDirFile = false;

  let pendingPax: Record<string, string> | null = null;
  let pendingLongName: string | null = null;

  for (let offset = 0; offset + 512 <= tar.length; ) {
    const parsed = parseHeaderAt(tar, offset);

    if (!parsed) {
      break;
    }

    if (!('header' in parsed) || !parsed.header) {
      offset = parsed.nextOffset;
      continue;
    }

    const { header, dataStart, nextOffset } = parsed;

    if (header.typeChar === 'g' || header.typeChar === 'x') {
      const data = tar.subarray(dataStart, dataStart + header.size);

      const pax = parsePax(data);

      if (header.typeChar === 'x') {
        pendingPax = pax;
      }

      offset = nextOffset;
      continue;
    }

    if (header.typeChar === 'L') {
      const data = tar.subarray(dataStart, dataStart + header.size);

      pendingLongName = decodeCString(data).trim();

      offset = nextOffset;
      continue;
    }

    // Apply PAX/longname if present.
    const effectiveName = pendingPax?.path
      ? pendingPax.path
      : pendingLongName
        ? pendingLongName
        : header.name;

    pendingLongName = null;
    pendingPax = null;

    const nameNorm = normalizeTarPath(effectiveName);

    // Determine root prefix from the first real entry.
    if (
      !rootPrefix &&
      (header.type === 'file' || header.type === 'directory')
    ) {
      const first = nameNorm.split('/')[0];

      if (first && first !== '.' && first !== 'pax_global_header') {
        rootPrefix = first;

        subdirRelNorm = subdirNorm
          ? splitRootPrefix(subdirNorm, rootPrefix)
          : null;
      }
    }

    if (subdirRelNorm && header.type === 'file') {
      const rel = splitRootPrefix(nameNorm, rootPrefix);

      if (rel === subdirRelNorm) {
        isSubDirFile = true;
      }
    }

    offset = nextOffset;
  }

  return { tar, rootPrefix, subdirRelNorm, isSubDirFile };
};

/**
 * Extract a .tar.gz to dest, optionally extracting only a repo subdir.
 *
 * @returns a list of extracted relative paths.
 */
export async function untarToDir(
  file: string,
  dest: string,
  subdir: string | null,
): Promise<string[]> {
  const extractedFiles: string[] = [];

  const tgz = await fs.readFile(file);

  const subdirNorm = subdir
    ? normalizeTarPath(subdir).replace(/\/+$/, '')
    : null;
  const { tar, rootPrefix, subdirRelNorm, isSubDirFile } = await scanTarGz(
    tgz,
    subdirNorm,
  );

  const destResolved = path.resolve(dest);

  const shouldInclude = (relPath: string) => {
    if (!subdirRelNorm) {
      return true;
    }

    if (isSubDirFile) {
      return relPath === subdirRelNorm;
    }

    return relPath === subdirRelNorm || relPath.startsWith(`${subdirRelNorm}/`);
  };

  let pendingPax: Record<string, string> | null = null;
  let pendingLongName: string | null = null;

  for (let offset = 0; offset + 512 <= tar.length; ) {
    const parsed = parseHeaderAt(tar, offset);
    if (!parsed) {
      break;
    }

    if (!('header' in parsed) || !parsed.header) {
      offset = parsed.nextOffset;
      continue;
    }

    const { header, dataStart, nextOffset } = parsed;

    if (header.typeChar === 'g' || header.typeChar === 'x') {
      const data = tar.subarray(dataStart, dataStart + header.size);
      const pax = parsePax(data);

      if (header.typeChar === 'x') {
        pendingPax = pax;
      }

      offset = nextOffset;
      continue;
    }

    if (header.typeChar === 'L') {
      const data = tar.subarray(dataStart, dataStart + header.size);
      pendingLongName = decodeCString(data).trim();
      offset = nextOffset;
      continue;
    }

    const effectiveName = pendingPax?.path
      ? pendingPax.path
      : pendingLongName
        ? pendingLongName
        : header.name;

    pendingLongName = null;
    pendingPax = null;

    const nameNorm = normalizeTarPath(effectiveName);
    const rel = splitRootPrefix(nameNorm, rootPrefix);
    const relTrimmed = rel.replace(/\/+$/, '');

    if (!shouldInclude(relTrimmed)) {
      offset = nextOffset;
      continue;
    }

    let outRelPosix: string;
    if (!subdirNorm) {
      // When extracting a full repo tarball, the archive usually contains a
      // top-level folder entry ("<repo>-<hash>/"). After stripping that, the
      // relative path is empty; skip it.
      outRelPosix = relTrimmed;
    } else if (isSubDirFile) {
      if (!subdirRelNorm || relTrimmed !== subdirRelNorm) {
        offset = nextOffset;
        continue;
      }
      outRelPosix = path.posix.basename(subdirRelNorm);
    } else {
      if (
        !subdirRelNorm ||
        relTrimmed === subdirRelNorm ||
        !relTrimmed.startsWith(`${subdirRelNorm}/`)
      ) {
        offset = nextOffset;
        continue;
      }

      outRelPosix = relTrimmed.slice(subdirRelNorm.length + 1);
    }

    if (!outRelPosix || outRelPosix === '.') {
      offset = nextOffset;
      continue;
    }

    const outPath = ensureSafeOutPath(destResolved, outRelPosix);
    if (!outPath) {
      throw new TigedError(`invalid tar entry path: ${effectiveName}`, {
        code: 'BAD_TAR_PATH',
      });
    }

    if (header.type === 'directory') {
      await fs.mkdir(outPath, { recursive: true });
      extractedFiles.push(outRelPosix);
      offset = nextOffset;
      continue;
    }

    if (header.type !== 'file') {
      offset = nextOffset;
      continue;
    }

    const data = tar.subarray(dataStart, dataStart + header.size);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, data);
    extractedFiles.push(outRelPosix);

    if (process.platform !== 'win32' && header.mode) {
      try {
        await fs.chmod(outPath, header.mode);
      } catch {
        // ignore mode application errors
      }
    }

    offset = nextOffset;
  }

  return extractedFiles;
}

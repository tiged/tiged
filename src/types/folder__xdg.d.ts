declare module '@folder/xdg' {
  export interface XdgOptions {
    cachedir?: string;
    configdir?: string;
    datadir?: string;
    env?: Record<string, string | undefined>;
    expanded?: boolean;
    homedir?: string;
    platform?: 'darwin' | 'linux' | 'win32' | string;
    resolve?: (...args: any[]) => any;
    runtimedir?: string;
    subdir?: string;
    tempdir?: string;
  }

  export interface XdgDirs {
    cache: string;
    config: string;
    data: string;
    runtime: string;
    configdirs?: string[];
    datadirs?: string[];
  }

  interface XdgFn {
    (options?: XdgOptions): XdgDirs;
    darwin(options?: XdgOptions): XdgDirs;
    linux(options?: XdgOptions): XdgDirs;
    win32(options?: XdgOptions): XdgDirs;
    macos(options?: XdgOptions): XdgDirs;
    windows(options?: XdgOptions): XdgDirs;
  }

  const xdg: XdgFn;
  export default xdg;
}

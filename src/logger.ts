const fontFamily =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const logger = {
  info: (message: string): void => {
    console.log(`%c[INFO] %s`, `font-family: ${fontFamily}`, String(message));
  },
  warn: (message: string): void => {
    console.warn(`%c[WARN] %s`, `font-family: ${fontFamily}`, String(message));
  },
  error: (message: unknown): void => {
    console.error(`%c[ERROR] %s`, `font-family: ${fontFamily}`, String(message));
  },
  debug: (message: string): void => {
    console.debug(`%c[DEBUG] %s`, `font-family: ${fontFamily}`, String(message));
  },
  fatal: (message: string): void => {
    console.error(`%c[FATAL] %s`, `font-family: ${fontFamily}`, String(message));
  },
};

export default logger;

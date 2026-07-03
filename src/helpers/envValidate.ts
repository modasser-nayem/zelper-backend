export function envRequireString(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Environment variable ${key} is missing or empty. Did you forget to create a .env or set environment variables?`,
    );
  }
  return value;
}

export function envRequireNumber(key: string): number {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  const number = Number(value);
  if (isNaN(number)) {
    throw new Error(
      `Environment variable ${key} is missing or empty. Did you forget to create a .env or set environment variables?`,
    );
  }
  return number;
}

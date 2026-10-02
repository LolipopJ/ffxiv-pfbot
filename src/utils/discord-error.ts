export function hasDiscordCode(error: unknown, code: number) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

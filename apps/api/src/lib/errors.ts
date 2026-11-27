// An error we throw on purpose, for a known problem the client should hear about.
// It carries the HTTP status (409 = conflict, 401 = not logged in, ...) and a short
// machine-readable code, so the web app can react without parsing English sentences.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

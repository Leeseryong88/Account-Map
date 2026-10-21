export class AppError extends Error {
  constructor(
    public code: "invalid-argument" | "not-found" | "permission-denied" | "failed-precondition" | "already-exists",
    message: string,
  ) {
    super(message);
  }
}

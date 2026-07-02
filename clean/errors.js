class AppError extends Error {
  constructor(status, code, message, type = 'invalid_request_error') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.type = type;
  }
}

function openAiError(error) {
  const status = error instanceof AppError ? error.status : 500;
  const code = error instanceof AppError ? error.code : 'internal_error';
  const message = error instanceof AppError ? error.message : 'Internal server error.';
  const type = error instanceof AppError ? error.type : 'server_error';
  return {
    status,
    body: {
      error: {
        message,
        type,
        code,
      },
    },
  };
}

module.exports = {
  AppError,
  openAiError,
};

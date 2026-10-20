// Erros com código estável: o app traduz pelo código (os 4 idiomas ficam no front-end).
export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message ?? code);
  }
}

export const E = {
  badRequest: (code = 'bad_request', msg?: string, details?: unknown) => new ApiError(400, code, msg, details),
  unauthorized: (code = 'unauthorized') => new ApiError(401, code, 'Faça login para continuar.'),
  forbidden: (code = 'forbidden', msg?: string) => new ApiError(403, code, msg ?? 'Você não tem permissão para isso.'),
  notFound: (code = 'not_found') => new ApiError(404, code, 'Não encontrado.'),
  conflict: (code: string, msg?: string) => new ApiError(409, code, msg),
  unprocessable: (code: string, msg?: string, details?: unknown) => new ApiError(422, code, msg, details),
  tooMany: (code = 'too_many_requests') => new ApiError(429, code, 'Muitas tentativas. Aguarde um pouco.'),
};

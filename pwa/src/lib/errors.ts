import { toast } from 'sonner';
import axios from 'axios';

/**
 * Central API error handler.
 * Extracts meaningful messages from backend responses and shows toast.
 * Use in catch blocks instead of silent failures.
 */
export function handleApiError(error: unknown, fallback = 'Ocorreu um erro. Tente novamente.'): string {
  let message = fallback;

  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[]; error?: string } | undefined;
    const status = error.response?.status;

    // Network error (offline, DNS fail, server down)
    if (!error.response) {
      message = 'Sem conexão. Verifique sua internet.';
    } else if (status === 429) {
      message = 'Muitas tentativas. Aguarde alguns segundos.';
    } else if (status === 403) {
      message = data?.message?.toString() || 'Sem permissão para essa ação.';
    } else if (status === 404) {
      message = data?.message?.toString() || 'Recurso não encontrado.';
    } else if (status === 409) {
      message = data?.message?.toString() || 'Conflito: já existe um registro com esses dados.';
    } else if (status && status >= 500) {
      message = 'Erro no servidor. Tente novamente em instantes.';
    } else if (data?.message) {
      message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    } else if (data?.error) {
      message = data.error;
    }
  } else if (error instanceof Error) {
    message = error.message || fallback;
  }

  toast.error(message);
  return message;
}

export function toastSuccess(message: string) {
  toast.success(message);
}

export function toastInfo(message: string) {
  toast.info(message);
}

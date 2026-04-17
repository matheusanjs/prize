import * as Notifications from 'expo-notifications';

/**
 * Interactive notification categories. Each category id must match the one
 * sent by the server in the APNs `category` field (payload.category).
 *
 * iOS shows these as action buttons when the user long-presses or expands
 * the notification from the tray/lock screen.
 */
export const PUSH_CATEGORIES: Array<{
  identifier: string;
  actions: Notifications.NotificationAction[];
  options?: Notifications.NotificationCategoryOptions;
}> = [
  {
    identifier: 'RESERVATION_SWAP',
    actions: [
      {
        identifier: 'ACCEPT',
        buttonTitle: 'Aceitar',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'DECLINE',
        buttonTitle: 'Recusar',
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ],
  },
  {
    identifier: 'INVOICE',
    actions: [
      { identifier: 'PAY', buttonTitle: 'Pagar com Pix', options: { opensAppToForeground: true } },
      { identifier: 'VIEW', buttonTitle: 'Ver fatura', options: { opensAppToForeground: true } },
    ],
  },
  {
    identifier: 'RESERVATION_REMINDER',
    actions: [
      { identifier: 'VIEW', buttonTitle: 'Ver reserva', options: { opensAppToForeground: true } },
      { identifier: 'CANCEL', buttonTitle: 'Cancelar', options: { opensAppToForeground: true, isDestructive: true } },
    ],
  },
  {
    identifier: 'CHAT_MESSAGE',
    actions: [
      {
        identifier: 'REPLY',
        buttonTitle: 'Responder',
        textInput: { submitButtonTitle: 'Enviar', placeholder: 'Digite...' },
        options: { opensAppToForeground: false },
      },
      { identifier: 'VIEW', buttonTitle: 'Abrir', options: { opensAppToForeground: true } },
    ],
  },
];

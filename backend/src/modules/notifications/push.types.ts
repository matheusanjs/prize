export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  threadId?: string;
  data?: Record<string, any>;
  actions?: { action: string; title: string; icon?: string }[];
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

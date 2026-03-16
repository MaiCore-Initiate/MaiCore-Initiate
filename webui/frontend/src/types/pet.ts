/**
 * 桌宠相关类型定义
 */

export type Priority = 'low' | 'normal' | 'high';

export type TodoStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

export interface Schedule {
  id: number;
  title: string;
  start_time: string;
  end_time?: string;
  description?: string;
  all_day: boolean;
  repeat_type: string;
  priority: Priority;
  tags?: string[];
  remind_before_minutes: number;
  location?: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Todo {
  id: number;
  title: string;
  description?: string;
  status: TodoStatus;
  priority: Priority;
  due_date?: string;
  tags?: string[];
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ChatAction {
  type: string;
  message: string;
  data?: any;
}

export interface ChatResponse {
  success: boolean;
  reply: string;
  actions?: ChatAction[];
}

export interface ContextSummary {
  schedule_summary: string;
  todo_summary: string;
  timestamp: string;
}

export interface LLMConfig {
  provider: string;
  api_key: string;
  base_url: string;
  model: string;
  temperature: number;
  max_tokens: number;
  timeout: number;
}

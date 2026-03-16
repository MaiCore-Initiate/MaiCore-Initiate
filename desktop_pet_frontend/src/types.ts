/* =============================================
   Types - 前后端共享数据结构
   ============================================= */

/** 重复类型 */
export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** 事件优先级 */
export type EventPriority = 'low' | 'normal' | 'high' | 'urgent';

/** 待办状态 */
export type TodoStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

/** 日程事件 */
export interface ScheduleEvent {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  repeat_type: RepeatType;
  priority: EventPriority;
  tags: string[];
  remind_before_minutes: number;
  location: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/** 待办事项 */
export interface TodoItem {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  priority: EventPriority;
  due_date: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  completed_at: string;
  is_deleted: boolean;
}

/** Live2D 模型信息 */
export interface Live2DModelInfo {
  id: string;
  name: string;
  path: string;
  model_file: string;
  preview_image: string;
  motions: string[];
  expressions: string[];
  /** Full expression definitions with Name+File pairs from model3.json */
  expression_defs: Array<{ Name: string; File: string }>;
  description: string;
}

/** 待办统计 */
export interface TodoStats {
  total: number;
  pending: number;
  in_progress: number;
  done: number;
  cancelled: number;
  overdue: number;
}

/** API 响应 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/** 日程创建参数 */
export interface CreateScheduleParams {
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  all_day?: boolean;
  repeat_type?: RepeatType;
  priority?: EventPriority;
  tags?: string[];
  remind_before_minutes?: number;
  location?: string;
}

/** 待办创建参数 */
export interface CreateTodoParams {
  title: string;
  description?: string;
  priority?: EventPriority;
  due_date?: string;
  tags?: string[];
}

/** 聊天会话 */
export interface ChatSession {
  id: string;
  model_key: string;
  title: string;
  persona_name: string;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  is_archived: boolean;
  message_count?: number;
  last_message?: string;
}

/** 会话消息记录 */
export interface ChatRecordMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** 发送聊天后的返回 */
export interface SendChatResult {
  reply: string;
  actions?: Array<Record<string, unknown>>;
  session_id: string;
  memory_hits?: string[];
}

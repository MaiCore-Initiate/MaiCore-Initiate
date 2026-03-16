import React, { useState, useEffect } from 'react';
import { Todo, Priority } from '../../types/pet';

interface TodoPanelProps {
  onRefresh?: () => void;
}

const TodoPanel: React.FC<TodoPanelProps> = ({ onRefresh }) => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTodo, setNewTodo] = useState({
    title: '',
    description: '',
    priority: 'normal' as Priority,
    due_date: ''
  });

  useEffect(() => {
    loadPendingTodos();
  }, []);

  const loadPendingTodos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pet/todos?status=pending');
      const data = await res.json();
      if (data.success) {
        setTodos(data.data);
      }
    } catch (error) {
      console.error('加载待办失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTodo.title) {
      alert('请填写标题');
      return;
    }

    try {
      const res = await fetch('/api/pet/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTodo)
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateForm(false);
        setNewTodo({
          title: '',
          description: '',
          priority: 'normal',
          due_date: ''
        });
        await loadPendingTodos();
        onRefresh?.();
      } else {
        alert(data.message || '创建失败');
      }
    } catch (error) {
      console.error('创建待办失败:', error);
      alert('创建失败');
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const res = await fetch(`/api/pet/todos/${id}/toggle`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success) {
        await loadPendingTodos();
        onRefresh?.();
      }
    } catch (error) {
      console.error('切换待办状态失败:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这个待办吗？')) return;

    try {
      const res = await fetch(`/api/pet/todos/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        await loadPendingTodos();
        onRefresh?.();
      }
    } catch (error) {
      console.error('删除待办失败:', error);
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high': return '#ff6b6b';
      case 'normal': return '#4dabf7';
      case 'low': return '#adb5bd';
      default: return '#4dabf7';
    }
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div style={{ padding: '10px', maxHeight: '400px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>待办事项</h3>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            background: '#4dabf7',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {showCreateForm ? '取消' : '新建'}
        </button>
      </div>

      {showCreateForm && (
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          padding: '10px',
          borderRadius: '6px',
          marginBottom: '10px'
        }}>
          <input
            type="text"
            placeholder="标题"
            value={newTodo.title}
            onChange={(e) => setNewTodo({ ...newTodo, title: e.target.value })}
            style={{
              width: '100%',
              padding: '6px',
              marginBottom: '6px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              color: 'white'
            }}
          />
          <textarea
            placeholder="描述（可选）"
            value={newTodo.description}
            onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })}
            style={{
              width: '100%',
              padding: '6px',
              marginBottom: '6px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              color: 'white',
              minHeight: '60px',
              resize: 'vertical'
            }}
          />
          <input
            type="datetime-local"
            placeholder="截止时间（可选）"
            value={newTodo.due_date}
            onChange={(e) => setNewTodo({ ...newTodo, due_date: e.target.value })}
            style={{
              width: '100%',
              padding: '6px',
              marginBottom: '6px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              color: 'white'
            }}
          />
          <select
            value={newTodo.priority}
            onChange={(e) => setNewTodo({ ...newTodo, priority: e.target.value as Priority })}
            style={{
              width: '100%',
              padding: '6px',
              marginBottom: '6px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              color: 'white'
            }}
          >
            <option value="low">低优先级</option>
            <option value="normal">普通</option>
            <option value="high">高优先级</option>
          </select>
          <button
            onClick={handleCreate}
            style={{
              width: '100%',
              padding: '6px',
              background: '#51cf66',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            创建
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#adb5bd' }}>加载中...</div>
      ) : todos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#adb5bd' }}>暂无待办事项</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {todos.map((todo) => (
            <div
              key={todo.id}
              style={{
                background: 'rgba(255,255,255,0.05)',
                padding: '10px',
                borderRadius: '6px',
                borderLeft: `3px solid ${getPriorityColor(todo.priority)}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}
            >
              <input
                type="checkbox"
                checked={todo.status === 'done'}
                onChange={() => handleToggle(todo.id)}
                style={{
                  marginTop: '2px',
                  cursor: 'pointer',
                  width: '16px',
                  height: '16px'
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '4px',
                  textDecoration: todo.status === 'done' ? 'line-through' : 'none',
                  opacity: todo.status === 'done' ? 0.6 : 1
                }}>
                  {todo.title}
                </div>
                {todo.description && (
                  <div style={{
                    fontSize: '12px',
                    color: '#adb5bd',
                    marginBottom: '4px'
                  }}>
                    {todo.description}
                  </div>
                )}
                {todo.due_date && (
                  <div style={{
                    fontSize: '11px',
                    color: isOverdue(todo.due_date) ? '#ff6b6b' : '#868e96'
                  }}>
                    {isOverdue(todo.due_date) && '⚠️ '}
                    截止: {new Date(todo.due_date).toLocaleString('zh-CN')}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDelete(todo.id)}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  background: 'rgba(255,107,107,0.2)',
                  color: '#ff6b6b',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TodoPanel;

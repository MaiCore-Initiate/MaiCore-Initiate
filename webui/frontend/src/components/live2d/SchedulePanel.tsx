import React, { useState, useEffect } from 'react';
import { Schedule, Priority } from '../../types/pet';

interface SchedulePanelProps {
  onRefresh?: () => void;
}

const SchedulePanel: React.FC<SchedulePanelProps> = ({ onRefresh }) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    title: '',
    start_time: '',
    end_time: '',
    description: '',
    priority: 'normal' as Priority,
    location: ''
  });

  useEffect(() => {
    loadTodaySchedules();
  }, []);

  const loadTodaySchedules = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/pet/schedules?date=${today}`);
      const data = await res.json();
      if (data.success) {
        setSchedules(data.data);
      }
    } catch (error) {
      console.error('加载日程失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newSchedule.title || !newSchedule.start_time) {
      alert('请填写标题和开始时间');
      return;
    }

    try {
      const res = await fetch('/api/pet/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSchedule)
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateForm(false);
        setNewSchedule({
          title: '',
          start_time: '',
          end_time: '',
          description: '',
          priority: 'normal',
          location: ''
        });
        await loadTodaySchedules();
        onRefresh?.();
      } else {
        alert(data.message || '创建失败');
      }
    } catch (error) {
      console.error('创建日程失败:', error);
      alert('创建失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这个日程吗？')) return;

    try {
      const res = await fetch(`/api/pet/schedules/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        await loadTodaySchedules();
        onRefresh?.();
      }
    } catch (error) {
      console.error('删除日程失败:', error);
    }
  };

  const formatTime = (datetime: string) => {
    return datetime.split('T')[1]?.substring(0, 5) || '全天';
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high': return '#ff6b6b';
      case 'normal': return '#4dabf7';
      case 'low': return '#adb5bd';
      default: return '#4dabf7';
    }
  };

  return (
    <div style={{ padding: '10px', maxHeight: '400px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>今日日程</h3>
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
            value={newSchedule.title}
            onChange={(e) => setNewSchedule({ ...newSchedule, title: e.target.value })}
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
          <input
            type="datetime-local"
            value={newSchedule.start_time}
            onChange={(e) => setNewSchedule({ ...newSchedule, start_time: e.target.value })}
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
          <input
            type="text"
            placeholder="地点（可选）"
            value={newSchedule.location}
            onChange={(e) => setNewSchedule({ ...newSchedule, location: e.target.value })}
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
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#adb5bd' }}>今天没有日程安排</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              style={{
                background: 'rgba(255,255,255,0.05)',
                padding: '10px',
                borderRadius: '6px',
                borderLeft: `3px solid ${getPriorityColor(schedule.priority)}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{schedule.title}</div>
                  <div style={{ fontSize: '12px', color: '#adb5bd' }}>
                    {formatTime(schedule.start_time)}
                    {schedule.location && ` · ${schedule.location}`}
                  </div>
                  {schedule.description && (
                    <div style={{ fontSize: '12px', color: '#adb5bd', marginTop: '4px' }}>
                      {schedule.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(schedule.id)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '12px',
                    background: 'rgba(255,107,107,0.2)',
                    color: '#ff6b6b',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SchedulePanel;

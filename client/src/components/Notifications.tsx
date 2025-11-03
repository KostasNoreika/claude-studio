/**
 * Notification Component
 * P09-T007: User notifications for success/error states
 */

import React, { useState, useEffect } from 'react';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number; // Auto-dismiss after N ms (default 5000)
}

interface NotificationsProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export const Notifications: React.FC<NotificationsProps> = ({
  notifications,
  onDismiss,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '400px',
      }}
    >
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};

const NotificationItem: React.FC<{
  notification: Notification;
  onDismiss: (id: string) => void;
}> = ({ notification, onDismiss }) => {
  useEffect(() => {
    const duration = notification.duration ?? 5000;
    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  const getStyles = () => {
    const baseStyles = {
      padding: '12px 16px',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      animation: 'slideIn 0.3s ease-out',
      minWidth: '300px',
    };

    const typeStyles = {
      success: {
        backgroundColor: '#4caf50',
        color: 'white',
      },
      error: {
        backgroundColor: '#f44336',
        color: 'white',
      },
      warning: {
        backgroundColor: '#ff9800',
        color: 'white',
      },
      info: {
        backgroundColor: '#2196f3',
        color: 'white',
      },
    };

    return { ...baseStyles, ...typeStyles[notification.type] };
  };

  return (
    <div style={getStyles()}>
      <span style={{ flex: 1 }}>{notification.message}</span>
      <button
        onClick={() => onDismiss(notification.id)}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '18px',
          padding: '0 0 0 12px',
          opacity: 0.8,
        }}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
};

/**
 * Hook for managing notifications
 */
export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (
    type: Notification['type'],
    message: string,
    duration?: number
  ) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    const notification: Notification = {
      id,
      type,
      message,
      duration,
    };

    setNotifications((prev) => [...prev, notification]);
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const success = (message: string, duration?: number) =>
    addNotification('success', message, duration);

  const error = (message: string, duration?: number) =>
    addNotification('error', message, duration);

  const warning = (message: string, duration?: number) =>
    addNotification('warning', message, duration);

  const info = (message: string, duration?: number) =>
    addNotification('info', message, duration);

  return {
    notifications,
    addNotification,
    dismissNotification,
    success,
    error,
    warning,
    info,
  };
};

// Add CSS animation
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}

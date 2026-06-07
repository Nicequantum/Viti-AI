'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import { api, type TechnicianUser } from '@/lib/api';
import type { AuditLogEntry, TechnicianSession } from '@/types';
import { AUDIT_ACTIONS } from '@/types';

interface AuditLogViewProps {
  session: TechnicianSession;
  onBack: () => void;
}

export function AuditLogView({ session, onBack }: AuditLogViewProps) {
  const [users, setUsers] = useState<TechnicianUser[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [technicianId, setTechnicianId] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const { users: list } = await api.listUsers();
      setUsers(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load technicians');
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { logs: entries } = await api.listAuditLogs({
        technicianId: technicianId || undefined,
        action: action || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      });
      setLogs(entries);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [technicianId, action, from, to]);

  useEffect(() => {
    if (session.role === 'manager') {
      loadUsers();
    }
  }, [session.role, loadUsers]);

  useEffect(() => {
    if (session.role === 'manager') {
      loadLogs();
    }
  }, [session.role, loadLogs]);

  const handleExport = () => {
    const url = api.exportAuditLogsCsv({
      technicianId: technicianId || undefined,
      action: action || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    });
    window.open(url, '_blank');
  };

  if (session.role !== 'manager') {
    return (
      <div className="px-5 pt-6 pb-10">
        <button onClick={onBack} className="flex items-center text-[#0a84ff] mb-6">
          <ArrowLeft size={18} className="mr-1" /> Back
        </button>
        <p className="text-sm text-[#8e8e93]">Manager access required.</p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-10">
      <button onClick={onBack} className="flex items-center text-[#0a84ff] mb-6">
        <ArrowLeft size={18} className="mr-1" /> Back
      </button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ScrollText size={20} className="text-[#0a84ff]" />
          <h2 className="text-2xl font-semibold">Audit Log</h2>
        </div>
        <button onClick={handleExport} className="secondary-btn h-10 px-4 flex items-center gap-2 text-xs">
          <Download size={14} /> EXPORT CSV
        </button>
      </div>

      <div className="ios-card p-4 mb-4 grid grid-cols-1 gap-3">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            className="bg-[#1c1c1e] rounded px-3 py-2 text-sm"
          >
            <option value="">All technicians</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="bg-[#1c1c1e] rounded px-3 py-2 text-sm"
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-[#1c1c1e] rounded px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-[#1c1c1e] rounded px-3 py-2 text-sm"
          />
        </div>
        <button onClick={loadLogs} className="primary-btn h-10 text-sm">
          APPLY FILTERS
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-[#8e8e93]">Loading audit entries...</div>
      ) : logs.length === 0 ? (
        <div className="text-sm text-[#8e8e93]">No audit entries match your filters.</div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="ios-card p-3">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="text-sm font-semibold">{log.action}</div>
                  <div className="text-[10px] text-[#8e8e93] mt-1">
                    {log.technicianName || 'System'} · {new Date(log.createdAt).toLocaleString()}
                  </div>
                  {(log.entityType || log.entityId) && (
                    <div className="text-[10px] text-[#666] mt-1">
                      {log.entityType || 'entity'} {log.entityId || ''}
                    </div>
                  )}
                </div>
                {log.ipAddress && <div className="text-[10px] text-[#666] font-mono">{log.ipAddress}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
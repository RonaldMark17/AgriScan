import { ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageHeader from '../components/shared/PageHeader.jsx';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [farms, setFarms] = useState([]);

  async function load() {
    const [usersResponse, logsResponse, farmsResponse] = await Promise.all([
      api.get('/users'),
      api.get('/admin/audit-logs'),
      api.get('/admin/pending-farms'),
    ]);
    setUsers(usersResponse.data);
    setLogs(logsResponse.data);
    setFarms(farmsResponse.data);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function approveFarm(id) {
    await api.patch(`/farms/${id}/approve`);
    await load();
  }

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Users and approvals" />
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <section className="surface rounded-lg p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <UserRoundCheck className="h-5 w-5 text-leaf-700" />
            User management
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Last login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-stone-900">{user.full_name}</p>
                      <p className="text-xs text-stone-500">{user.email}</p>
                    </td>
                    <td className="py-3 pr-4">{user.role.name}</td>
                    <td className="py-3 pr-4">{user.is_active ? 'Active' : 'Disabled'}</td>
                    <td className="py-3">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-5">
          <div className="surface rounded-lg p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ShieldCheck className="h-5 w-5 text-leaf-700" />
              Pending farms
            </h2>
            {farms.length === 0 ? (
              <EmptyState title="No pending approvals" body="New farmer farm records will appear here for agriculture office review." />
            ) : (
              <div className="mt-4 space-y-3">
                {farms.map((farm) => (
                  <div key={farm.id} className="rounded-lg border border-stone-200 p-3">
                    <p className="font-semibold text-stone-900">{farm.name}</p>
                    <p className="text-sm text-stone-500">{farm.municipality}, {farm.province}</p>
                    <button className="btn-primary mt-3" onClick={() => approveFarm(farm.id)}>Approve</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="surface rounded-lg p-5">
            <h2 className="text-lg font-bold">Audit logs</h2>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {logs.slice(0, 20).map((log) => (
                <div key={log.id} className="rounded-lg bg-stone-50 p-3 text-sm">
                  <p className="font-semibold text-stone-900">{log.action}</p>
                  <p className="text-xs text-stone-500">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

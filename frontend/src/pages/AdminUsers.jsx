import {
  Ban,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  UsersRound,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import PageHeader from '../components/shared/PageHeader.jsx';
import StatCard from '../components/shared/StatCard.jsx';
import {
  ConfirmModal,
  DataTable,
  FormSection,
  SearchFilterBar,
  StatusBadge,
  formatDateTime,
  labelize,
} from '../components/shared/platform.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';

const EMPTY_ACTION_FORM = {
  role: 'farmer',
  account_status: 'active',
  reason: '',
  description: '',
  account_status_until: '',
};

function accountStatusValue(user) {
  return user.account_status || (user.is_active ? 'active' : 'disabled');
}

function roleName(user) {
  return typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer';
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [securitySummary, setSecuritySummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appealAction, setAppealAction] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [actionUser, setActionUser] = useState(null);
  const [actionForm, setActionForm] = useState(EMPTY_ACTION_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersResponse, appealsResponse, securityResponse] = await Promise.all([
        api.get('/users'),
        api.get('/admin/appeals'),
        api.get('/admin/account-security-summary'),
      ]);
      setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);
      setAppeals(Array.isArray(appealsResponse.data) ? appealsResponse.data : []);
      setSecuritySummary(securityResponse.data);
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'User management data could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return users.filter((user) => {
      const status = accountStatusValue(user);
      const role = roleName(user);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (roleFilter !== 'all' && role !== roleFilter) return false;
      if (!normalizedSearch) return true;
      return [user.full_name, user.email, role, status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [roleFilter, search, statusFilter, users]);

  const pendingAppeals = appeals.filter((appeal) => appeal.status === 'pending');
  const activeUsers = users.filter((user) => accountStatusValue(user) === 'active' && user.is_active !== false);
  const restrictedUsers = users.filter((user) => ['suspended', 'disabled', 'pending_review'].includes(accountStatusValue(user)));

  function openActionModal(targetUser) {
    setActionUser(targetUser);
    setActionForm({
      role: roleName(targetUser),
      account_status: accountStatusValue(targetUser),
      reason: '',
      description: '',
      account_status_until: '',
    });
    setError('');
    setSuccess('');
  }

  async function submitUserAction() {
    if (!actionUser) return;
    const nextStatus = actionForm.account_status;
    const currentStatus = accountStatusValue(actionUser);
    const nextRole = actionForm.role;
    const currentRole = roleName(actionUser);
    const statusChanged = nextStatus !== currentStatus;
    const roleChanged = nextRole !== currentRole;

    if (!statusChanged && !roleChanged) {
      setActionUser(null);
      return;
    }

    if (statusChanged && (!actionForm.reason.trim() || !actionForm.description.trim())) {
      setError('A reason and description are required before changing account status.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (roleChanged) {
        await api.patch(`/users/${actionUser.id}`, { role: nextRole });
      }
      if (statusChanged) {
        await api.patch(`/users/${actionUser.id}/account-status`, {
          account_status: nextStatus,
          reason: actionForm.reason,
          description: actionForm.description,
          account_status_until:
            nextStatus === 'suspended' && actionForm.account_status_until
              ? new Date(actionForm.account_status_until).toISOString()
              : null,
        });
      }
      setSuccess('User account updated. The action is recorded in audit logs.');
      setActionUser(null);
      await load();
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'User account update could not be saved.', {
        title: 'User account update could not be saved.',
        action: 'Confirm the account still exists, avoid restricting yourself, and include a clear reason for status changes.',
      }));
    } finally {
      setSaving(false);
    }
  }

  async function decideAppeal(id, decision) {
    setAppealAction(`${decision}-${id}`);
    setError('');
    setSuccess('');
    try {
      const reason = decision === 'approve'
        ? 'Appeal approved after administrator review.'
        : 'Appeal rejected because the account restriction remains unresolved.';
      await api.patch(`/admin/appeals/${id}/${decision}`, { reason });
      setSuccess(`Appeal ${decision === 'approve' ? 'approved' : 'rejected'}. Audit records were updated.`);
      await load();
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Appeal decision could not be saved.'));
    } finally {
      setAppealAction(null);
    }
  }

  const columns = [
    {
      key: 'identity',
      header: 'User',
      render: (user) => (
        <div>
          <p className="break-words font-bold text-stone-950">{user.full_name}</p>
          <p className="break-all text-xs text-stone-500">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (user) => <StatusBadge status="draft">{labelize(roleName(user))}</StatusBadge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => <StatusBadge status={accountStatusValue(user)}>{labelize(accountStatusValue(user))}</StatusBadge>,
    },
    {
      key: 'last_login_at',
      header: 'Last login',
      render: (user) => formatDateTime(user.last_login_at),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (user) => (
        <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" type="button" onClick={() => openActionModal(user)}>
          <UserCog className="h-4 w-4" />
          Manage
        </button>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Administration"
        title="User Management"
        body="Manage farmer and admin accounts, role assignments, statuses, suspension workflow, and appeal review without crop or farm operations mixed in."
        actions={
          <button className="btn-secondary" type="button" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        }
      />

      {error ? <div className="danger-message">{error}</div> : null}
      {success ? <div className="success-message">{success}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UsersRound} label="Total users" value={users.length} helper="All admin and farmer accounts." />
        <StatCard icon={CheckCircle2} label="Active users" value={activeUsers.length} helper="Accounts with normal access." tone="sky" />
        <StatCard icon={ShieldAlert} label="Restricted users" value={securitySummary?.suspended_users ?? restrictedUsers.length} helper="Suspended, disabled, or pending review." tone="amber" />
        <StatCard icon={Clock3} label="Pending appeals" value={securitySummary?.pending_appeals ?? pendingAppeals.length} helper="Requests needing admin decision." tone="soil" />
      </section>

      <section className="space-y-3">
        <SearchFilterBar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="Search by name, email, role, or status"
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: (value) => {
                setStatusFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'disabled', label: 'Disabled' },
                { value: 'pending_review', label: 'Pending Review' },
              ],
            },
            {
              id: 'role',
              label: 'Role',
              value: roleFilter,
              onChange: (value) => {
                setRoleFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: 'All roles' },
                { value: 'admin', label: 'Admin' },
                { value: 'farmer', label: 'Farmer' },
              ],
            },
          ]}
        />
        <DataTable
          columns={columns}
          rows={filteredUsers}
          getRowKey={(user) => user.id}
          loading={loading}
          page={page}
          pageSize={10}
          onPageChange={setPage}
          emptyTitle="No users found"
          emptyBody="Try a different search term or filter."
        />
      </section>

      <section className="surface rounded-lg p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-leaf-700" />
              Suspension appeals
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Review farmer appeal requests and reactivate accounts only when the restriction is resolved.
            </p>
          </div>
          <StatusBadge status={pendingAppeals.length ? 'pending' : 'active'}>{pendingAppeals.length} pending</StatusBadge>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {pendingAppeals.map((appeal) => (
            <article key={appeal.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-bold text-stone-950">{appeal.user_name || `User #${appeal.user_id}`}</p>
                  <p className="break-all text-xs text-stone-500">{appeal.user_email || '-'}</p>
                  <p className="mt-2 text-xs font-semibold text-stone-400">{formatDateTime(appeal.created_at)}</p>
                </div>
                <StatusBadge status="pending">Pending Review</StatusBadge>
              </div>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-stone-600">{appeal.explanation}</p>
              {appeal.updated_information ? (
                <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
                  {appeal.updated_information}
                </p>
              ) : null}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  className="btn-primary w-full sm:w-auto"
                  type="button"
                  disabled={appealAction !== null}
                  onClick={() => decideAppeal(appeal.id, 'approve')}
                >
                  {appealAction === `approve-${appeal.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Approve
                </button>
                <button
                  className="btn-danger w-full sm:w-auto"
                  type="button"
                  disabled={appealAction !== null}
                  onClick={() => decideAppeal(appeal.id, 'reject')}
                >
                  {appealAction === `reject-${appeal.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Reject
                </button>
              </div>
            </article>
          ))}
          {!pendingAppeals.length && !loading ? (
            <div className="lg:col-span-2">
              <div className="empty-state">
                <ShieldCheck className="mx-auto h-8 w-8 text-stone-400" />
                <p className="mt-2 text-sm font-bold text-stone-950">No pending appeals</p>
                <p className="mt-1 text-sm text-stone-500">Review requests from suspended farmers will appear here.</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <ConfirmModal
        open={Boolean(actionUser)}
        title={actionUser ? `Manage ${actionUser.full_name}` : 'Manage user'}
        body="Status changes require a reason and description. Suspend, disable, reactivate, and role updates are attributable admin actions."
        confirmLabel="Save changes"
        cancelLabel="Cancel"
        danger={actionForm.account_status !== 'active'}
        loading={saving}
        onCancel={() => setActionUser(null)}
        onConfirm={submitUserAction}
      >
        <FormSection title="Account action" body={`Action timestamp: ${new Date().toLocaleString()}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-stone-700">
              Role
              <select
                className="field mt-2"
                value={actionForm.role}
                onChange={(event) => setActionForm((current) => ({ ...current, role: event.target.value }))}
              >
                <option value="farmer">Farmer</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Account status
              <select
                className="field mt-2"
                value={actionForm.account_status}
                onChange={(event) => setActionForm((current) => ({ ...current, account_status: event.target.value }))}
                disabled={actionUser?.id === currentUser?.id}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="disabled">Disabled</option>
                <option value="pending_review">Pending Review</option>
              </select>
            </label>
          </div>
          {actionUser?.id === currentUser?.id ? (
            <div className="state-message mt-3">
              You cannot restrict your own active admin session from this workflow.
            </div>
          ) : null}
          <label className="mt-3 block text-sm font-bold text-stone-700">
            Temporary suspension until
            <input
              className="field mt-2"
              type="datetime-local"
              value={actionForm.account_status_until}
              onChange={(event) => setActionForm((current) => ({ ...current, account_status_until: event.target.value }))}
              disabled={actionForm.account_status !== 'suspended'}
            />
          </label>
          <label className="mt-3 block text-sm font-bold text-stone-700">
            Reason
            <input
              className="field mt-2"
              value={actionForm.reason}
              onChange={(event) => setActionForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Suspicious login pattern, fake information, spam activity..."
            />
          </label>
          <label className="mt-3 block text-sm font-bold text-stone-700">
            Description
            <textarea
              className="field mt-2 min-h-28 resize-y"
              value={actionForm.description}
              onChange={(event) => setActionForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Describe the evidence, audit trail, or reason for reactivation."
            />
          </label>
          <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            Admin accountability note: status changes are written to audit logs, and restricted farmers can submit an appeal from the suspension notice page.
          </div>
        </FormSection>
      </ConfirmModal>
    </div>
  );
}

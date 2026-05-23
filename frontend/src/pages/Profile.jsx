import { KeyRound, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader.jsx';
import { FormSection, StatusBadge, formatDateTime, labelize } from '../components/shared/platform.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Profile() {
  const { user } = useAuth();
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer';
  const accountStatus = user?.account_status || (user?.is_active ? 'active' : 'disabled');

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Account profile"
        title="Profile"
        body="Review personal, contact, and account security details for the current signed-in user."
        actions={
          <Link className="btn-primary" to="/settings">
            <ShieldCheck className="h-4 w-4" />
            Security Settings
          </Link>
        }
      />

      <section className="surface rounded-lg p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700 ring-1 ring-leaf-100">
            <UserRound className="h-10 w-10" />
          </div>
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-bold text-stone-950">{user?.full_name || 'AgriScan User'}</h2>
            <p className="mt-1 break-all text-sm text-stone-500">{user?.email || '-'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={accountStatus}>{labelize(accountStatus)}</StatusBadge>
              <StatusBadge status="draft">{labelize(roleName)}</StatusBadge>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <FormSection icon={UserRound} title="Personal information">
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="font-bold text-stone-500">Full name</dt>
              <dd className="mt-1 break-words text-stone-950">{user?.full_name || '-'}</dd>
            </div>
            <div>
              <dt className="font-bold text-stone-500">Role</dt>
              <dd className="mt-1 text-stone-950">{labelize(roleName)}</dd>
            </div>
            <div>
              <dt className="font-bold text-stone-500">Created</dt>
              <dd className="mt-1 text-stone-950">{formatDateTime(user?.created_at)}</dd>
            </div>
          </dl>
        </FormSection>

        <FormSection icon={Mail} title="Contact details">
          <dl className="grid gap-4 text-sm">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" />
              <div>
                <dt className="font-bold text-stone-500">Email</dt>
                <dd className="mt-1 break-all text-stone-950">{user?.email || '-'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" />
              <div>
                <dt className="font-bold text-stone-500">Phone</dt>
                <dd className="mt-1 text-stone-950">{user?.phone || '-'}</dd>
              </div>
            </div>
          </dl>
        </FormSection>

        <FormSection icon={ShieldCheck} title="Account information">
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="font-bold text-stone-500">Status</dt>
              <dd className="mt-1"><StatusBadge status={accountStatus}>{labelize(accountStatus)}</StatusBadge></dd>
            </div>
            <div>
              <dt className="font-bold text-stone-500">Last login</dt>
              <dd className="mt-1 text-stone-950">{formatDateTime(user?.last_login_at)}</dd>
            </div>
            <div>
              <dt className="font-bold text-stone-500">MFA</dt>
              <dd className="mt-1 text-stone-950">{user?.mfa_enabled ? 'Enabled' : 'Not enabled'}</dd>
            </div>
          </dl>
        </FormSection>

        <FormSection icon={KeyRound} title="Password and security" body="Use the security settings page for MFA, device history, notification preferences, and password recovery workflows.">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className="btn-primary justify-center" to="/settings">
              <ShieldCheck className="h-4 w-4" />
              Open Security Settings
            </Link>
            <Link className="btn-secondary justify-center" to="/forgot-password">
              <KeyRound className="h-4 w-4" />
              Reset Password
            </Link>
          </div>
        </FormSection>
      </div>
    </div>
  );
}

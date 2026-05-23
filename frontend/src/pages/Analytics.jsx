import { BarChart3, FileText, PieChart, RefreshCw, Sprout } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart as RePieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client.js';
import PageHeader from '../components/shared/PageHeader.jsx';
import StatCard from '../components/shared/StatCard.jsx';
import { ChartCard, DataTable, StatusBadge, formatDateTime, labelize } from '../components/shared/platform.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';

const COLORS = ['#2E7D32', '#2563EB', '#F59E0B', '#16A34A', '#DC2626', '#0f766e'];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function groupByDisease(scans) {
  const counts = new Map();
  safeArray(scans).forEach((scan) => {
    const label = scan.disease_name || 'Unknown';
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((first, second) => second.value - first.value)
    .slice(0, 6);
}

function groupByMonth(scans) {
  const counts = new Map();
  safeArray(scans).forEach((scan) => {
    const parsed = new Date(scan.created_at);
    const label = Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleDateString([], { month: 'short' });
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries()).reverse().slice(0, 8).reverse().map(([month, scansCount]) => ({ month, scans: scansCount }));
}

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scans, setScans] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [report, setReport] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [scansResponse, predictionsResponse, reportResponse] = await Promise.all([
        api.get('/scans'),
        api.get('/predictions'),
        api.get('/reports/monthly'),
      ]);
      setScans(safeArray(scansResponse.data));
      setPredictions(safeArray(predictionsResponse.data));
      setReport(reportResponse.data);
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Analytics could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const diseaseData = useMemo(() => groupByDisease(scans), [scans]);
  const monthlyData = useMemo(() => groupByMonth(scans), [scans]);
  const actionableScans = scans.filter((scan) => !/healthy/i.test(scan.disease_name || ''));

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Admin analytics"
        title="Analytics"
        body="High-level crop, scan, disease, and report analytics for administrators. Operational controls remain on their dedicated pages."
        actions={
          <button className="btn-secondary" type="button" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {error ? <div className="danger-message">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BarChart3} label="Total scans" value={scans.length} helper="Disease and manual crop scan records." />
        <StatCard icon={Sprout} label="Actionable detections" value={actionableScans.length} helper="Non-healthy scan outcomes." tone="amber" />
        <StatCard icon={PieChart} label="Recommendations" value={predictions.length} helper="Saved crop recommendation records." tone="sky" />
        <StatCard icon={FileText} label="Report groups" value={report?.disease_breakdown?.length ?? 0} helper="Disease groups in monthly report." tone="soil" />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Crop scan volume" body="Monthly scan activity across all visible farm records.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ left: 4, right: 16, top: 10, bottom: 0 }}>
                <CartesianGrid stroke="#e7e5e4" strokeDasharray="5 7" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#78716c', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#78716c', fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="scans" fill="#2E7D32" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Disease mix" body="Most frequent disease detection outcomes.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie data={diseaseData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={100} paddingAngle={3}>
                  {diseaseData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <DataTable
        columns={[
          {
            key: 'disease_name',
            header: 'Detection',
            render: (scan) => (
              <div>
                <p className="break-words font-bold text-stone-950">{scan.disease_name}</p>
                <p className="text-xs text-stone-500">{scan.crop_label || 'Crop not labeled'}</p>
              </div>
            ),
          },
          {
            key: 'confidence',
            header: 'Confidence',
            render: (scan) => `${Math.round(Number(scan.confidence || 0) * 100)}%`,
          },
          {
            key: 'status',
            header: 'Status',
            render: (scan) => <StatusBadge status={scan.status}>{labelize(scan.status)}</StatusBadge>,
          },
          {
            key: 'created_at',
            header: 'Created',
            render: (scan) => formatDateTime(scan.created_at),
          },
        ]}
        rows={scans}
        loading={loading}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyTitle="No analytics data yet"
        emptyBody="Crop scan analytics will appear once farmers submit detections."
      />
    </div>
  );
}

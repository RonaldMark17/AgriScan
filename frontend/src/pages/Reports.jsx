import { BarChart3, Download, FileText, Loader2, RefreshCw, Sprout } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, getApiBaseUrl } from '../api/client.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageHeader from '../components/shared/PageHeader.jsx';
import StatCard from '../components/shared/StatCard.jsx';

export default function Reports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/monthly');
      setReport(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function downloadPdf() {
    const token = localStorage.getItem('agriscan_access');
    fetch(`${getApiBaseUrl()}/reports/monthly.pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'agriscan-monthly-report.pdf';
        link.click();
        URL.revokeObjectURL(url);
      });
  }

  const diseaseBreakdown = Array.isArray(report?.disease_breakdown) ? report.disease_breakdown : [];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="PDF export and analytics"
        title="Reports"
        body="Review farm coverage, disease scan patterns, and monthly recommendations in one place."
        actions={
          <>
            <button className="btn-secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <button className="btn-primary" onClick={downloadPdf} disabled={!report}>
              <Download className="h-4 w-4" />
              PDF
            </button>
          </>
        }
      />

      {loading && !report ? (
        <div className="state-message flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-leaf-700" />
          Loading report...
        </div>
      ) : null}

      {report ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            icon={Sprout}
            label="Registered farms"
            value={report.farm_count}
            helper="Total farms included in this monthly snapshot."
          />
          <StatCard
            icon={BarChart3}
            label="Your farms"
            value={report.user_farm_count}
            helper={
              report.user_farm_count === report.farm_count
                ? 'This report matches the farms tied to your account.'
                : 'Your own farms are separated from the system-wide count.'
            }
            tone="sky"
          />
          <StatCard
            icon={FileText}
            label="Disease groups"
            value={diseaseBreakdown.length}
            helper="Distinct scan outcomes captured this month."
            tone="amber"
          />
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface rounded-lg p-4 sm:p-5">
          <h2 className="section-title flex items-center gap-2">
            <FileText className="h-5 w-5 text-leaf-700" />
            Monthly analytics
          </h2>

          {!report && !loading ? (
            <div className="mt-4">
              <EmptyState
                title="Report unavailable"
                body="Refresh the page to load the latest monthly analytics from the server."
                action={
                  <button className="btn-secondary" onClick={load}>
                    <RefreshCw className="h-4 w-4" />
                    Try again
                  </button>
                }
              />
            </div>
          ) : null}

          {report && diseaseBreakdown.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No scan data yet" body="Disease patterns will appear here after crop scans are submitted." />
            </div>
          ) : null}

          {diseaseBreakdown.length > 0 ? (
            <div className="mt-4 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
              {diseaseBreakdown.map((row) => (
                <div key={row.disease} className="flex items-center justify-between gap-3 p-4">
                  <span className="min-w-0 break-words font-semibold text-stone-800">{row.disease}</span>
                  <span className="status-pill shrink-0 bg-leaf-50 text-leaf-800">{row.count}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <aside className="surface rounded-lg p-4 sm:p-5">
          <h3 className="section-title">Recommendation</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {report?.recommendation || 'Scan more crops and register farm locations to generate richer analytics.'}
          </p>
        </aside>
      </div>
    </div>
  );
}

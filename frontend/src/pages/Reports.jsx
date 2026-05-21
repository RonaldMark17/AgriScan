import { BarChart3, CalendarClock, CheckCircle2, Download, FileText, Loader2, RefreshCw, ShieldCheck, Sprout } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, getApiBaseUrl } from '../api/client.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageHeader from '../components/shared/PageHeader.jsx';
import StatCard from '../components/shared/StatCard.jsx';

function ReportRecommendation({ report, diseaseBreakdown }) {
  const topDisease = diseaseBreakdown.find((row) => !/healthy/i.test(String(row.disease || ''))) || diseaseBreakdown[0] || null;
  const topDiseaseName = String(topDisease?.disease || 'No disease trend yet');
  const totalDiseaseScans = diseaseBreakdown.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const recommendation =
    report?.recommendation || 'Scan more crops and register farm locations to generate richer analytics.';
  const hasScanData = totalDiseaseScans > 0;
  const hasActionableDisease = Boolean(topDisease && !/healthy/i.test(topDiseaseName));
  const focusTitle = topDisease ? topDiseaseName : 'No disease trend yet';
  const focusHelper = topDisease
    ? 'Highest repeated detection in this report.'
    : 'Disease patterns will appear after crop scans are submitted.';
  const nextActions = hasActionableDisease
    ? [
        `Inspect fields with repeated ${topDiseaseName.toLowerCase()} detections first.`,
        'Compare the trend with recent Disease Detector results before treatment.',
        'Export the PDF and share it with the farm owner or agriculture office.',
      ]
    : [
        'Register accurate farm locations before the next reporting cycle.',
        'Run Disease Detector when symptoms appear in the field.',
        'Use Manual Scan to add soil context for better recommendations.',
      ];

  return (
    <aside className="surface overflow-hidden rounded-lg min-[1440px]:sticky sticky-panel min-[1440px]:self-start">
      <div className="border-b border-stone-100 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
              {hasScanData ? <ShieldCheck className="h-6 w-6" /> : <Sprout className="h-6 w-6" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Monthly insight</p>
              <h3 className="mt-1 break-words text-2xl font-bold text-stone-950">Recommendation</h3>
            </div>
          </div>
          <span className={`status-pill shrink-0 ${hasScanData ? 'bg-leaf-50 text-leaf-800' : 'bg-amber-50 text-amber-800'}`}>
            {hasScanData ? 'Ready' : 'Needs scans'}
          </span>
        </div>

        <p className="mt-5 text-sm leading-6 text-stone-600 sm:text-base">
          {recommendation}
        </p>
      </div>

      <div className="grid gap-4 p-5 sm:p-6">
        <article className="rounded-lg border border-leaf-100 bg-leaf-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-leaf-700">Focus signal</p>
              <h4 className="mt-2 break-words text-lg font-bold text-leaf-950">{focusTitle}</h4>
              <p className="mt-1 text-sm leading-6 text-leaf-800">{focusHelper}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-leaf-800">
              {topDisease ? topDisease.count : 0}
            </span>
          </div>
        </article>

        <article className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-stone-700">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Report coverage</p>
              <p className="mt-2 text-lg font-bold text-stone-950">
                {totalDiseaseScans} disease scans across {diseaseBreakdown.length} groups
              </p>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                {report?.user_farm_count ?? 0} of {report?.farm_count ?? 0} registered farms are tied to this account.
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Next actions</p>
              <h4 className="mt-1 text-lg font-bold text-stone-950">What to do next</h4>
            </div>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
            {nextActions.map((action) => (
              <li key={action} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </aside>
  );
}

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

      <div className="content-sidebar-layout">
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

        <ReportRecommendation report={report} diseaseBreakdown={diseaseBreakdown} />
      </div>
    </div>
  );
}

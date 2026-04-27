import { Download, FileText, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, getApiBaseUrl } from '../api/client.js';
import PageHeader from '../components/shared/PageHeader.jsx';

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

  return (
    <div>
      <PageHeader
        eyebrow="PDF export and analytics"
        title="Reports"
        actions={
          <>
            <button className="btn-secondary" onClick={load}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button className="btn-primary" onClick={downloadPdf}>
              <Download className="h-4 w-4" />
              PDF
            </button>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="surface rounded-lg p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
            <FileText className="h-5 w-5 text-leaf-700" />
            Monthly analytics
          </h2>
          {loading && <p className="mt-4 text-sm text-stone-500">Loading report...</p>}
          {report && (
            <div className="mt-5 space-y-3">
              <div className="rounded-lg bg-stone-50 p-4">
                <p className="text-sm font-semibold text-stone-500">Registered farms</p>
                <p className="text-3xl font-bold text-stone-950">{report.farm_count}</p>
                <p className="mt-2 text-sm text-stone-500">
                  {report.user_farm_count === report.farm_count
                    ? 'Current report matches the farms tied to your account.'
                    : `Your account currently has ${report.user_farm_count} registered farm${report.user_farm_count === 1 ? '' : 's'}.`}
                </p>
              </div>
              <div className="rounded-lg border border-stone-200">
                {report.disease_breakdown.length === 0 ? (
                  <p className="p-4 text-sm text-stone-500">No scan data yet.</p>
                ) : (
                  report.disease_breakdown.map((row) => (
                    <div key={row.disease} className="flex items-center justify-between border-b border-stone-100 p-4 last:border-0">
                      <span className="font-semibold text-stone-800">{row.disease}</span>
                      <span className="rounded-full bg-leaf-100 px-2 py-1 text-xs font-bold text-leaf-800">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="surface rounded-lg p-5">
          <h3 className="font-bold text-stone-950">Recommendation</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {report?.recommendation || 'Scan more crops and register farm locations to generate richer analytics.'}
          </p>
        </aside>
      </div>
    </div>
  );
}

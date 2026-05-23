import {
  CheckCircle2,
  FlaskConical,
  Leaf,
  Loader2,
  Plus,
  RefreshCw,
  ScanLine,
  Sprout,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import PageHeader from '../components/shared/PageHeader.jsx';
import StatCard from '../components/shared/StatCard.jsx';
import {
  ConfirmModal,
  CropCard,
  DataTable,
  FormSection,
  SearchFilterBar,
  StatusBadge,
  formatDateTime,
  labelize,
} from '../components/shared/platform.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';

const EMPTY_CROP_FORM = {
  farm_id: '',
  crop_type: '',
  variety: '',
  soil_type: '',
  planting_date: '',
  expected_harvest_date: '',
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function confidencePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${Math.round(number * 100)}%`;
}

function farmLocation(farm) {
  return [farm.barangay, farm.municipality, farm.province].filter(Boolean).join(', ') || 'Location details not set';
}

function latestPredictionTitle(prediction) {
  const result = prediction?.result || {};
  return result.best_crop || result.crop || result.recommendation_title || labelize(prediction?.prediction_type || 'Recommendation');
}

export default function CropManagement() {
  const { user } = useAuth();
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer';
  const isAdmin = roleName.toLowerCase() === 'admin';
  const [loading, setLoading] = useState(true);
  const [savingCrop, setSavingCrop] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [farms, setFarms] = useState([]);
  const [crops, setCrops] = useState([]);
  const [scans, setScans] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [flaggedReviews, setFlaggedReviews] = useState([]);
  const [cropSearch, setCropSearch] = useState('');
  const [scanSearch, setScanSearch] = useState('');
  const [scanStatus, setScanStatus] = useState('all');
  const [cropPage, setCropPage] = useState(1);
  const [scanPage, setScanPage] = useState(1);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropForm, setCropForm] = useState(EMPTY_CROP_FORM);
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewError, setReviewError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [farmsResponse, scansResponse, predictionsResponse, flaggedResponse] = await Promise.all([
        api.get('/farms'),
        api.get('/scans'),
        api.get('/predictions'),
        isAdmin ? api.get('/admin/flagged-reviews') : Promise.resolve({ data: [] }),
      ]);
      const nextFarms = safeArray(farmsResponse.data);
      setFarms(nextFarms);
      setScans(safeArray(scansResponse.data));
      setPredictions(safeArray(predictionsResponse.data));
      setFlaggedReviews(safeArray(flaggedResponse.data));

      const cropResults = await Promise.allSettled(
        nextFarms.map((farm) => api.get(`/farms/${farm.id}/crops`).then((response) => ({ farm, crops: safeArray(response.data) })))
      );
      setCrops(
        cropResults
          .filter((result) => result.status === 'fulfilled')
          .flatMap((result) => result.value.crops.map((crop) => ({ ...crop, farm: result.value.farm })))
      );
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Crop management data could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const filteredCrops = useMemo(() => {
    const query = cropSearch.trim().toLowerCase();
    if (!query) return crops;
    return crops.filter((crop) =>
      [crop.crop_type, crop.variety, crop.soil_type, crop.farm?.name, crop.farm?.owner_name, crop.farm?.owner_email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [cropSearch, crops]);

  const filteredScans = useMemo(() => {
    const query = scanSearch.trim().toLowerCase();
    return scans.filter((scan) => {
      const statusMatches = scanStatus === 'all' || String(scan.status || '').toLowerCase() === scanStatus;
      if (!statusMatches) return false;
      if (!query) return true;
      return [scan.crop_label, scan.disease_name, scan.severity, scan.analysis_mode, scan.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [scanSearch, scanStatus, scans]);

  const pendingReviewCount = flaggedReviews.filter((review) => review.verification_status === 'pending').length;

  async function submitCrop(event) {
    event.preventDefault();
    setSavingCrop(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        farm_id: Number(cropForm.farm_id),
        crop_type: cropForm.crop_type,
        variety: cropForm.variety || null,
        soil_type: cropForm.soil_type || null,
        planting_date: cropForm.planting_date || null,
        expected_harvest_date: cropForm.expected_harvest_date || null,
      };
      await api.post(`/farms/${payload.farm_id}/crops`, payload);
      setCropModalOpen(false);
      setCropForm(EMPTY_CROP_FORM);
      setSuccess('Crop record saved.');
      await load();
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Crop record could not be saved.'));
    } finally {
      setSavingCrop(false);
    }
  }

  async function decideFlaggedReview(id, decision) {
    setReviewAction(`${decision}-${id}`);
    setReviewError('');
    try {
      const { data } = await api.patch(`/admin/flagged-reviews/${id}/${decision}`);
      setFlaggedReviews((current) => current.map((review) => (review.id === id ? data : review)));
    } catch (requestError) {
      setReviewError(getDetailedApiErrorMessage(requestError, 'Flagged review could not be updated.'));
    } finally {
      setReviewAction(null);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Crop operations"
        title="Crop Management"
        body="Manage crop records, farm context, disease detection results, and crop recommendations without mixing in account administration."
        actions={
          <>
            <button className="btn-secondary" type="button" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <button className="btn-primary" type="button" onClick={() => setCropModalOpen(true)} disabled={farms.length === 0}>
              <Plus className="h-4 w-4" />
              Add Crop
            </button>
          </>
        }
      />

      {error ? <div className="danger-message">{error}</div> : null}
      {success ? <div className="success-message">{success}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Sprout} label="Crop records" value={crops.length} helper="Crops attached to registered farms." />
        <StatCard icon={Leaf} label="Farms in scope" value={farms.length} helper="Farm records available to this role." tone="sky" />
        <StatCard icon={ScanLine} label="Disease scans" value={scans.length} helper="Detection results and manual observations." tone="amber" />
        <StatCard icon={CheckCircle2} label="Recommendations" value={predictions.length} helper="Saved crop and soil recommendations." tone="soil" />
      </section>

      <div className="content-sidebar-layout">
        <div className="space-y-5">
          <section className="space-y-3">
            <SearchFilterBar
              search={cropSearch}
              onSearchChange={(value) => {
                setCropSearch(value);
                setCropPage(1);
              }}
              searchPlaceholder="Search crop, variety, soil, or farm"
            />
            <DataTable
              columns={[
                {
                  key: 'crop',
                  header: 'Crop',
                  render: (crop) => (
                    <div>
                      <p className="font-bold text-stone-950">{crop.crop_type}</p>
                      <p className="text-xs text-stone-500">{crop.variety || 'No variety set'}</p>
                    </div>
                  ),
                },
                {
                  key: 'farm',
                  header: 'Farm',
                  render: (crop) => (
                    <div>
                      <p className="font-semibold text-stone-900">{crop.farm?.name || '-'}</p>
                      <p className="text-xs text-stone-500">{farmLocation(crop.farm || {})}</p>
                    </div>
                  ),
                },
                { key: 'soil_type', header: 'Soil', render: (crop) => crop.soil_type || '-' },
                { key: 'planting_date', header: 'Planting', render: (crop) => crop.planting_date || '-' },
                { key: 'expected_harvest_date', header: 'Harvest', render: (crop) => crop.expected_harvest_date || '-' },
              ]}
              rows={filteredCrops}
              loading={loading}
              page={cropPage}
              pageSize={7}
              onPageChange={setCropPage}
              emptyTitle="No crop records found"
              emptyBody="Add a crop record from a registered farm to start organizing crop status."
            />
          </section>

          <section className="space-y-3">
            <SearchFilterBar
              search={scanSearch}
              onSearchChange={(value) => {
                setScanSearch(value);
                setScanPage(1);
              }}
              searchPlaceholder="Search crop scans or disease results"
              filters={[
                {
                  id: 'status',
                  label: 'Status',
                  value: scanStatus,
                  onChange: (value) => {
                    setScanStatus(value);
                    setScanPage(1);
                  },
                  options: [
                    { value: 'all', label: 'All statuses' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'failed', label: 'Failed' },
                  ],
                },
              ]}
            />
            <DataTable
              columns={[
                {
                  key: 'scan',
                  header: 'Disease detection result',
                  render: (scan) => (
                    <div>
                      <p className="font-bold text-stone-950">{scan.disease_name}</p>
                      <p className="text-xs text-stone-500">{scan.crop_label || 'Crop not labeled'}</p>
                    </div>
                  ),
                },
                { key: 'confidence', header: 'Confidence', render: (scan) => confidencePercent(scan.confidence) },
                { key: 'severity', header: 'Severity', render: (scan) => <StatusBadge status={scan.severity || 'draft'}>{labelize(scan.severity || 'Not set')}</StatusBadge> },
                { key: 'status', header: 'Status', render: (scan) => <StatusBadge status={scan.status}>{labelize(scan.status)}</StatusBadge> },
                { key: 'created_at', header: 'Detected', render: (scan) => formatDateTime(scan.created_at) },
              ]}
              rows={filteredScans}
              loading={loading}
              page={scanPage}
              pageSize={7}
              onPageChange={setScanPage}
              emptyTitle="No disease detections found"
              emptyBody="Run Disease Detector to populate crop health results here."
            />
          </section>

          {isAdmin ? (
            <section className="surface rounded-lg p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="section-title flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-leaf-700" />
                    Flagged crop reviews
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    Farmer correction reports for disease-detection learning. Account actions stay in User Management.
                  </p>
                </div>
                <StatusBadge status={pendingReviewCount ? 'pending' : 'active'}>{pendingReviewCount} pending</StatusBadge>
              </div>
              {reviewError ? <div className="danger-message mt-4">{reviewError}</div> : null}
              <div className="mt-4 grid gap-3">
                {flaggedReviews.slice(0, 8).map((review) => (
                  <article key={review.id} className="rounded-lg border border-stone-200 bg-white p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Submitted by</p>
                        <p className="mt-1 break-words font-bold text-stone-950">{review.user_name}</p>
                        <p className="break-all text-xs text-stone-500">{review.user_email}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Correction</p>
                        <p className="mt-1 text-sm text-stone-600">
                          {review.original_crop_label || 'Unknown crop'}: {review.original_disease_name}
                        </p>
                        <p className="mt-1 font-semibold text-stone-950">
                          {review.corrected_crop_label}: {review.corrected_disease_name}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 lg:items-end">
                        <StatusBadge status={review.verification_status}>{labelize(review.verification_status)}</StatusBadge>
                        {review.verification_status === 'pending' ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="btn-primary min-h-9 px-3 py-1.5 text-xs"
                              type="button"
                              disabled={reviewAction !== null}
                              onClick={() => decideFlaggedReview(review.id, 'accept')}
                            >
                              {reviewAction === `accept-${review.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              Accept
                            </button>
                            <button
                              className="btn-danger min-h-9 px-3 py-1.5 text-xs"
                              type="button"
                              disabled={reviewAction !== null}
                              onClick={() => decideFlaggedReview(review.id, 'reject')}
                            >
                              {reviewAction === `reject-${review.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                              Reject
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
                            type="button"
                            disabled={reviewAction !== null}
                            onClick={() => decideFlaggedReview(review.id, 'undo')}
                          >
                            Undo decision
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
                {!flaggedReviews.length ? (
                  <div className="empty-state">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-stone-400" />
                    <p className="mt-2 text-sm font-bold text-stone-950">No flagged crop reviews</p>
                    <p className="mt-1 text-sm text-stone-500">Correction reports from farmers appear here.</p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5 min-[1440px]:sticky sticky-panel min-[1440px]:self-start">
          <FormSection icon={ScanLine} title="Crop tools" body="Quick actions for scanning, disease detection, and farm records.">
            <div className="grid gap-2">
              <Link className="btn-primary justify-center" to="/scan">
                <ScanLine className="h-4 w-4" />
                Manual Scan
              </Link>
              <Link className="btn-secondary justify-center" to="/disease-detector">
                <Leaf className="h-4 w-4" />
                Disease Detector
              </Link>
              <Link className="btn-secondary justify-center" to="/farms">
                <Sprout className="h-4 w-4" />
                Farm Information
              </Link>
            </div>
          </FormSection>

          <section className="surface rounded-lg p-4 sm:p-5">
            <h2 className="section-title">Farm information</h2>
            <div className="mt-4 space-y-3">
              {farms.slice(0, 5).map((farm) => (
                <CropCard key={farm.id} title={farm.name} meta={farmLocation(farm)} status={farm.status}>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-stone-500">Area</dt>
                      <dd className="font-semibold text-stone-900">{farm.area_hectares || '-'} ha</dd>
                    </div>
                    {isAdmin ? (
                      <div>
                        <dt className="text-stone-500">Owner</dt>
                        <dd className="break-words font-semibold text-stone-900">{farm.owner_name || farm.owner_email || '-'}</dd>
                      </div>
                    ) : null}
                  </dl>
                </CropCard>
              ))}
              {!farms.length && !loading ? (
                <div className="empty-state">
                  <Sprout className="mx-auto h-8 w-8 text-stone-400" />
                  <p className="mt-2 text-sm font-bold text-stone-950">No farms available</p>
                  <p className="mt-1 text-sm text-stone-500">Register a farm before attaching crop records.</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="surface rounded-lg p-4 sm:p-5">
            <h2 className="section-title">Latest recommendations</h2>
            <div className="mt-4 space-y-3">
              {predictions.slice(0, 5).map((prediction) => (
                <article key={prediction.id} className="rounded-lg border border-stone-200 bg-white p-3">
                  <p className="break-words text-sm font-bold text-stone-950">{latestPredictionTitle(prediction)}</p>
                  <p className="mt-1 text-xs text-stone-500">{labelize(prediction.prediction_type)} | {formatDateTime(prediction.created_at)}</p>
                </article>
              ))}
              {!predictions.length && !loading ? (
                <div className="empty-state">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-stone-400" />
                  <p className="mt-2 text-sm font-bold text-stone-950">No recommendations yet</p>
                  <p className="mt-1 text-sm text-stone-500">Manual scan recommendations appear here after analysis.</p>
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <ConfirmModal
        open={cropModalOpen}
        title="Add crop record"
        body="Attach a crop to a registered farm so scans and recommendations can be organized by crop."
        confirmLabel={savingCrop ? 'Saving...' : 'Save crop'}
        loading={savingCrop}
        onCancel={() => setCropModalOpen(false)}
        onConfirm={() => document.getElementById('crop-management-form')?.requestSubmit()}
      >
        <form id="crop-management-form" className="grid gap-3" onSubmit={submitCrop}>
          <label className="block text-sm font-bold text-stone-700">
            Farm
            <select
              className="field mt-2"
              required
              value={cropForm.farm_id}
              onChange={(event) => setCropForm((current) => ({ ...current, farm_id: event.target.value }))}
            >
              <option value="">Choose a farm</option>
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-stone-700">
              Crop type
              <input className="field mt-2" required value={cropForm.crop_type} onChange={(event) => setCropForm((current) => ({ ...current, crop_type: event.target.value }))} />
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Variety
              <input className="field mt-2" value={cropForm.variety} onChange={(event) => setCropForm((current) => ({ ...current, variety: event.target.value }))} />
            </label>
          </div>
          <label className="block text-sm font-bold text-stone-700">
            Soil type
            <input className="field mt-2" value={cropForm.soil_type} onChange={(event) => setCropForm((current) => ({ ...current, soil_type: event.target.value }))} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-stone-700">
              Planting date
              <input className="field mt-2" type="date" value={cropForm.planting_date} onChange={(event) => setCropForm((current) => ({ ...current, planting_date: event.target.value }))} />
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Expected harvest
              <input className="field mt-2" type="date" value={cropForm.expected_harvest_date} onChange={(event) => setCropForm((current) => ({ ...current, expected_harvest_date: event.target.value }))} />
            </label>
          </div>
        </form>
      </ConfirmModal>
    </div>
  );
}

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Monitor, FilePlus2, X, Upload, Eye, Search, QrCode, FileText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import '../styles/assetMaster.css';

const ASSET_CATEGORIES = [
  'Laboratory Equipment',
  'Radiology Equipment',
  'OT Equipment',
  'ICU Equipment',
  'Pharmacy Equipment',
  'Emergency Equipment',
  'CSSD Equipment',
  'General Hospital Equipment',
];

const ASSET_STATUSES = [
  'Working',
  'Idle',
  'In Use',
  'PM Due',
  'Calibration Due',
  'Under Repair',
  'Waiting Spare Parts',
  'Vendor Visit Scheduled',
  'AMC Due',
  'CMC Due',
  'Condemned',
  'Disposed',
  'Shifted',
  // legacy (kept for existing records)
  'Under Maintenance',
  'Breakdown',
  'Repair In Progress',
  'Ready to Use',
  'Decommissioned',
];

const RISK_CLASSES = ['Critical', 'High', 'Medium', 'Low'];

const DOC_TYPES = [
  'User Manual',
  'Service Manual',
  'Installation Report',
  'Commissioning Report',
  'Calibration Certificate',
  'Electrical Safety Certificate',
  'Photo',
  'Warranty Document',
  'Invoice',
  'Other',
];

const DATE_FIELDS = [
  'purchaseDate',
  'warrantyStart',
  'warrantyExpiry',
  'nextPmDate',
  'nextCalibrationDate',
  'installationDate',
  'commissioningDate',
];

const statusBadgeClass = (status) => {
  switch (status) {
    case 'Working':
    case 'Ready to Use':
    case 'In Use':
    case 'Idle':
      return 'am-badge am-badge--ok';
    case 'Under Maintenance':
    case 'Repair In Progress':
    case 'Under Repair':
    case 'PM Due':
    case 'Calibration Due':
    case 'Waiting Spare Parts':
    case 'AMC Due':
    case 'CMC Due':
    case 'Vendor Visit Scheduled':
    case 'Shifted':
      return 'am-badge am-badge--warn';
    case 'Breakdown':
    case 'Condemned':
    case 'Disposed':
      return 'am-badge am-badge--bad';
    default:
      return 'am-badge am-badge--muted';
  }
};

const formatDate = (v) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
};

const toDateInput = (v) => (v ? new Date(v).toISOString().split('T')[0] : '');

const inr = (n) => (n == null || n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);

const emptyDoc = () => ({
  type: 'User Manual',
  name: '',
  data: '',
  mimeType: '',
  fileName: '',
  size: 0,
});

const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB per file

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));
    if (file.size > MAX_DOC_BYTES) {
      return reject(new Error(`File too large (max ${MAX_DOC_BYTES / (1024 * 1024)} MB)`));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      resolve({
        data: reader.result, // data:<mime>;base64,...
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  });

const formatBytes = (n) => {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export default function AssetPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [showDelete, setShowDelete] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [documents, setDocuments] = useState([]);
  const [formTab, setFormTab] = useState('identity');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const qc = useQueryClient();

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data.data),
  });

  const { data: bemsVendors } = useQuery({
    queryKey: ['bems-vendors'],
    queryFn: () => api.get('/bems/vendors').then((r) => r.data.data).catch(() => []),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['assetDashboard'],
    queryFn: () => api.get('/assets/dashboard').then((r) => r.data.data),
  });

  const { data: assets, isLoading } = useQuery({
    queryKey: ['assets', statusFilter, categoryFilter, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      params.set('page', String(page));
      return api.get(`/assets?${params}`).then((r) => r.data);
    },
  });

  const { register, handleSubmit, reset, setValue } = useForm({
    defaultValues: {
      status: 'Working',
      riskClass: 'Medium',
      hospital: 'Main Hospital',
      pmIntervalDays: 90,
      calibrationIntervalDays: 365,
    },
  });

  const closeForm = () => {
    setShowAdd(false);
    setEditAsset(null);
    setDocuments([]);
    setFormTab('identity');
    reset({
      status: 'Working',
      riskClass: 'Medium',
      hospital: 'Main Hospital',
      pmIntervalDays: 90,
      calibrationIntervalDays: 365,
    });
  };

  const openCreate = () => {
    setEditAsset(null);
    setDocuments([]);
    setFormTab('identity');
    reset({
      status: 'Working',
      riskClass: 'Medium',
      hospital: 'Main Hospital',
      pmIntervalDays: 90,
      calibrationIntervalDays: 365,
    });
    setShowAdd(true);
  };

  const openEdit = async (asset) => {
    try {
      // Load full record so document base64 is available (list omits data)
      const res = await api.get(`/assets/${asset._id}`);
      const full = res.data.data || asset;
      setEditAsset(full);
      setFormTab('identity');
      setDocuments(
        (full.documents || []).map((d) => ({
          type: d.type || 'Other',
          name: d.name || d.fileName || '',
          data: d.data || '',
          mimeType: d.mimeType || '',
          fileName: d.fileName || '',
          size: d.size || 0,
          url: d.url || '',
          _id: d._id,
        }))
      );
      Object.entries(full).forEach(([k, v]) => {
        if (k === 'department') setValue(k, v?._id || v || '');
        else if (k === 'vendor') setValue(k, v?._id || v || '');
        else if (DATE_FIELDS.includes(k)) setValue(k, toDateInput(v));
        else if (k === 'documents' || k === 'addedBy' || k === '__v') return;
        else setValue(k, v ?? '');
      });
      if (full.purchaseCost == null && full.cost != null) setValue('purchaseCost', full.cost);
      if (full.cost == null && full.purchaseCost != null) setValue('cost', full.purchaseCost);
      setShowAdd(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load equipment');
    }
  };

  const preparePayload = (d) => {
    const payload = { ...d };
    if (payload.purchaseCost != null && payload.purchaseCost !== '') {
      payload.purchaseCost = Number(payload.purchaseCost);
      payload.cost = payload.purchaseCost;
    } else if (payload.cost != null && payload.cost !== '') {
      payload.cost = Number(payload.cost);
      payload.purchaseCost = payload.cost;
    }
    ['currentValue', 'expectedLifeYears', 'pmIntervalDays', 'calibrationIntervalDays', 'healthScore'].forEach((k) => {
      if (payload[k] === '' || payload[k] == null) return;
      payload[k] = Number(payload[k]);
    });
    if (!payload.department) delete payload.department;
    if (!payload.vendor) delete payload.vendor;
    payload.documents = documents
      .filter((doc) => doc.data || doc.url || doc.name)
      .map(({ type, name, data, mimeType, fileName, size, url }) => ({
        type,
        name: name || fileName || type,
        data: data || undefined,
        mimeType: mimeType || undefined,
        fileName: fileName || undefined,
        size: size || 0,
        url: url || undefined,
      }));
    return payload;
  };

  const saveMut = useMutation({
    mutationFn: (d) => {
      const payload = preparePayload(d);
      return editAsset ? api.put(`/assets/${editAsset._id}`, payload) : api.post('/assets', payload);
    },
    onSuccess: async (res) => {
      toast.success(editAsset ? 'Equipment master updated' : 'Equipment registered');
      qc.invalidateQueries(['assets']);
      qc.invalidateQueries(['assetDashboard']);
      qc.invalidateQueries(['bems-equipment']);
      const saved = res?.data?.data;
      if (saved?._id) {
        setSelectedId(saved._id);
        try {
          const full = await api.get(`/assets/${saved._id}`);
          setSelected(full.data.data);
        } catch {
          setSelected(saved);
        }
      }
      closeForm();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save equipment'),
  });

  const onSave = handleSubmit(
    (d) => saveMut.mutate(d),
    (errors) => {
      if (errors.name || errors.category) {
        setFormTab('basic');
        toast.error('Please fill Equipment Name and Category (Basic tab)');
      } else {
        toast.error('Please complete required fields');
      }
    }
  );

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/assets/${id}`),
    onSuccess: () => {
      toast.success('Equipment decommissioned');
      qc.invalidateQueries(['assets']);
      qc.invalidateQueries(['assetDashboard']);
      setShowDelete(null);
      setSelected(null);
      setSelectedId(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to decommission'),
  });

  const dash = dashboardData || {};
  const rows = assets?.data || [];
  const pages = assets?.pages || 1;

  const filteredRows = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [
      r.assetId, r.name, r.equipmentCode, r.qrCode, r.barcode, r.assetNumber,
      r.serialNumber, r.manufacturer, r.brand, r.modelNumber, r.category,
      r.department?.name, r.status, r.location, r.vendorName,
    ].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const openDetail = async (row) => {
    setSelectedId(row._id);
    setDetailLoading(true);
    try {
      const res = await api.get(`/assets/${row._id}`);
      setSelected(res.data.data);
    } catch (err) {
      setSelected(row);
      toast.error(err.response?.data?.message || 'Could not load full record');
    } finally {
      setDetailLoading(false);
    }
  };

  const updateDoc = (idx, key, value) => {
    setDocuments((prev) => prev.map((d, i) => (i === idx ? { ...d, [key]: value } : d)));
  };

  const onPickFile = async (idx, file) => {
    if (!file) return;
    try {
      const parsed = await fileToBase64(file);
      setDocuments((prev) =>
        prev.map((d, i) =>
          i === idx
            ? {
                ...d,
                ...parsed,
                name: d.name || file.name.replace(/\.[^.]+$/, ''),
              }
            : d
        )
      );
      toast.success(`File loaded: ${file.name}`);
    } catch (err) {
      toast.error(err.message || 'Failed to read file');
    }
  };

  const viewDocument = (doc) => {
    const href = doc.data || doc.url;
    if (!href) {
      toast.error('No file attached');
      return;
    }
    const w = window.open();
    if (!w) {
      toast.error('Pop-up blocked — allow pop-ups to view file');
      return;
    }
    if (String(href).startsWith('data:')) {
      w.document.write(
        `<title>${doc.name || doc.fileName || 'Document'}</title>` +
        (String(doc.mimeType || '').startsWith('image/')
          ? `<img src="${href}" style="max-width:100%" />`
          : String(doc.mimeType || '').includes('pdf')
            ? `<embed src="${href}" type="application/pdf" width="100%" height="100%" />`
            : `<p>File: ${doc.fileName || doc.name}</p><a download="${doc.fileName || 'file'}" href="${href}">Download</a>`)
      );
    } else {
      w.location = href;
    }
  };

  return (
    <div className="am-shell">
      <div className="am-head">
        <div>
          <p className="am-head__eyebrow">Biomedical · Equipment Master</p>
          <h2 className="am-head__title">Equipment Master Register</h2>
          <p className="am-head__sub">Click any equipment to view the complete master record in one place</p>
        </div>
        <button type="button" onClick={openCreate} className="am-btn am-btn--primary">
          <Plus size={14} /> Add equipment
        </button>
      </div>

      <div className="am-kpi am-kpi--5">
        {[
          { label: 'Total', value: dash.totalAssets || 0 },
          { label: 'Working', value: dash.working || 0, tone: 'is-ok' },
          { label: 'Under repair', value: dash.underRepair || 0, tone: 'is-warn' },
          { label: 'Breakdown', value: dash.breakdown || 0, tone: 'is-bad' },
          { label: 'Warranty ≤30d', value: dash.warrantyExpiringSoon || 0, tone: 'is-warn' },
        ].map((k) => (
          <div key={k.label} className="am-kpi__card">
            <p className="am-kpi__label">{k.label}</p>
            <p className={`am-kpi__value ${k.tone || ''}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="am-workspace">
        {/* LEFT — register list */}
        <aside className="am-register">
          <div className="am-register__tools">
            <div className="am-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID, name, QR, serial, dept…"
              />
            </div>
            <div className="am-register__filters">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="am-select"
              >
                <option value="">All statuses</option>
                {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="am-select"
              >
                <option value="">All categories</option>
                {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <p className="am-register__count">{filteredRows.length} equipment</p>
          </div>

          <div className="am-register__list">
            {isLoading && <p className="am-empty">Loading register…</p>}
            {!isLoading && !filteredRows.length && (
              <p className="am-empty">No equipment found. Click Add equipment to register the first device.</p>
            )}
            {filteredRows.map((r) => (
              <button
                key={r._id}
                type="button"
                className={`am-reg-item${selectedId === r._id ? ' is-active' : ''}`}
                onClick={() => openDetail(r)}
              >
                <div className="am-reg-item__top">
                  <span className="am-mono">{r.assetId}</span>
                  <span className={statusBadgeClass(r.status)}>{r.status || '—'}</span>
                </div>
                <p className="am-reg-item__name">{r.name}</p>
                <p className="am-reg-item__meta">
                  {r.category || '—'}
                  {r.department?.name ? ` · ${r.department.name}` : ''}
                  {r.riskClass ? ` · ${r.riskClass}` : ''}
                </p>
                <p className="am-reg-item__codes">
                  <QrCode size={12} /> {r.qrCode || r.assetId || '—'}
                  {r.serialNumber ? ` · SN ${r.serialNumber}` : ''}
                </p>
              </button>
            ))}
          </div>

          {pages > 1 && (
            <div className="am-pager am-pager--compact">
              <button type="button" className="am-btn am-btn--ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>{page}/{pages}</span>
              <button type="button" className="am-btn am-btn--ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </aside>

        {/* RIGHT — full dossier */}
        <section className="am-dossier">
          {!selectedId && (
            <div className="am-dossier__empty">
              <Monitor size={36} strokeWidth={1.25} />
              <h3>Select equipment</h3>
              <p>Click a device on the left to open its complete master record — identity, location, purchase, technical specs and documents.</p>
            </div>
          )}

          {selectedId && detailLoading && (
            <div className="am-dossier__empty"><p>Loading master record…</p></div>
          )}

          {selected && !detailLoading && (
            <>
              <div className="am-dossier__hero">
                <div>
                  <p className="am-dossier__id">{selected.assetId}</p>
                  <h3 className="am-dossier__title">{selected.name}</h3>
                  <p className="am-dossier__sub">
                    {selected.category}
                    {selected.manufacturer ? ` · ${selected.manufacturer}` : ''}
                    {selected.modelNumber ? ` · ${selected.modelNumber}` : ''}
                  </p>
                  <div className="am-dossier__badges">
                    <span className={statusBadgeClass(selected.status)}>{selected.status}</span>
                    {selected.riskClass && <span className="am-badge">{selected.riskClass} risk</span>}
                    {selected.lifecycleStage && <span className="am-badge am-badge--muted">{selected.lifecycleStage}</span>}
                  </div>
                </div>
                <div className="am-dossier__actions">
                  <button type="button" className="am-btn am-btn--primary" onClick={() => openEdit(selected)}>
                    <Edit2 size={14} /> Edit master
                  </button>
                  {selected.status !== 'Decommissioned' && selected.status !== 'Disposed' && (
                    <button type="button" className="am-btn am-btn--danger" onClick={() => setShowDelete(selected)}>
                      <Trash2 size={14} /> Decommission
                    </button>
                  )}
                </div>
              </div>

              <div className="am-dossier__scroll">
                <DossierSection title="Identification">
                  <DossierGrid>
                    <DossierField label="Equipment ID" value={selected.assetId} mono />
                    <DossierField label="Asset Number" value={selected.assetNumber} />
                    <DossierField label="Hospital Equipment Code" value={selected.equipmentCode} />
                    <DossierField label="QR Code" value={selected.qrCode || selected.assetId} mono />
                    <DossierField label="Barcode" value={selected.barcode} mono />
                    <DossierField label="Risk Class" value={selected.riskClass} />
                  </DossierGrid>
                </DossierSection>

                <DossierSection title="Basic Information">
                  <DossierGrid>
                    <DossierField label="Equipment Name" value={selected.name} />
                    <DossierField label="Category" value={selected.category} />
                    <DossierField label="Status" value={selected.status} />
                    <DossierField label="Manufacturer" value={selected.manufacturer} />
                    <DossierField label="Brand" value={selected.brand} />
                    <DossierField label="Model" value={selected.modelNumber} />
                    <DossierField label="Serial Number" value={selected.serialNumber} mono />
                    <DossierField label="Version" value={selected.version} />
                  </DossierGrid>
                </DossierSection>

                <DossierSection title="Location">
                  <DossierGrid>
                    <DossierField label="Hospital" value={selected.hospital} />
                    <DossierField label="Building" value={selected.building} />
                    <DossierField label="Floor" value={selected.floor} />
                    <DossierField label="Department" value={selected.department?.name} />
                    <DossierField label="Room" value={selected.room} />
                    <DossierField label="Ward" value={selected.ward} />
                    <DossierField label="Bed" value={selected.bed} />
                    <DossierField label="Current User" value={selected.currentUser} />
                    <DossierField label="Location notes" value={selected.location} wide />
                  </DossierGrid>
                </DossierSection>

                <DossierSection title="Purchase Information">
                  <DossierGrid>
                    <DossierField label="Purchase Date" value={formatDate(selected.purchaseDate)} />
                    <DossierField label="Purchase Cost" value={inr(selected.purchaseCost ?? selected.cost)} />
                    <DossierField label="Current Value" value={inr(selected.currentValue)} />
                    <DossierField label="Vendor" value={selected.vendor?.name || selected.vendorName} />
                    <DossierField label="Vendor Contact" value={selected.vendorContact} />
                    <DossierField label="Vendor Email" value={selected.vendorEmail} />
                    <DossierField label="Invoice" value={selected.invoiceNumber} />
                    <DossierField label="Purchase Order" value={selected.purchaseOrder} />
                    <DossierField label="Warranty Start" value={formatDate(selected.warrantyStart)} />
                    <DossierField label="Warranty End" value={formatDate(selected.warrantyExpiry)} />
                    <DossierField label="Expected Life" value={selected.expectedLifeYears != null ? `${selected.expectedLifeYears} years` : null} />
                    <DossierField label="AMC Expiry" value={formatDate(selected.amcExpiry)} />
                    <DossierField label="CMC Expiry" value={formatDate(selected.cmcExpiry)} />
                  </DossierGrid>
                </DossierSection>

                <DossierSection title="Technical Information">
                  <DossierGrid>
                    <DossierField label="Voltage" value={selected.voltage} />
                    <DossierField label="Frequency" value={selected.frequency} />
                    <DossierField label="Power Rating" value={selected.powerRating} />
                    <DossierField label="Battery Details" value={selected.batteryDetails} />
                    <DossierField label="Software Version" value={selected.softwareVersion} />
                    <DossierField label="PM Interval" value={selected.pmIntervalDays != null ? `${selected.pmIntervalDays} days` : null} />
                    <DossierField label="Calibration Interval" value={selected.calibrationIntervalDays != null ? `${selected.calibrationIntervalDays} days` : null} />
                    <DossierField label="Last PM" value={formatDate(selected.lastPmDate)} />
                    <DossierField label="Next PM" value={formatDate(selected.nextPmDate)} />
                    <DossierField label="Last Calibration" value={formatDate(selected.lastCalibrationDate)} />
                    <DossierField label="Next Calibration" value={formatDate(selected.nextCalibrationDate)} />
                    <DossierField label="Health Score" value={selected.healthScore != null ? `${selected.healthScore}` : null} />
                    <DossierField label="Accessories" value={selected.accessories} wide />
                    <DossierField label="Description" value={selected.description} wide />
                  </DossierGrid>
                </DossierSection>

                <DossierSection title={`Documents (${(selected.documents || []).length})`}>
                  {!(selected.documents || []).length && (
                    <p className="am-dossier__muted">No documents uploaded. Edit master → Documents to attach files.</p>
                  )}
                  <div className="am-dossier__docs">
                    {(selected.documents || []).map((doc, i) => (
                      <div key={doc._id || i} className="am-dossier__doc">
                        <FileText size={16} />
                        <div>
                          <strong>{doc.name || doc.fileName || doc.type}</strong>
                          <span>{doc.type}{doc.fileName ? ` · ${doc.fileName}` : ''}{doc.size ? ` · ${formatBytes(doc.size)}` : ''}</span>
                        </div>
                        {(doc.data || doc.url) && (
                          <button type="button" className="am-btn am-btn--ghost" onClick={() => viewDocument(doc)}>
                            <Eye size={14} /> View
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </DossierSection>
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        isOpen={showAdd}
        onClose={closeForm}
        title={editAsset ? 'Edit Equipment Master' : 'Add Equipment Master'}
        subtitle={
          editAsset
            ? `${editAsset.assetId || ''} · Permanent master record`
            : 'Fill each tab, then Register. Required: Name + Category.'
        }
        size="full"
      >
        <form onSubmit={onSave} className="am-wizard">
          <div className="am-wizard__tabs" role="tablist">
            {[
              { id: 'identity', label: '1. Identity' },
              { id: 'basic', label: '2. Basic' },
              { id: 'location', label: '3. Location' },
              { id: 'purchase', label: '4. Purchase' },
              { id: 'technical', label: '5. Technical' },
              { id: 'documents', label: '6. Documents' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={formTab === t.id}
                className={`am-wizard__tab${formTab === t.id ? ' is-active' : ''}`}
                onClick={() => setFormTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="am-wizard__body">
            {formTab === 'identity' && (
              <div className="am-wizard__panel">
                <h3 className="am-wizard__panel-title">Identification</h3>
                <p className="am-wizard__panel-sub">Equipment ID is auto-generated. Enter hospital codes and scan IDs here.</p>
                <div className="am-wizard__grid">
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-id">Equipment ID</label>
                    <input id="eq-id" className="am-field" value={editAsset?.assetId || 'Auto on save (AST-######)'} disabled readOnly />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-asset-no">Asset Number</label>
                    <input id="eq-asset-no" {...register('assetNumber')} className="am-field" placeholder="Hospital asset tag" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-code">Hospital Equipment Code</label>
                    <input id="eq-code" {...register('equipmentCode')} className="am-field" placeholder="e.g. ICU-VENT-01" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-qr">QR Code</label>
                    <input id="eq-qr" {...register('qrCode')} className="am-field" placeholder="Leave blank = use Equipment ID" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-barcode">Barcode</label>
                    <input id="eq-barcode" {...register('barcode')} className="am-field" placeholder="Scan or type barcode" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-risk">Risk Class</label>
                    <select id="eq-risk" {...register('riskClass')} className="am-field">
                      {RISK_CLASSES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="am-wizard__nav">
                  <span />
                  <button type="button" className="am-btn am-btn--primary" onClick={() => setFormTab('basic')}>Next: Basic →</button>
                </div>
              </div>
            )}

            {formTab === 'basic' && (
              <div className="am-wizard__panel">
                <h3 className="am-wizard__panel-title">Basic Information</h3>
                <p className="am-wizard__panel-sub">Name and category are required to register equipment.</p>
                <div className="am-wizard__grid">
                  <div className="am-field-wrap am-field-wrap--full">
                    <label className="am-label" htmlFor="eq-name">Equipment Name *</label>
                    <input id="eq-name" {...register('name', { required: true })} className="am-field" placeholder="e.g. ECG Machine / Ventilator" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-cat">Category *</label>
                    <select id="eq-cat" {...register('category', { required: true })} className="am-field">
                      <option value="">Select category</option>
                      {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-status">Status</label>
                    <select id="eq-status" {...register('status')} className="am-field">
                      {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-mfr">Manufacturer</label>
                    <input id="eq-mfr" {...register('manufacturer')} className="am-field" placeholder="e.g. Philips" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-brand">Brand</label>
                    <input id="eq-brand" {...register('brand')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-model">Model</label>
                    <input id="eq-model" {...register('modelNumber')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-serial">Serial Number</label>
                    <input id="eq-serial" {...register('serialNumber')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-ver">Version</label>
                    <input id="eq-ver" {...register('version')} className="am-field" placeholder="Hardware / firmware" />
                  </div>
                </div>
                <div className="am-wizard__nav">
                  <button type="button" className="am-btn am-btn--ghost" onClick={() => setFormTab('identity')}>← Identity</button>
                  <button type="button" className="am-btn am-btn--primary" onClick={() => setFormTab('location')}>Next: Location →</button>
                </div>
              </div>
            )}

            {formTab === 'location' && (
              <div className="am-wizard__panel">
                <h3 className="am-wizard__panel-title">Location</h3>
                <p className="am-wizard__panel-sub">Where the equipment is currently placed in the hospital.</p>
                <div className="am-wizard__grid">
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-hosp">Hospital</label>
                    <input id="eq-hosp" {...register('hospital')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-bldg">Building</label>
                    <input id="eq-bldg" {...register('building')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-floor">Floor</label>
                    <input id="eq-floor" {...register('floor')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-dept">Department</label>
                    <select id="eq-dept" {...register('department')} className="am-field">
                      <option value="">Select department</option>
                      {(departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-room">Room</label>
                    <input id="eq-room" {...register('room')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-ward">Ward</label>
                    <input id="eq-ward" {...register('ward')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-bed">Bed</label>
                    <input id="eq-bed" {...register('bed')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-user">Current User</label>
                    <input id="eq-user" {...register('currentUser')} className="am-field" placeholder="Assigned staff / unit" />
                  </div>
                  <div className="am-field-wrap am-field-wrap--full">
                    <label className="am-label" htmlFor="eq-loc">Location notes</label>
                    <input id="eq-loc" {...register('location')} className="am-field" placeholder="e.g. ICU Block B — Bay 3" />
                  </div>
                </div>
                <div className="am-wizard__nav">
                  <button type="button" className="am-btn am-btn--ghost" onClick={() => setFormTab('basic')}>← Basic</button>
                  <button type="button" className="am-btn am-btn--primary" onClick={() => setFormTab('purchase')}>Next: Purchase →</button>
                </div>
              </div>
            )}

            {formTab === 'purchase' && (
              <div className="am-wizard__panel">
                <h3 className="am-wizard__panel-title">Purchase Information</h3>
                <p className="am-wizard__panel-sub">Cost, vendor, invoice, PO and warranty details.</p>
                <div className="am-wizard__grid">
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-pdate">Purchase Date</label>
                    <input id="eq-pdate" {...register('purchaseDate')} type="date" className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-pcost">Purchase Cost (₹)</label>
                    <input id="eq-pcost" {...register('purchaseCost', { valueAsNumber: true })} type="number" step="0.01" className="am-field" placeholder="0.00" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-cval">Current Value (₹)</label>
                    <input id="eq-cval" {...register('currentValue', { valueAsNumber: true })} type="number" step="0.01" className="am-field" placeholder="0.00" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-vendor">Vendor (BME list)</label>
                    <select id="eq-vendor" {...register('vendor')} className="am-field">
                      <option value="">Select vendor</option>
                      {(bemsVendors || []).map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-vname">Vendor Name</label>
                    <input id="eq-vname" {...register('vendorName')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-vcontact">Vendor Contact</label>
                    <input id="eq-vcontact" {...register('vendorContact')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-vemail">Vendor Email</label>
                    <input id="eq-vemail" {...register('vendorEmail')} type="email" className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-inv">Invoice</label>
                    <input id="eq-inv" {...register('invoiceNumber')} className="am-field" placeholder="Invoice number" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-po">Purchase Order</label>
                    <input id="eq-po" {...register('purchaseOrder')} className="am-field" placeholder="PO number" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-ws">Warranty Start</label>
                    <input id="eq-ws" {...register('warrantyStart')} type="date" className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-we">Warranty End</label>
                    <input id="eq-we" {...register('warrantyExpiry')} type="date" className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-life">Expected Life (years)</label>
                    <input id="eq-life" {...register('expectedLifeYears', { valueAsNumber: true })} type="number" className="am-field" />
                  </div>
                </div>
                <div className="am-wizard__nav">
                  <button type="button" className="am-btn am-btn--ghost" onClick={() => setFormTab('location')}>← Location</button>
                  <button type="button" className="am-btn am-btn--primary" onClick={() => setFormTab('technical')}>Next: Technical →</button>
                </div>
              </div>
            )}

            {formTab === 'technical' && (
              <div className="am-wizard__panel">
                <h3 className="am-wizard__panel-title">Technical Information</h3>
                <p className="am-wizard__panel-sub">Electrical specs, software, accessories and maintenance intervals.</p>
                <div className="am-wizard__grid">
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-volt">Voltage</label>
                    <input id="eq-volt" {...register('voltage')} className="am-field" placeholder="e.g. 230V AC" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-freq">Frequency</label>
                    <input id="eq-freq" {...register('frequency')} className="am-field" placeholder="e.g. 50 Hz" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-pwr">Power Rating</label>
                    <input id="eq-pwr" {...register('powerRating')} className="am-field" placeholder="e.g. 500 W" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-batt">Battery Details</label>
                    <input id="eq-batt" {...register('batteryDetails')} className="am-field" placeholder="Type, capacity, backup" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-sw">Software Version</label>
                    <input id="eq-sw" {...register('softwareVersion')} className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-pm">PM Interval (days)</label>
                    <input id="eq-pm" {...register('pmIntervalDays', { valueAsNumber: true })} type="number" className="am-field" />
                  </div>
                  <div className="am-field-wrap">
                    <label className="am-label" htmlFor="eq-cal">Calibration Interval (days)</label>
                    <input id="eq-cal" {...register('calibrationIntervalDays', { valueAsNumber: true })} type="number" className="am-field" />
                  </div>
                  <div className="am-field-wrap am-field-wrap--full">
                    <label className="am-label" htmlFor="eq-acc">Accessories</label>
                    <textarea id="eq-acc" {...register('accessories')} className="am-field" rows={3} placeholder="Probes, cables, carts…" />
                  </div>
                  <div className="am-field-wrap am-field-wrap--full">
                    <label className="am-label" htmlFor="eq-desc">Description / Notes</label>
                    <textarea id="eq-desc" {...register('description')} className="am-field" rows={3} />
                  </div>
                </div>
                <div className="am-wizard__nav">
                  <button type="button" className="am-btn am-btn--ghost" onClick={() => setFormTab('purchase')}>← Purchase</button>
                  <button type="button" className="am-btn am-btn--primary" onClick={() => setFormTab('documents')}>Next: Documents →</button>
                </div>
              </div>
            )}

            {formTab === 'documents' && (
              <div className="am-wizard__panel">
                <div className="am-wizard__panel-head">
                  <div>
                    <h3 className="am-wizard__panel-title">Documents</h3>
                    <p className="am-wizard__panel-sub">
                      Upload files (PDF, images, docs). Stored in database as base64. Max 5 MB each.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="am-btn am-btn--primary"
                    onClick={() => setDocuments((prev) => [...prev, emptyDoc()])}
                  >
                    <FilePlus2 size={14} /> Add document
                  </button>
                </div>

                {!documents.length && (
                  <div className="am-wizard__empty">
                    No documents yet. Click <strong>Add document</strong>, choose type, then upload a file.
                  </div>
                )}

                <div className="am-doc-list am-doc-list--wizard">
                  {documents.map((doc, idx) => (
                    <div key={doc._id || idx} className="am-doc-card">
                      <div className="am-wizard__grid">
                        <div className="am-field-wrap">
                          <label className="am-label">Type</label>
                          <select className="am-field" value={doc.type} onChange={(e) => updateDoc(idx, 'type', e.target.value)}>
                            {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="am-field-wrap">
                          <label className="am-label">Document name</label>
                          <input
                            className="am-field"
                            placeholder="e.g. Service Manual v2"
                            value={doc.name}
                            onChange={(e) => updateDoc(idx, 'name', e.target.value)}
                          />
                        </div>
                        <div className="am-field-wrap am-field-wrap--full">
                          <label className="am-label">Upload file</label>
                          <div className="am-upload">
                            <label className="am-upload__btn">
                              <Upload size={14} />
                              {doc.fileName || doc.data ? 'Replace file' : 'Choose file'}
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,image/*,application/pdf"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  onPickFile(idx, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <div className="am-upload__meta">
                              {doc.fileName || doc.data ? (
                                <>
                                  <span className="am-upload__name">{doc.fileName || 'File attached'}</span>
                                  {doc.size ? <span className="am-upload__size">{formatBytes(doc.size)}</span> : null}
                                  <button type="button" className="am-btn am-btn--ghost" onClick={() => viewDocument(doc)}>
                                    <Eye size={14} /> View
                                  </button>
                                </>
                              ) : (
                                <span className="am-upload__hint">PDF / image / Office — saved as base64 in DB</span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="am-icon-btn is-danger"
                              title="Remove document"
                              onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="am-wizard__nav">
                  <button type="button" className="am-btn am-btn--ghost" onClick={() => setFormTab('technical')}>← Technical</button>
                  <button type="submit" disabled={saveMut.isPending} className="am-btn am-btn--primary">
                    <Monitor size={14} />
                    {saveMut.isPending ? 'Saving…' : editAsset ? 'Update equipment' : 'Register equipment'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="am-wizard__footer">
            {editAsset && (
              <p className="am-wizard__meta">
                ID <strong>{editAsset.assetId}</strong>
                {editAsset.qrCode ? ` · QR ${editAsset.qrCode}` : ''}
              </p>
            )}
            <div className="am-wizard__footer-actions">
              <button type="button" onClick={closeForm} className="am-btn am-btn--ghost">Cancel</button>
              <button type="submit" disabled={saveMut.isPending} className="am-btn am-btn--primary">
                <Monitor size={14} />
                {saveMut.isPending ? 'Saving…' : editAsset ? 'Update equipment' : 'Register equipment'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!showDelete} onClose={() => setShowDelete(null)} title="Decommission Equipment" size="sm">
        <div className="am-confirm">
          <p>
            Mark <strong>{showDelete?.name}</strong>
            {showDelete?.assetId ? ` (${showDelete.assetId})` : ''} as decommissioned?
          </p>
          <div className="am-form__footer" style={{ borderTop: 'none', paddingTop: 0 }}>
            <button type="button" className="am-btn am-btn--ghost" onClick={() => setShowDelete(null)}>Cancel</button>
            <button
              type="button"
              className="am-btn am-btn--danger"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate(showDelete._id)}
            >
              {deleteMut.isPending ? 'Saving…' : 'Decommission'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DossierSection({ title, children }) {
  return (
    <div className="am-dossier__section">
      <h4 className="am-dossier__section-title">{title}</h4>
      {children}
    </div>
  );
}

function DossierGrid({ children }) {
  return <div className="am-dossier__grid">{children}</div>;
}

function DossierField({ label, value, mono, wide }) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className={`am-dossier__field${wide ? ' is-wide' : ''}`}>
      <span className="am-dossier__field-label">{label}</span>
      <span className={`am-dossier__field-value${mono ? ' is-mono' : ''}`}>{display}</span>
    </div>
  );
}

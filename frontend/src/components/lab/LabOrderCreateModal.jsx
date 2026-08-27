import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FlaskConical, Search } from 'lucide-react';
import api from '../../services/api';
import Modal from '../common/Modal';
import {
  LAB_TYPES,
  LAB_PROFILE_OPTIONS,
  LAB_PROFILES,
  OTHER_PROFILE,
  expandProfilesToTests,
  getProfileMeta,
  profilesForTypeWithOther,
  findMatchingProfile,
  buildOtherLabTests,
} from '../../constants/labProfiles';
import '../../styles/labOrder.css';

const emptyCustom = () => [{ testName: '', price: '' }];

/**
 * Corporate lab create / append modal.
 * - requestMode (Reception/Nurse/Doctor): pick lab type → packages
 * - fullMode (Lab Tech): full desk form
 * - appendTo: existing order → PUT add-tests (same Lab No.)
 */
export default function LabOrderCreateModal({
  isOpen,
  onClose,
  mode = 'full', // 'full' | 'request'
  appendTo = null,
  initialPatient = null,
  initialOpId = '',
  initialIpId = '',
  orderSource,
  onCreated,
}) {
  const qc = useQueryClient();
  const isAppend = !!appendTo;

  const [labType, setLabType] = useState('');
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [profilePrices, setProfilePrices] = useState({});
  const [customRows, setCustomRows] = useState(emptyCustom());
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [opRegistration, setOpRegistration] = useState('');
  const [ipAdmission, setIpAdmission] = useState('');
  const [sampleType, setSampleType] = useState('blood');
  const [priority, setPriority] = useState('routine');
  const [notes, setNotes] = useState('');

  const { data: priceList = [] } = useQuery({
    queryKey: ['test-master'],
    queryFn: () => api.get('/test-master').then((r) => r.data.data || []),
    staleTime: 60_000,
    enabled: isOpen,
  });

  const priceMap = useMemo(() => {
    const m = {};
    priceList.forEach((t) => { m[t.name] = t.price; });
    return m;
  }, [priceList]);

  useEffect(() => {
    if (!isOpen) return;
    setLabType('');
    setSelectedProfiles([]);
    setProfilePrices({});
    setCustomRows(emptyCustom());
    setSampleType('blood');
    setPriority('routine');
    setNotes('');
    if (isAppend && appendTo) {
      setPatientId(appendTo.patient?._id || appendTo.patient || '');
      setPatientSearch(appendTo.patient?.name
        ? `${appendTo.patient.name} (${appendTo.patient.patientId || ''})`
        : 'Patient');
      setOpRegistration(appendTo.opRegistration || '');
      setIpAdmission(appendTo.ipAdmission || '');
    } else if (initialPatient) {
      setPatientId(initialPatient._id);
      setPatientSearch(`${initialPatient.name} (${initialPatient.patientId || ''})`);
      setOpRegistration(initialOpId || '');
      setIpAdmission(initialIpId || '');
    } else {
      setPatientId('');
      setPatientSearch('');
      setOpRegistration(initialOpId || '');
      setIpAdmission(initialIpId || '');
    }
  }, [isOpen, mode, isAppend, appendTo, initialPatient, initialOpId, initialIpId]);

  useEffect(() => {
    if (patientSearch.trim().length < 2 || isAppend) { setPatients([]); return; }
    const t = setTimeout(() => {
      api.get(`/patients/search?q=${encodeURIComponent(patientSearch.trim())}`)
        .then((r) => setPatients(r.data.data || []))
        .catch(() => setPatients([]));
    }, 250);
    return () => clearTimeout(t);
  }, [patientSearch, isAppend]);

  const availableProfiles = useMemo(() => {
    if (labType === 'Other') return [OTHER_PROFILE];
    if (mode === 'request' && labType) return profilesForTypeWithOther(labType);
    return LAB_PROFILE_OPTIONS;
  }, [mode, labType]);

  const toggleProfile = (name) => {
    setSelectedProfiles((prev) => {
      const next = prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name];
      if (!prev.includes(name)) {
        setProfilePrices((prices) => ({
          ...prices,
          [name]: prices[name] ?? priceMap[name] ?? '',
        }));
        const meta = getProfileMeta(name);
        if (meta.sampleType) setSampleType(meta.sampleType);
        if (!labType && meta.labType) setLabType(meta.labType);
      }
      return next;
    });
  };

  const otherEnabled = selectedProfiles.includes(OTHER_PROFILE) || labType === 'Other';

  const otherBuilt = useMemo(
    () => customRows
      .filter((r) => r.testName.trim())
      .map((r) => buildOtherLabTests(r.testName, r.price, { priceMap, testMaster: priceList })),
    [customRows, priceMap, priceList],
  );

  const { tests, totalAmount } = useMemo(() => {
    const matchedFromOther = otherEnabled
      ? otherBuilt.filter((b) => b.matched).map((b) => b.profileName)
      : [];
    const catalogProfiles = selectedProfiles.filter((p) => p !== OTHER_PROFILE);
    const prices = { ...profilePrices };
    if (otherEnabled) {
      customRows.forEach((row) => {
        const built = buildOtherLabTests(row.testName, row.price, { priceMap, testMaster: priceList });
        if (built.matched) {
          prices[built.profileName] = Number(row.price) || prices[built.profileName] || built.totalAmount;
        }
      });
    }
    const expanded = expandProfilesToTests(
      [...new Set([...catalogProfiles, ...matchedFromOther])],
      prices,
    );
    let testsOut = expanded.tests;
    let total = expanded.totalAmount;
    if (otherEnabled) {
      otherBuilt.filter((b) => !b.matched).forEach((b) => {
        testsOut = [...testsOut, ...b.tests];
        total += b.totalAmount;
      });
    }
    return { tests: testsOut, totalAmount: total };
  }, [selectedProfiles, profilePrices, customRows, otherEnabled, otherBuilt, priceMap, priceList]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!isAppend && !patientId) throw new Error('Select a patient');
      if (!tests.length) throw new Error('Select at least one lab package or Other lab');
      const namedOther = customRows.filter((r) => r.testName.trim());
      if (otherEnabled && namedOther.some((r) => r.price === '' || r.price == null)) {
        throw new Error('Enter the price for the Other lab');
      }

      const catalogProfiles = selectedProfiles.filter((p) => p !== OTHER_PROFILE);
      const matchedProfiles = otherEnabled
        ? otherBuilt.filter((b) => b.matched).map((b) => b.profileName)
        : [];
      const unmatched = otherEnabled ? otherBuilt.filter((b) => !b.matched) : [];
      const profiles = [...new Set([...catalogProfiles, ...matchedProfiles, ...unmatched.map((b) => b.profileName)])].filter(Boolean);
      const payload = {
        patient: patientId || appendTo?.patient?._id || appendTo?.patient,
        profiles,
        testProfile: profiles.join(' + ') || (otherEnabled ? 'Other' : ''),
        tests,
        totalAmount,
        sampleType,
        priority,
        notes: notes || undefined,
        labType: labType || getProfileMeta(profiles[0] || '')?.labType || 'Other',
        opRegistration: opRegistration || undefined,
        ipAdmission: ipAdmission || undefined,
        orderSource: orderSource || undefined,
      };

      if (isAppend) {
        return api.put(`/lab/${appendTo._id}/add-tests`, {
          profiles,
          tests,
          totalAmount,
          notes: notes || undefined,
        });
      }
      return api.post('/lab', payload);
    },
    onSuccess: (res) => {
      toast.success(isAppend ? 'Tests added to same lab order' : 'Lab order created');
      qc.invalidateQueries(['labTests']);
      qc.invalidateQueries(['labDash']);
      qc.invalidateQueries(['ip-admission']);
      onCreated?.(res.data.data, { appended: isAppend });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Failed'),
  });

  const title = isAppend
    ? `Add tests — ${appendTo?.labNumber || 'same order'}`
    : mode === 'request'
      ? 'Request Lab Order'
      : 'New Lab Order';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={isAppend
        ? 'Adds to the same Lab No. — does not create a new order'
        : mode === 'request'
          ? 'Pick lab type, then packages — one Lab No. for this request'
          : 'Full lab desk format — multiple packages stay on one Lab No.'}
      size="lg"
    >
      <div className="lo-form">
        <div className="lo-body">
          {/* Patient */}
          {!isAppend && (
            <div className="lo-section">
              <div className="lo-section__head">
                <span className="lo-section__title">Patient</span>
              </div>
              <div className="lo-section__body">
                <label className="lo-label">Search patient *</label>
                <div className="lo-search">
                  <Search size={14} className="lo-search__icon" />
                  <input
                    className="lo-field lo-search__input"
                    value={patientSearch}
                    onChange={(e) => { setPatientSearch(e.target.value); setPatientId(''); }}
                    placeholder="Name or UHID"
                  />
                </div>
                {patients.length > 0 && !patientId && (
                  <ul className="lo-suggest">
                    {patients.map((p) => (
                      <li key={p._id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPatientId(p._id);
                            setPatientSearch(`${p.name} (${p.patientId})`);
                            setPatients([]);
                            if (p.activeAdmission?._id) setIpAdmission(p.activeAdmission._id);
                          }}
                        >
                          <strong>{p.name}</strong>
                          <span>{p.patientId} · {p.age}/{p.gender}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {patientId && <p className="lo-hint-ok">Patient selected</p>}
              </div>
            </div>
          )}

          {/* Type step for request mode */}
          {mode === 'request' && !isAppend && (
            <div className="lo-section">
              <div className="lo-section__head">
                <span className="lo-section__title">1 · Lab type</span>
                <span className="lo-section__meta">What kind of lab?</span>
              </div>
              <div className="lo-section__body">
                <div className="lo-type-grid">
                  {LAB_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`lo-type-chip ${labType === t ? 'is-active' : ''}`}
                      onClick={() => {
                        setLabType(t);
                        setSelectedProfiles(t === 'Other' ? [OTHER_PROFILE] : []);
                        if (t === 'Other') setCustomRows(emptyCustom());
                      }}
                    >
                      <FlaskConical size={14} />
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Packages */}
          {(mode === 'full' || labType || isAppend) && (
            <div className="lo-section">
              <div className="lo-section__head">
                <span className="lo-section__title">
                  {labType === 'Other' ? '2 · Other lab' : mode === 'request' ? '2 · Packages' : 'Lab packages'}
                </span>
                <span className="lo-section__meta">{selectedProfiles.length} selected</span>
              </div>
              <div className="lo-section__body">
                {mode === 'full' && (
                  <div className="lo-type-row">
                    <button
                      type="button"
                      className={`lo-type-chip sm ${!labType ? 'is-active' : ''}`}
                      onClick={() => setLabType('')}
                    >
                      All
                    </button>
                    {LAB_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`lo-type-chip sm ${labType === t ? 'is-active' : ''}`}
                        onClick={() => {
                          const next = labType === t ? '' : t;
                          setLabType(next);
                          if (next === 'Other') setSelectedProfiles((prev) => (
                            prev.includes(OTHER_PROFILE) ? prev : [...prev, OTHER_PROFILE]
                          ));
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {labType !== 'Other' && (
                <div className="lo-profiles">
                  {(labType ? availableProfiles : LAB_PROFILE_OPTIONS)
                    .filter((name) => name !== OTHER_PROFILE)
                    .map((name) => {
                    const checked = selectedProfiles.includes(name);
                    const meta = LAB_PROFILES[name];
                    const count = meta?.tests?.length || 0;
                    return (
                      <label key={name} className={`lo-profile ${checked ? 'is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProfile(name)}
                        />
                        <span className="lo-profile__body">
                          <span className="lo-profile__name">{name}</span>
                          <span className="lo-profile__meta">
                            {meta?.labType || '—'}
                            {count ? ` · ${count} params` : ''}
                          </span>
                        </span>
                        {checked && (
                          <span className="lo-profile__price">
                            ₹
                            <input
                              type="number"
                              min="0"
                              value={profilePrices[name] ?? ''}
                              onChange={(e) => setProfilePrices({ ...profilePrices, [name]: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                )}

                <label className={`lo-profile lo-other-toggle ${otherEnabled ? 'is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={otherEnabled}
                    onChange={() => {
                      if (labType === 'Other') return;
                      toggleProfile(OTHER_PROFILE);
                    }}
                  />
                  <span className="lo-profile__body">
                    <span className="lo-profile__name">Other</span>
                    <span className="lo-profile__meta">Lab not in the list — type name and price, report format fills in automatically</span>
                  </span>
                </label>

                {otherEnabled && (
                  <div className="lo-custom">
                    {customRows.map((row, i) => {
                      const built = row.testName.trim()
                        ? buildOtherLabTests(row.testName, row.price, { priceMap, testMaster: priceList })
                        : null;
                      return (
                        <div key={i} className="lo-other-card">
                          <div className="lo-custom__row lo-custom__row--other">
                            <input
                              className="lo-field"
                              placeholder="Lab / test name"
                              value={row.testName}
                              onChange={(e) => {
                                const value = e.target.value;
                                const next = [...customRows];
                                const match = findMatchingProfile(value);
                                const master = priceList.find((t) => String(t.name).toLowerCase() === value.trim().toLowerCase());
                                const autoPrice = match ? priceMap[match] : master?.price;
                                const priceEmpty = next[i].price === '' || next[i].price == null;
                                next[i] = {
                                  ...next[i],
                                  testName: value,
                                  price: priceEmpty && autoPrice != null && autoPrice !== '' ? autoPrice : next[i].price,
                                };
                                setCustomRows(next);
                              }}
                            />
                            <input
                              className="lo-field"
                              type="number"
                              min="0"
                              placeholder="Price ₹"
                              value={row.price}
                              onChange={(e) => {
                                const next = [...customRows];
                                next[i] = { ...next[i], price: e.target.value };
                                setCustomRows(next);
                              }}
                            />
                          </div>
                          {built?.tests?.length > 0 && (
                            <div className="lo-format">
                              <p className="lo-format__title">
                                Report format
                                {built.matched ? ` · matched ${built.profileName}` : ' · auto'}
                              </p>
                              <ul>
                                {built.tests.map((t) => (
                                  <li key={`${t.profileName}-${t.testName}`}>
                                    <strong>{t.testName}</strong>
                                    {(t.unit || t.normalRange) && (
                                      <span>
                                        {[t.unit, t.normalRange].filter(Boolean).join(' · ')}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="lo-link-btn"
                      onClick={() => setCustomRows([...customRows, { testName: '', price: '' }])}
                    >
                      + Add another other lab
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="lo-section">
            <div className="lo-section__head">
              <span className="lo-section__title">Order details</span>
            </div>
            <div className="lo-section__body lo-details-grid">
              <div>
                <label className="lo-label">Sample</label>
                <select className="lo-field" value={sampleType} onChange={(e) => setSampleType(e.target.value)}>
                  {['blood', 'urine', 'stool', 'swab', 'sputum', 'tissue', 'other'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lo-label">Priority</label>
                <select className="lo-field" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT</option>
                </select>
              </div>
              <div className="lo-span-2">
                <label className="lo-label">Notes</label>
                <input className="lo-field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional clinical note" />
              </div>
            </div>
          </div>
        </div>

        <div className="lo-footer">
          <div className="lo-footer__total">
            Est. total <strong>₹{Number(totalAmount || 0).toFixed(0)}</strong>
            <span>· {tests.length} parameter{tests.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="lo-footer__actions">
            <button type="button" className="lo-btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="lo-btn lo-btn--primary"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending
                ? 'Saving…'
                : isAppend
                  ? 'Add to same order'
                  : 'Create lab order'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

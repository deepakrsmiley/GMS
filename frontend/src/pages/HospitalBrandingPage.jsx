import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Upload, Save, ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useBranding, useBrandingMutation } from '../hooks/useBranding';
import '../styles/hospitalBranding.css';

export default function HospitalBrandingPage() {
  const { branding, isLoading } = useBranding();
  const updateMut = useBrandingMutation();
  const fileRef = useRef(null);
  const [logoPreview, setLogoPreview] = useState('');
  const { register, handleSubmit, reset, setValue, watch } = useForm();

  useEffect(() => {
    if (branding) {
      reset({
        hospitalName: branding.hospitalName,
        tagline: branding.tagline,
        address: branding.address,
        phone: branding.phone,
        email: branding.email,
        website: branding.website,
        gstNumber: branding.gstNumber,
        nabhAccreditation: branding.nabhAccreditation,
        nablAccreditation: branding.nablAccreditation,
        primaryColor: branding.primaryColor || '#4338ca',
        invoiceTerms: branding.invoiceTerms,
        paymentUrl: branding.paymentUrl,
        footerNote: branding.footerNote,
        bankName: branding.bankName,
        bankBranch: branding.bankBranch,
        bankAccount: branding.bankAccount,
        bankIfsc: branding.bankIfsc,
        upiId: branding.upiId,
      });
      setLogoPreview(branding.logo || '');
    }
  }, [branding, reset]);

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setLogoPreview(dataUrl);
      setValue('logo', dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = (data) => {
    updateMut.mutate({ ...data, logo: logoPreview });
  };

  const name = watch('hospitalName');
  const tagline = watch('tagline');
  const address = watch('address');
  const phone = watch('phone');
  const gstNumber = watch('gstNumber');
  const nabh = watch('nabhAccreditation');
  const primaryColor = watch('primaryColor') || '#4338ca';
  const footerNote = watch('footerNote');
  const bankName = watch('bankName');
  const bankBranch = watch('bankBranch');
  const bankAccount = watch('bankAccount');
  const bankIfsc = watch('bankIfsc');
  const upiId = watch('upiId');

  if (isLoading) {
    return (
      <div className="hb-shell">
        <div className="hb-loading">
          <div className="hb-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="hb-shell">
      <div className="hb-head">
        <div>
          <p className="hb-head__eyebrow">Institutional identity</p>
          <h2 className="hb-head__title">Hospital Branding</h2>
          <p className="hb-head__sub">
            This identity belongs to the client hospital, not to GMS.
            Sri Sanjeevi bills keep the Sri Sanjeevi name.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="hb-layout">
        <div className="hb-form">
          <section className="hb-section">
            <div className="hb-section__head">
              <h3 className="hb-section__title">Logo</h3>
              <span className="hb-section__meta">PNG / JPG / SVG · max 2MB</span>
            </div>
            <div className="hb-section__body">
              <div className="hb-logo-row">
                <div className="hb-logo-box">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" />
                  ) : (
                    <ImageIcon size={28} color="#94a3b8" />
                  )}
                </div>
                <div className="hb-logo-actions">
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                  <button type="button" className="hb-btn hb-btn--ghost" onClick={() => fileRef.current?.click()}>
                    <Upload size={14} /> Upload logo
                  </button>
                  <p className="hb-hint">Recommended 200×200px. Used on invoices and printouts.</p>
                  {logoPreview && (
                    <button
                      type="button"
                      className="hb-btn--link"
                      onClick={() => { setLogoPreview(''); setValue('logo', ''); }}
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="hb-section">
            <div className="hb-section__head">
              <h3 className="hb-section__title">Hospital profile</h3>
            </div>
            <div className="hb-section__body hb-grid">
              <div>
                <label className="hb-label">Hospital name *</label>
                <input {...register('hospitalName', { required: true })} className="hb-field" placeholder="Your Hospital Name" />
              </div>
              <div>
                <label className="hb-label">Tagline</label>
                <input {...register('tagline')} className="hb-field" placeholder="Healthcare Excellence" />
              </div>
              <div className="hb-span-2">
                <label className="hb-label">Address</label>
                <textarea {...register('address')} rows={2} className="hb-field" placeholder="Hospital address" style={{ resize: 'none' }} />
              </div>
              <div>
                <label className="hb-label">Phone</label>
                <input {...register('phone')} className="hb-field" placeholder="+91-XXXXXXXXXX" />
              </div>
              <div>
                <label className="hb-label">Email</label>
                <input {...register('email')} type="email" className="hb-field" placeholder="info@hospital.com" />
              </div>
              <div>
                <label className="hb-label">Website</label>
                <input {...register('website')} className="hb-field" placeholder="https://www.hospital.com" />
              </div>
              <div>
                <label className="hb-label">GST number</label>
                <input {...register('gstNumber')} className="hb-field" placeholder="22AAAAA0000A1Z5" />
              </div>
              <div>
                <label className="hb-label">NABH accreditation</label>
                <input {...register('nabhAccreditation')} className="hb-field" placeholder="Certificate no." />
              </div>
              <div>
                <label className="hb-label">NABL accreditation</label>
                <input {...register('nablAccreditation')} className="hb-field" placeholder="Certificate no." />
              </div>
            </div>
          </section>

          <section className="hb-section">
            <div className="hb-section__head">
              <h3 className="hb-section__title">Brand &amp; invoice copy</h3>
            </div>
            <div className="hb-section__body hb-grid">
              <div>
                <label className="hb-label">Brand colour</label>
                <div className="hb-color-row">
                  <input {...register('primaryColor')} type="color" />
                  <input
                    type="text"
                    className="hb-field"
                    value={primaryColor}
                    onChange={(e) => setValue('primaryColor', e.target.value)}
                    placeholder="#4338ca"
                  />
                </div>
              </div>
              <div>
                <label className="hb-label">Online payment URL</label>
                <input {...register('paymentUrl')} className="hb-field" placeholder="https://pay.hospital.com/..." />
              </div>
              <div className="hb-span-2">
                <label className="hb-label">Invoice footer message</label>
                <input {...register('footerNote')} className="hb-field" placeholder="Thank you for choosing our hospital." />
              </div>
              <div className="hb-span-2">
                <label className="hb-label">Invoice terms &amp; conditions</label>
                <textarea {...register('invoiceTerms')} rows={3} className="hb-field" placeholder="Payment terms, refund policy..." style={{ resize: 'none' }} />
              </div>
            </div>
          </section>

          <section className="hb-section">
            <div className="hb-section__head">
              <h3 className="hb-section__title">Bank details</h3>
              <span className="hb-section__meta">Shown on invoice</span>
            </div>
            <div className="hb-section__body hb-grid">
              <div>
                <label className="hb-label">Bank name</label>
                <input {...register('bankName')} className="hb-field" placeholder="e.g. State Bank of India" />
              </div>
              <div>
                <label className="hb-label">Branch</label>
                <input {...register('bankBranch')} className="hb-field" placeholder="e.g. Anna Nagar Branch" />
              </div>
              <div>
                <label className="hb-label">Account number</label>
                <input {...register('bankAccount')} className="hb-field" placeholder="e.g. 1234567890" />
              </div>
              <div>
                <label className="hb-label">IFSC code</label>
                <input {...register('bankIfsc')} className="hb-field" placeholder="e.g. SBIN0001234" />
              </div>
              <div className="hb-span-2">
                <label className="hb-label">UPI ID</label>
                <input {...register('upiId')} className="hb-field" placeholder="e.g. hospital@upi" />
              </div>
            </div>
          </section>

          <div className="hb-footer">
            <button type="submit" disabled={updateMut.isPending} className="hb-btn hb-btn--primary">
              <Save size={14} />
              {updateMut.isPending ? 'Saving…' : 'Save branding'}
            </button>
          </div>
        </div>

        <aside className="hb-preview">
          <div className="hb-preview__head">Invoice header preview</div>
          <div className="hb-preview__banner" style={{ background: primaryColor }}>
            {logoPreview && <img src={logoPreview} alt="Preview" className="hb-preview__logo" />}
            <div>
              <p className="hb-preview__name">{name || 'Your Hospital Name'}</p>
              <p className="hb-preview__tag">{tagline || 'Healthcare Excellence'}</p>
              {address && <p className="hb-preview__meta">{address}</p>}
              <p className="hb-preview__meta">
                {[
                  phone && `Ph: ${phone}`,
                  gstNumber && `GST: ${gstNumber}`,
                  nabh && `NABH: ${nabh}`,
                ].filter(Boolean).join(' · ') || 'Contact details appear here'}
              </p>
            </div>
          </div>
          <div className="hb-preview__footer">
            {footerNote || 'Thank you for choosing our hospital.'}
          </div>
          {(bankName || bankAccount || upiId) && (
            <div className="hb-preview__bank">
              <p className="hb-preview__bank-title">Bank / UPI</p>
              {bankName && <p><strong>{bankName}</strong>{bankBranch ? ` · ${bankBranch}` : ''}</p>}
              {bankAccount && <p>A/C {bankAccount}{bankIfsc ? ` · ${bankIfsc}` : ''}</p>}
              {upiId && <p>UPI {upiId}</p>}
            </div>
          )}
        </aside>
      </form>
    </div>
  );
}

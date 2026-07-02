import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Building2, Upload, Save, ImageIcon } from 'lucide-react';
import { useBranding, useBrandingMutation } from '../hooks/useBranding';

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
        primaryColor: branding.primaryColor || '#1e40af',
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
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) return;

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Building2 size={22} className="text-blue-600" />
          Hospital Branding
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure your hospital profile. Branding appears on bills, reports, prescriptions, and PDFs.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-6 space-y-6">
          {/* Logo upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Hospital Logo</label>
            <div className="flex items-start gap-5">
              <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-900">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain p-2" />
                ) : (
                  <ImageIcon size={32} className="text-gray-300" />
                )}
              </div>
              <div className="space-y-2">
                <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn-secondary text-sm"
                >
                  <Upload size={16} /> Upload Logo
                </button>
                <p className="text-xs text-gray-500">PNG, JPG or SVG. Max 2MB. Recommended: 200×200px.</p>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={() => { setLogoPreview(''); setValue('logo', ''); }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hospital Name *</label>
              <input {...register('hospitalName', { required: true })} className="input-field" placeholder="Your Hospital Name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hospital Tagline</label>
              <input {...register('tagline')} className="input-field" placeholder="Healthcare Excellence" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <textarea {...register('address')} rows={2} className="input-field resize-none" placeholder="Hospital address" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
              <input {...register('phone')} className="input-field" placeholder="+91-XXXXXXXXXX" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input {...register('email')} type="email" className="input-field" placeholder="info@hospital.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website</label>
              <input {...register('website')} className="input-field" placeholder="https://www.hospital.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GST Number</label>
              <input {...register('gstNumber')} className="input-field" placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NABH Accreditation (optional)</label>
              <input {...register('nabhAccreditation')} className="input-field" placeholder="NABH Certificate No." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NABL Accreditation (optional)</label>
              <input {...register('nablAccreditation')} className="input-field" placeholder="NABL Certificate No." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Brand Color</label>
              <input {...register('primaryColor')} type="color" className="input-field h-10 p-1 w-full cursor-pointer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Online Payment URL (QR)</label>
              <input {...register('paymentUrl')} className="input-field" placeholder="https://pay.hospital.com/..." />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Footer Message</label>
              <input {...register('footerNote')} className="input-field" placeholder="Thank you for choosing our hospital." />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice Terms &amp; Conditions</label>
              <textarea {...register('invoiceTerms')} rows={3} className="input-field resize-none" placeholder="Payment terms, refund policy..." />
            </div>
          </div>

          {/* Bank Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-600 rounded-full inline-block" />
              Bank Details (shown on invoice)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Name</label>
                <input {...register('bankName')} className="input-field" placeholder="e.g. State Bank of India" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch</label>
                <input {...register('bankBranch')} className="input-field" placeholder="e.g. Anna Nagar Branch" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Number</label>
                <input {...register('bankAccount')} className="input-field" placeholder="e.g. 1234567890" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IFSC Code</label>
                <input {...register('bankIfsc')} className="input-field" placeholder="e.g. SBIN0001234" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">UPI ID</label>
                <input {...register('upiId')} className="input-field" placeholder="e.g. hospital@upi" />
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-900">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 pt-4 mb-2">Invoice Header Preview</p>
            <div
              className="px-5 py-4 text-white flex gap-4 items-start"
              style={{ background: watch('primaryColor') || '#1e40af' }}
            >
              {logoPreview && (
                <img src={logoPreview} alt="Preview" className="w-12 h-12 object-contain bg-white rounded-lg p-1" />
              )}
              <div>
                <p className="text-base font-bold">{watch('hospitalName') || 'Your Hospital Name'}</p>
                <p className="text-xs italic opacity-90">{watch('tagline') || 'Healthcare Excellence'}</p>
                {watch('address') && <p className="text-[10px] opacity-85 mt-1">{watch('address')}</p>}
                <p className="text-[10px] opacity-85 mt-0.5">
                  {[
                    watch('phone') && `Ph: ${watch('phone')}`,
                    watch('gstNumber') && `GST: ${watch('gstNumber')}`,
                    watch('nabhAccreditation') && `NABH: ${watch('nabhAccreditation')}`,
                  ].filter(Boolean).join(' | ')}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 px-5 py-3">{watch('footerNote') || 'Thank you for choosing our hospital.'}</p>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button type="submit" disabled={updateMut.isPending} className="btn-primary">
            <Save size={16} />
            {updateMut.isPending ? 'Saving...' : 'Save Branding'}
          </button>
        </div>
      </form>
    </div>
  );
}
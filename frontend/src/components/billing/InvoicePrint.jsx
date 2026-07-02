import React from 'react';
import { Printer, X } from 'lucide-react';
import { useBranding } from '../../hooks/useBranding';

/* ─── formatters ─────────────────────────────────────── */
const fmt2 = (n) => Number(n || 0).toFixed(2);
const fmtINR = (n) =>
  `₹ ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return 'N/A';
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const mon = dt.toLocaleString('en-IN', { month: 'short' });
  return `${day}-${mon}-${dt.getFullYear()}`;
};
const fmtMonthYear = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  return dt.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
};

/* ─── number to words ────────────────────────────────── */
const ones = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE',
  'TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
const tens_ = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
function conv(n) {
  if (n < 20) return ones[n];
  if (n < 100) return tens_[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
  if (n < 1000) return ones[Math.floor(n/100)]+' HUNDRED'+(n%100?' '+conv(n%100):'');
  if (n < 100000) return conv(Math.floor(n/1000))+' THOUSAND'+(n%1000?' '+conv(n%1000):'');
  if (n < 10000000) return conv(Math.floor(n/100000))+' LAKH'+(n%100000?' '+conv(n%100000):'');
  return conv(Math.floor(n/10000000))+' CRORE'+(n%10000000?' '+conv(n%10000000):'');
}
function numberToWords(num) {
  if (!num || isNaN(num)) return 'ZERO RUPEES ONLY';
  const r = Math.floor(num);
  const p = Math.round((num - r) * 100);
  return conv(r)+' RUPEES'+(p>0?' AND '+conv(p)+' PAISA':'')+' ONLY';
}

/* ─── shared cell styles ─────────────────────────────── */
const TH = {
  padding:'8px 6px', textAlign:'center', fontSize:10,
  border:'1px solid rgba(255,255,255,0.3)', fontWeight:600, lineHeight:1.4,
  whiteSpace:'nowrap', letterSpacing:'0.3px',
};
const TD  = { padding:'6px 7px', border:'1px solid #e0e0e0', verticalAlign:'middle', lineHeight:1.4, fontSize:'10.5px' };
const TDc = { ...TD, textAlign:'center' };
const TDr = { ...TD, textAlign:'right', fontFamily:"'Courier New', monospace"  };
const TH2 = { padding:'6px 8px', border:'1px solid #d0d0d0', fontWeight:600, fontSize:'10.5px', letterSpacing:'0.2px' };
const TD2 = { padding:'6px 8px', border:'1px solid #e0e0e0', fontSize:'10.5px' };

/* ─── NORMALISE ─── */
function normalise(bill) {
  if (!bill) return null;

  const rawItems = bill.items || [];
  const items = rawItems.map((it) => ({
    medicineName : it.name || it.description || '-',
    genericName  : it.genericName || (it.medicine?.genericName) || '',
    batchNumber  : it.batchNumber || it.batch || '-',
    mfgDate      : it.mfgDate || null,
    expiryDate   : it.expiryDate || null,
    hsnCode      : it.hsnCode || '',
    quantity     : Number(it.quantity) || 1,
    unitOfMeasure: it.unitOfMeasure || 'Nos',
    mrp          : Number(it.mrp || it.unitPrice) || 0,
    unitPrice    : Number(it.unitPrice) || 0,
    discountPercent: Number(it.discountPercent) || 0,
    discountAmount : Number(it.discountAmount) || 0,
    gstPercent   : Number(it.gstPercent) || 0,
    gstAmount    : Number(it.gstAmount) || 0,
    isMedicine   : it.type === 'medicine' || it.category === 'Pharmacy',
  }));

  const subtotal     = items.reduce((s,i) => s + i.unitPrice * i.quantity, 0);
  const totalDiscount= items.reduce((s,i) => s + i.discountAmount, 0);
  const taxableValue = subtotal - totalDiscount;
  const totalGst     = items.reduce((s,i) => s + i.gstAmount, 0);
  const grandTotal   = Number(bill.totalAmount) || (taxableValue + totalGst);
  const totalQty     = items.reduce((s,i) => s + i.quantity, 0);

  const customerName = bill.patient?.name || 'Walk-in Customer';
  const patientId    = bill.patient?.patientId || '';
  const placeOfSupply= bill.placeOfSupply || '';
  const invoiceNo    = bill.billNumber || String(bill._id || '').slice(-6).toUpperCase();
  const invoiceDate  = bill.createdAt;
  const paidAmount   = Number(bill.paidAmount) || grandTotal;
  const dueAmount    = Number(bill.dueAmount) || 0;
  const hsnCodes     = [...new Set(items.map(i=>i.hsnCode).filter(Boolean))].join(', ');

  const gstMap = {};
  items.forEach(it => {
    const rate = it.gstPercent;
    if (!gstMap[rate]) gstMap[rate] = { taxable:0, gst:0 };
    gstMap[rate].taxable += it.unitPrice * it.quantity - it.discountAmount;
    gstMap[rate].gst += it.gstAmount;
  });

  return {
    items, subtotal, totalDiscount, taxableValue, totalGst,
    grandTotal, totalQty, customerName, patientId,
    placeOfSupply, invoiceNo, invoiceDate,
    paidAmount, dueAmount, hsnCodes, gstMap,
  };
}

/* ─── Helper: Get contrast text color ─── */
function getContrastColor(hexColor) {
  if (!hexColor) return '#ffffff';
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155 ? '#000000' : '#ffffff';
}

/* ─── MAIN COMPONENT ─────────────────────────────────── */
export default function InvoicePrint({ bill, onClose, onDownloadPdf, onDownloadThermal }) {
  const { branding } = useBranding();
  const data = normalise(bill);

  if (!data) return null;

  const primaryColor = branding.primaryColor || '#1a6b3c';
  const textColor = getContrastColor(primaryColor);
  const lightColor = primaryColor + '15';

  return (
    <>
      {/* ── Toolbar (hidden on print) ── */}
      <div style={{
        position:'fixed', top:0, left:0, right:0, zIndex:10001,
        background:primaryColor, display:'flex', gap:12,
        padding:'10px 20px', justifyContent:'flex-end',
        boxShadow:'0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <button onClick={() => window.print()} style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'8px 20px', background:'#fff', color:primaryColor,
          border:'none', borderRadius:6, fontWeight:600, fontSize:'13px', cursor:'pointer',
          fontFamily:"'Segoe UI', sans-serif", boxShadow:'0 1px 3px rgba(0,0,0,0.1)',
          transition:'all 0.2s',
        }}>
          <Printer size={16}/> Print
        </button>
        {onDownloadPdf && (
          <button onClick={() => onDownloadPdf(bill._id)} style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'8px 20px', background:lightColor, color:primaryColor,
            border:`1px solid ${primaryColor}`, borderRadius:6, fontWeight:600, fontSize:'13px', cursor:'pointer',
            fontFamily:"'Segoe UI', sans-serif", transition:'all 0.2s',
          }}>
            Download PDF
          </button>
        )}
        {onDownloadThermal && (
          <button onClick={() => onDownloadThermal(bill._id)} style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'8px 20px', background:lightColor, color:primaryColor,
            border:`1px solid ${primaryColor}`, borderRadius:6, fontWeight:600, fontSize:'13px', cursor:'pointer',
            fontFamily:"'Segoe UI', sans-serif", transition:'all 0.2s',
          }}>
            Thermal PDF
          </button>
        )}
        <button onClick={onClose} style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'8px 20px', background:'#f3f4f6', color:'#374151',
          border:'none', borderRadius:6, fontWeight:600, fontSize:'13px', cursor:'pointer',
          fontFamily:"'Segoe UI', sans-serif", boxShadow:'0 1px 3px rgba(0,0,0,0.1)',
          transition:'all 0.2s',
        }}>
          <X size={16}/> Close
        </button>
      </div>

      {/* ── Backdrop + scroll wrapper ── */}
      <div style={{
        position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,0.65)',
        overflowY:'auto', paddingTop:60, paddingBottom:40,
        display:'flex', justifyContent:'center',
        fontFamily:"'Segoe UI', 'Roboto', -apple-system, sans-serif",
      }}>
        {/* ══════════════ INVOICE ROOT ══════════════ */}
        <div id="invoice-print-root" style={{
          background:'#fff', width:794,
          fontFamily:"'Segoe UI', 'Roboto', -apple-system, sans-serif",
          fontSize:'11px', color:'#1f2937',
          border:`3px solid ${primaryColor}`, boxShadow:'0 8px 40px rgba(0,0,0,0.25)',
          borderRadius:'2px',
        }}>

          {/* ══ HEADER ══ */}
          <div style={{
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'16px 20px 12px', borderBottom:`3px solid ${primaryColor}`,
            background:'#fafbfc',
          }}>
            {/* Left */}
            <div style={{ display:'flex', gap:16, alignItems:'center', flex:1 }}>
              {branding.logo
                ? <img src={branding.logo} alt="" style={{ width:72, height:72, objectFit:'contain' }}/>
                : (
                  <div style={{
                    width:72, height:72, background:lightColor,
                    border:`2px solid ${primaryColor}`, borderRadius:8,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontWeight:800, fontSize:11, color:primaryColor, textAlign:'center',
                    fontFamily:"'Segoe UI', sans-serif",
                  }}>
                    {branding.hospitalName?.split(' ').slice(0, 2).join('\n') || 'MEDI\nCARE'}
                  </div>
                )
              }
              <div style={{ flex:1 }}>
                <div style={{ fontSize:28, fontWeight:800, color:primaryColor, lineHeight:1.1, letterSpacing:'-0.5px' }}>
                  {branding.hospitalName || 'Healthcare Center'}
                </div>
                <div style={{ fontSize:11, color:'#4b5563', marginTop:4, fontWeight:500 }}>
                  📍 {branding.address || '13 Health Street, Mumbai, Maharashtra, India'}
                </div>
                {branding.phone && (
                  <div style={{ fontSize:11, color:'#4b5563', fontWeight:500 }}>
                    📞 {branding.phone}
                  </div>
                )}
              </div>
            </div>

            {/* Right — Status badge */}
            <div style={{
              border:`2px solid ${primaryColor}`, borderRadius:8,
              padding:'12px 20px', textAlign:'center', minWidth:120,
              background:lightColor, marginLeft:20,
            }}>
              <div style={{ fontSize:13, fontWeight:700, color:primaryColor, whiteSpace:'nowrap', letterSpacing:'1px', textTransform:'uppercase' }}>
                {bill.status?.toUpperCase() || 'ISSUED'}
              </div>
            </div>
          </div>

          {/* ══ TAX INVOICE BAND ══ */}
          <div style={{
            textAlign:'center', padding:'8px 12px',
            borderBottom:'1px solid #d1d5db', background:'#fafbfc',
          }}>
            <div style={{
              fontSize:16, fontWeight:800, color:primaryColor,
              letterSpacing:'1px', textTransform:'uppercase',
            }}>
              TAX INVOICE
            </div>
          </div>

          {/* ══ CUSTOMER DETAIL + INVOICE META ══ */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid #d1d5db' }}>

            {/* Customer */}
            <div style={{ borderRight:'1px solid #d1d5db' }}>
              <div style={{
                background:primaryColor, color:textColor, fontWeight:700,
                fontSize:'12px', textAlign:'center', padding:'6px', letterSpacing:'0.3px',
              }}>PATIENT DETAILS</div>
              <div style={{ padding:'10px 12px' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10.5px' }}>
                  <tbody>
                    {/* ✅ KEEP: Patient Name */}
                    <tr style={{ borderBottom:'1px solid #f0f0f0' }}>
                      <td style={{ fontWeight:600, width:80, paddingBottom:6, paddingRight:10, color:'#4b5563', verticalAlign:'top' }}>Name</td>
                      <td style={{ paddingBottom:6, color:'#1f2937', fontWeight:500 }}>{data.customerName}</td>
                    </tr>
                    {/* ❌ REMOVED: Phone Number row */}
                    {/* ❌ REMOVED: Patient ID row */}
                    <tr>
                      <td style={{ fontWeight:600, paddingBottom:2, paddingRight:10, color:'#4b5563', verticalAlign:'top' }}>
                        Place of<br/>Supply
                      </td>
                      <td style={{ paddingBottom:2, color:'#1f2937', fontWeight:500 }}>
                        {data.placeOfSupply}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Invoice meta */}
            <div style={{ padding:'12px 14px' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10.5px' }}>
                <tbody>
                  {/* ✅ KEEP: Invoice No. and Date */}
                  <tr>
                    <td style={{ paddingBottom:8, color:'#4b5563', fontWeight:600 }}>Invoice No.</td>
                    <td style={{ fontWeight:700, fontSize:13, paddingBottom:8, textAlign:'center', color:primaryColor, fontFamily:"'Courier New', monospace" }}>
                      {data.invoiceNo}
                    </td>
                    <td style={{ paddingBottom:8, paddingLeft:12, color:'#4b5563', fontWeight:600 }}>Date</td>
                    <td style={{ fontWeight:600, paddingBottom:8, textAlign:'right', color:'#1f2937', fontFamily:"'Courier New', monospace" }}>
                      {fmtDate(data.invoiceDate)}
                    </td>
                  </tr>
                  {/* ❌ REMOVED: Payment Mode row */}
                </tbody>
              </table>
            </div>
          </div>

          {/* ══ ITEMS TABLE ══ */}
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10px', borderBottom:'1px solid #d1d5db' }}>
            <thead>
              <tr style={{ background:primaryColor, color:textColor }}>
                <th style={{ ...TH, width:'4%'  }}>Sr.</th>
                <th style={{ ...TH, width:'26%', textAlign:'left' }}>Description / Generic Name</th>
                <th style={{ ...TH, width:'8%'  }}>Batch No</th>
                <th style={{ ...TH, width:'7%'  }}>MFG Date</th>
                <th style={{ ...TH, width:'7%'  }}>Expiry</th>
                <th style={{ ...TH, width:'6%'  }}>HSN/SAC</th>
                <th style={{ ...TH, width:'7%'  }}>Qty</th>
                <th style={{ ...TH, width:'7%'  }}>MRP</th>
                <th style={{ ...TH, width:'7%'  }}>Rate</th>
                <th style={{ ...TH, width:'5%'  }}>GST%</th>
                <th style={{ ...TH, width:'5%'  }}>Disc%</th>
                <th style={{ ...TH, width:'11%', textAlign:'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => {
                const taxable = item.unitPrice * item.quantity - item.discountAmount;
                const withGst = taxable + item.gstAmount;
                return (
                  <tr key={i} style={{ background: i%2===0 ? '#fff' : '#f9fafb' }}>
                    <td style={TDc}>{i+1}</td>
                    <td style={{ ...TD, textAlign:'left' }}>
                      <div style={{ fontWeight:600, color:'#1f2937' }}>
                        {item.genericName || item.medicineName}
                      </div>
                    </td>
                    <td style={TDc}>{item.batchNumber}</td>
                    <td style={TDc}>{item.mfgDate ? fmtMonthYear(item.mfgDate) : '-'}</td>
                    <td style={TDc}>{item.expiryDate ? fmtMonthYear(item.expiryDate) : '-'}</td>
                    <td style={TDc}>{item.hsnCode || '-'}</td>
                    <td style={TDc}>{item.quantity} {item.unitOfMeasure}</td>
                    <td style={TDr}>{fmt2(item.mrp)}</td>
                    <td style={TDr}>{fmt2(item.unitPrice)}</td>
                    <td style={TDc}>{fmt2(item.gstPercent)}</td>
                    <td style={TDc}>{fmt2(item.discountPercent)}</td>
                    <td style={TDr}>{fmt2(withGst)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop:`2px solid ${primaryColor}`, fontWeight:700, background:'#f9fafb' }}>
                <td colSpan={6} style={{ ...TD, textAlign:'right', fontWeight:700, color:'#1f2937' }}>TOTAL</td>
                <td style={TDc} colSpan={5}></td>
                <td style={{ ...TDr, fontSize:12, fontWeight:800, color:primaryColor, background:lightColor }}>
                  {fmtINR(data.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* ══ TOTAL IN WORDS ══ */}
          <div style={{ padding:'10px 12px', borderBottom:'1px solid #d1d5db', background:'#f9fafb' }}>
            <span style={{ fontWeight:600, color:'#4b5563', fontSize:'11px', letterSpacing:'0.2px' }}>TOTAL IN WORDS</span>
            <div style={{ fontWeight:700, fontSize:'11.5px', marginTop:4, textTransform:'uppercase', color:'#1f2937', letterSpacing:'0.3px', fontFamily:"'Courier New', monospace" }}>
              {numberToWords(data.grandTotal)}
            </div>
          </div>

          {/* ══ SUMMARY TABLE ══ */}
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10.5px', borderBottom:'1px solid #d1d5db' }}>
            <thead>
              <tr style={{ background:'#f0f0f0' }}>
                <th style={{ ...TH2, textAlign:'left', width:'50%', color:'#374151' }}>Description</th>
                <th style={{ ...TH2, textAlign:'right', width:'15%', color:'#374151' }}>Amount</th>
                <th style={{ ...TH2, textAlign:'center', width:'15%', color:'#374151' }}>GST %</th>
                <th style={{ ...TH2, textAlign:'right', width:'20%', color:'#374151' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background:'#fff' }}>
                <td style={{ ...TD2, textAlign:'left', fontWeight:600, color:'#4b5563' }}>Subtotal</td>
                <td style={{ ...TD2, textAlign:'right', color:'#1f2937', fontWeight:600 }}>{fmt2(data.subtotal)}</td>
                <td style={{ ...TD2, textAlign:'center', color:'#6b7280' }}>—</td>
                <td style={{ ...TD2, textAlign:'right', color:'#1f2937', fontWeight:600 }}>{fmt2(data.subtotal)}</td>
              </tr>
              {data.totalDiscount > 0 && (
                <tr style={{ background:'#fef3c7' }}>
                  <td style={{ ...TD2, textAlign:'left', fontWeight:600, color:'#d97706' }}>Discount</td>
                  <td style={{ ...TD2, textAlign:'right', color:'#d97706', fontWeight:600 }}>−{fmt2(data.totalDiscount)}</td>
                  <td style={{ ...TD2, textAlign:'center', color:'#d97706' }}>—</td>
                  <td style={{ ...TD2, textAlign:'right', color:'#d97706', fontWeight:600 }}>−{fmt2(data.totalDiscount)}</td>
                </tr>
              )}
              <tr style={{ fontWeight:700, background:'#f0f0f0', borderTop:'1px solid #d1d5db', borderBottom:'1px solid #d1d5db' }}>
                <td style={{ ...TD2, textAlign:'left', fontWeight:700, color:'#1f2937' }}>Taxable Value</td>
                <td style={{ ...TD2, textAlign:'right', fontWeight:700, color:'#1f2937' }}>{fmt2(data.taxableValue)}</td>
                <td style={{ ...TD2, textAlign:'center', color:'#6b7280' }}>—</td>
                <td style={{ ...TD2, textAlign:'right', fontWeight:700, color:'#1f2937' }}>{fmt2(data.taxableValue)}</td>
              </tr>
              <tr style={{ background:'#fff' }}>
                <td style={{ ...TD2, textAlign:'left', color:'#4b5563', fontWeight:600 }}>IGST on Taxable</td>
                <td style={{ ...TD2, textAlign:'right', color:'#6b7280' }}>—</td>
                <td style={{ ...TD2, textAlign:'center', color:'#1f2937', fontWeight:600 }}>{Object.keys(data.gstMap).join('/')}</td>
                <td style={{ ...TD2, textAlign:'right', color:'#1f2937', fontWeight:600 }}>{fmt2(data.totalGst)}</td>
              </tr>
              <tr style={{ fontWeight:800, background:primaryColor, color:textColor }}>
                <td style={{ ...TD2, background:primaryColor, color:textColor, textAlign:'left', fontWeight:800 }}>GRAND TOTAL</td>
                <td style={{ ...TD2, background:primaryColor, color:textColor, textAlign:'right' }}>—</td>
                <td style={{ ...TD2, background:primaryColor, color:textColor, textAlign:'center' }}>—</td>
                <td style={{ ...TD2, background:primaryColor, color:textColor, textAlign:'right', fontWeight:800, fontSize:'12px' }}>{fmt2(data.grandTotal)}</td>
              </tr>
            </tbody>
          </table>

          {/* ══ AUTHORISED SIGNATORY + PATIENT SIGNATURE ══ */}
          {/* ❌ REMOVED: Bank Details section entirely */}
          {/* ❌ REMOVED: Terms & Conditions section entirely */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid #d1d5db' }}>

            {/* Authorised Signatory */}
            <div style={{
              borderRight:'1px solid #d1d5db',
              padding:'14px 16px',
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'space-between',
              textAlign:'center', minHeight:120,
            }}>
              <div style={{ fontSize:'10.5px', color:'#4b5563', lineHeight:1.7, fontWeight:500 }}>
                Certified that the particulars given above are<br/>true and correct.
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:'11.5px', color:primaryColor, marginTop:10, letterSpacing:'0.3px' }}>
                  For {branding.hospitalName || 'Healthcare Center'}
                </div>
                <div style={{
                  fontSize:'10.5px', color:'#4b5563', marginTop:38,
                  borderTop:`1px solid #d1d5db`, paddingTop:6, fontWeight:600,
                }}>
                  Authorised Signatory
                </div>
              </div>
            </div>

            {/* Patient Signature */}
            <div style={{
              display:'flex', flexDirection:'column',
              justifyContent:'flex-end', alignItems:'center', padding:'12px 16px',
              minHeight:120,
            }}>
              <div style={{
                fontSize:'10.5px', color:'#4b5563',
                borderTop:'1px solid #d1d5db', paddingTop:6,
                textAlign:'center', width:'75%', fontWeight:600,
              }}>
                Patient Signature
              </div>
            </div>
          </div>

          {/* ══ FOOTER ══ */}
          <div style={{
            textAlign:'center', padding:'10px 16px',
            fontSize:'11px', color:'#4b5563', background:'#f9fafb',
            borderTop:'1px solid #e5e7eb', fontStyle:'italic', fontWeight:500, letterSpacing:'0.2px',
          }}>
            {branding.footerNote || 'Thank you for choosing our hospital. We look forward to serving you again.'}
          </div>

        </div>{/* end invoice root */}
      </div>{/* end backdrop */}

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body * { visibility: hidden !important; }
          #invoice-print-root,
          #invoice-print-root * { visibility: visible !important; }
          #invoice-print-root {
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          #invoice-print-root, #invoice-print-root * {
            font-weight: 700 !important;
            color: #000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </>
  );
}
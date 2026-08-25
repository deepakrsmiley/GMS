import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';
import { useBranding } from '../../hooks/useBranding';
import { GmsDevelopedPrintLine } from '../branding/GmsDevelopedBar';

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
const fmtTime = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
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

/* ─── shared cell styles (regular weight, high contrast) ─ */
const TH = {
  padding:'9px 5px', textAlign:'center', fontSize:11.5,
  border:'1px solid rgba(255,255,255,0.35)', fontWeight:500, lineHeight:1.4,
  whiteSpace:'nowrap', letterSpacing:'0.15px',
};
const TD  = { padding:'8px 6px', border:'1px solid #d1d5db', verticalAlign:'middle', lineHeight:1.45, fontSize:'12.5px', fontWeight:400, color:'#111827' };
const TDc = { ...TD, textAlign:'center' };
const TDr = { ...TD, textAlign:'right', fontFamily:"'Courier New', monospace" };
const TH2 = { padding:'8px 8px', border:'1px solid #d1d5db', fontWeight:500, fontSize:'12.5px', letterSpacing:'0.15px', color:'#111827' };
const TD2 = { padding:'8px 8px', border:'1px solid #d1d5db', fontSize:'12.5px', fontWeight:400, color:'#111827' };

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
  const patientAge   = bill.patient?.age ?? '';
  const patientGender= bill.patient?.gender || '';
  const patientPhone = bill.patient?.phone || '';
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
    patientAge, patientGender, patientPhone,
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
export default function InvoicePrint({ bill, onClose, onDownloadPdf, onDownloadPdfA5, onDownloadThermal }) {
  const { branding } = useBranding();
  const data = normalise(bill);
  const [paperSize, setPaperSize] = useState('A4'); // A4 | A5

  if (!data) return null;

  const primaryColor = branding.primaryColor || '#1a6b3c';
  const textColor = getContrastColor(primaryColor);
  const lightColor = primaryColor + '15';
  const isA5 = paperSize === 'A5';
  const pageWidth = isA5 ? 560 : 794;
  const baseFont = isA5 ? 12.5 : 13.5;

  const toolbarBtn = (active) => ({
    display:'flex', alignItems:'center', gap:8,
    padding:'8px 14px',
    background: active ? '#fff' : lightColor,
    color: primaryColor,
    border: active ? '2px solid #fff' : `1px solid ${primaryColor}`,
    borderRadius:6, fontWeight:700, fontSize:'12px', cursor:'pointer',
    fontFamily:"'IBM Plex Sans', 'Segoe UI', sans-serif",
  });

  return (
    <>
      {/* ── Toolbar (hidden on print) ── */}
      <div style={{
        position:'fixed', top:0, left:0, right:0, zIndex:10001,
        background:primaryColor, display:'flex', gap:10, flexWrap:'wrap',
        padding:'10px 20px', justifyContent:'flex-end', alignItems:'center',
        boxShadow:'0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <span style={{ color:'#fff', fontSize:12, fontWeight:600, marginRight:'auto' }}>
          Paper size
        </span>
        <button type="button" onClick={() => setPaperSize('A4')} style={toolbarBtn(paperSize === 'A4')}>
          A4
        </button>
        <button type="button" onClick={() => setPaperSize('A5')} style={toolbarBtn(paperSize === 'A5')}>
          A5
        </button>
        <button type="button" onClick={() => window.print()} style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'8px 20px', background:'#fff', color:primaryColor,
          border:'none', borderRadius:6, fontWeight:600, fontSize:'13px', cursor:'pointer',
          fontFamily:"'IBM Plex Sans', 'Segoe UI', sans-serif", boxShadow:'0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <Printer size={16}/> Print {paperSize}
        </button>
        {onDownloadPdf && (
          <button type="button" onClick={() => onDownloadPdf(bill._id)} style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'8px 16px', background:lightColor, color:primaryColor,
            border:`1px solid ${primaryColor}`, borderRadius:6, fontWeight:600, fontSize:'12px', cursor:'pointer',
            fontFamily:"'IBM Plex Sans', 'Segoe UI', sans-serif",
          }}>
            PDF A4
          </button>
        )}
        {onDownloadPdfA5 && (
          <button type="button" onClick={() => onDownloadPdfA5(bill._id)} style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'8px 16px', background:lightColor, color:primaryColor,
            border:`1px solid ${primaryColor}`, borderRadius:6, fontWeight:600, fontSize:'12px', cursor:'pointer',
            fontFamily:"'IBM Plex Sans', 'Segoe UI', sans-serif",
          }}>
            PDF A5
          </button>
        )}
        {onDownloadThermal && (
          <button type="button" onClick={() => onDownloadThermal(bill._id)} style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'8px 16px', background:lightColor, color:primaryColor,
            border:`1px solid ${primaryColor}`, borderRadius:6, fontWeight:600, fontSize:'12px', cursor:'pointer',
            fontFamily:"'IBM Plex Sans', 'Segoe UI', sans-serif",
          }}>
            Thermal
          </button>
        )}
        <button type="button" onClick={onClose} style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'8px 16px', background:'#f3f4f6', color:'#374151',
          border:'none', borderRadius:6, fontWeight:600, fontSize:'13px', cursor:'pointer',
          fontFamily:"'IBM Plex Sans', 'Segoe UI', sans-serif",
        }}>
          <X size={16}/> Close
        </button>
      </div>

      {/* ── Backdrop + scroll wrapper ── */}
      <div id="invoice-print-backdrop" style={{
        position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,0.65)',
        overflowY:'auto', paddingTop:60, paddingBottom:40,
        display:'flex', justifyContent:'center',
        fontFamily:"'IBM Plex Sans', 'Segoe UI', sans-serif",
      }}>
        {/* ══════════════ INVOICE ROOT ══════════════ */}
        <div id="invoice-print-root" data-paper={paperSize} style={{
          background:'#fff', width:pageWidth,
          fontFamily:"'IBM Plex Sans', 'Segoe UI', sans-serif",
          fontSize:`${baseFont}px`, color:'#111827', fontWeight:400,
          border:`2px solid ${primaryColor}`, boxShadow:'0 8px 40px rgba(0,0,0,0.25)',
          borderRadius:'2px',
        }}>

          {/* ══ HEADER ══ */}
          <div style={{
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'16px 20px 12px', borderBottom:`2px solid ${primaryColor}`,
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
                    fontWeight:400, fontSize:11, color:primaryColor, textAlign:'center',
                    fontFamily:"'Segoe UI', sans-serif",
                  }}>
                    {branding.hospitalName?.split(' ').slice(0, 2).join('\n') || 'MEDI\nCARE'}
                  </div>
                )
              }
              <div style={{ flex:1 }}>
                <GmsDevelopedPrintLine />
                <div style={{ fontSize:24, fontWeight:500, color:primaryColor, lineHeight:1.1, letterSpacing:'-0.5px' }}>
                  {branding.hospitalName || 'Healthcare Center'}
                </div>
                <div style={{ fontSize:12, color:'#374151', marginTop:4, fontWeight:400 }}>
                  📍 {branding.address || '13 Health Street, Mumbai, Maharashtra, India'}
                </div>
                {branding.phone && (
                  <div style={{ fontSize:12, color:'#374151', fontWeight:400 }}>
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
              <div style={{ fontSize:13, fontWeight:400, color:primaryColor, whiteSpace:'nowrap', letterSpacing:'1px', textTransform:'uppercase' }}>
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
              fontSize:15, fontWeight:500, color:primaryColor,
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
                background:primaryColor, color:textColor, fontWeight:400,
                fontSize:'12px', textAlign:'center', padding:'6px', letterSpacing:'0.3px',
              }}>PATIENT DETAILS</div>
              <div style={{ padding:'10px 12px' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize: isA5 ? '12px' : '13px' }}>
                  <tbody>
                    <tr style={{ borderBottom:'1px solid #f0f0f0' }}>
                      <td style={{ fontWeight:400, width:88, paddingBottom:6, paddingRight:10, color:'#374151', verticalAlign:'top' }}>Name</td>
                      <td style={{ paddingBottom:6, color:'#111827', fontWeight:400 }}>{data.customerName}</td>
                    </tr>
                    <tr style={{ borderBottom:'1px solid #f0f0f0' }}>
                      <td style={{ fontWeight:400, width:88, paddingBottom:6, paddingRight:10, color:'#374151', verticalAlign:'top' }}>UHID</td>
                      <td style={{ paddingBottom:6, color:'#111827', fontWeight:400, fontFamily:"'Courier New', monospace" }}>
                        {data.patientId || '—'}
                      </td>
                    </tr>
                    <tr style={{ borderBottom:'1px solid #f0f0f0' }}>
                      <td style={{ fontWeight:400, width:88, paddingBottom:6, paddingRight:10, color:'#374151', verticalAlign:'top' }}>Age / Sex</td>
                      <td style={{ paddingBottom:6, color:'#111827', fontWeight:400 }}>
                        {data.patientAge !== '' && data.patientAge != null ? data.patientAge : '—'}
                        {data.patientGender ? ` / ${data.patientGender}` : ''}
                      </td>
                    </tr>
                    <tr style={{ borderBottom:'1px solid #f0f0f0' }}>
                      <td style={{ fontWeight:400, width:88, paddingBottom:6, paddingRight:10, color:'#374151', verticalAlign:'top' }}>Phone</td>
                      <td style={{ paddingBottom:6, color:'#111827', fontWeight:400 }}>
                        {data.patientPhone || '—'}
                      </td>
                    </tr>
                    {data.placeOfSupply ? (
                      <tr>
                        <td style={{ fontWeight:400, paddingBottom:2, paddingRight:10, color:'#374151', verticalAlign:'top' }}>
                          Place of Supply
                        </td>
                        <td style={{ paddingBottom:2, color:'#111827', fontWeight:400 }}>
                          {data.placeOfSupply}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Invoice meta */}
            <div style={{ padding:'12px 14px' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize: isA5 ? '12px' : '13px' }}>
                <tbody>
                  <tr>
                    <td style={{ paddingBottom:6, color:'#374151', fontWeight:400 }}>Invoice No.</td>
                    <td style={{ fontWeight:400, fontSize:14, paddingBottom:6, textAlign:'right', color:primaryColor, fontFamily:"'Courier New', monospace" }}>
                      {data.invoiceNo}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingBottom:6, color:'#374151', fontWeight:400 }}>Date</td>
                    <td style={{ fontWeight:400, paddingBottom:6, textAlign:'right', color:'#111827', fontFamily:"'Courier New', monospace" }}>
                      {fmtDate(data.invoiceDate)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingBottom:2, color:'#374151', fontWeight:400 }}>Time</td>
                    <td style={{ fontWeight:400, paddingBottom:2, textAlign:'right', color:'#111827', fontFamily:"'Courier New', monospace" }}>
                      {fmtTime(data.invoiceDate)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ══ ITEMS TABLE ══ */}
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', borderBottom:'1px solid #d1d5db' }}>
            <thead>
              <tr style={{ background:primaryColor, color:textColor }}>
                <th style={{ ...TH, width:'4%'  }}>Sr.</th>
                <th style={{ ...TH, width:'26%', textAlign:'left' }}>Medicine Name</th>
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
                      <div style={{ fontWeight:400, color:'#111827' }}>
                        {item.genericName || item.medicineName}
                      </div>
                      {item.genericName && item.medicineName && item.genericName !== item.medicineName && (
                        <div style={{ fontSize:11, color:'#4b5563', marginTop:2 }}>{item.medicineName}</div>
                      )}
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
              <tr style={{ borderTop:`2px solid ${primaryColor}`, fontWeight:400, background:'#f9fafb' }}>
                <td colSpan={6} style={{ ...TD, textAlign:'right', fontWeight:400, color:'#111827' }}>TOTAL</td>
                <td style={TDc} colSpan={5}></td>
                <td style={{ ...TDr, fontSize:12, fontWeight:400, color:primaryColor, background:lightColor }}>
                  {fmtINR(data.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* ══ TOTAL IN WORDS ══ */}
          <div className="inv-print-totals" style={{ padding:'10px 12px', borderBottom:'1px solid #d1d5db', background:'#f9fafb' }}>
            <span style={{ fontWeight:400, color:'#374151', fontSize:'12px', letterSpacing:'0.2px' }}>TOTAL IN WORDS</span>
            <div style={{ fontWeight:400, fontSize:'13px', marginTop:4, textTransform:'uppercase', color:'#111827', letterSpacing:'0.3px', fontFamily:"'Courier New', monospace" }}>
              {numberToWords(data.grandTotal)}
            </div>
          </div>

          {/* ══ SUMMARY TABLE ══ */}
          <table className="inv-print-totals" style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', borderBottom:'1px solid #d1d5db' }}>
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
                <td style={{ ...TD2, textAlign:'left', fontWeight:400, color:'#374151' }}>Subtotal</td>
                <td style={{ ...TD2, textAlign:'right', color:'#111827', fontWeight:400 }}>{fmt2(data.subtotal)}</td>
                <td style={{ ...TD2, textAlign:'center', color:'#4b5563' }}>—</td>
                <td style={{ ...TD2, textAlign:'right', color:'#111827', fontWeight:400 }}>{fmt2(data.subtotal)}</td>
              </tr>
              {data.totalDiscount > 0 && (
                <tr style={{ background:'#fef3c7' }}>
                  <td style={{ ...TD2, textAlign:'left', fontWeight:400, color:'#d97706' }}>Discount</td>
                  <td style={{ ...TD2, textAlign:'right', color:'#d97706', fontWeight:400 }}>−{fmt2(data.totalDiscount)}</td>
                  <td style={{ ...TD2, textAlign:'center', color:'#d97706' }}>—</td>
                  <td style={{ ...TD2, textAlign:'right', color:'#d97706', fontWeight:400 }}>−{fmt2(data.totalDiscount)}</td>
                </tr>
              )}
              <tr style={{ fontWeight:400, background:'#f0f0f0', borderTop:'1px solid #d1d5db', borderBottom:'1px solid #d1d5db' }}>
                <td style={{ ...TD2, textAlign:'left', fontWeight:400, color:'#111827' }}>Taxable Value</td>
                <td style={{ ...TD2, textAlign:'right', fontWeight:400, color:'#111827' }}>{fmt2(data.taxableValue)}</td>
                <td style={{ ...TD2, textAlign:'center', color:'#4b5563' }}>—</td>
                <td style={{ ...TD2, textAlign:'right', fontWeight:400, color:'#111827' }}>{fmt2(data.taxableValue)}</td>
              </tr>
              <tr style={{ background:'#fff' }}>
                <td style={{ ...TD2, textAlign:'left', color:'#374151', fontWeight:400 }}>IGST on Taxable</td>
                <td style={{ ...TD2, textAlign:'right', color:'#4b5563' }}>—</td>
                <td style={{ ...TD2, textAlign:'center', color:'#111827', fontWeight:400 }}>{Object.keys(data.gstMap).join('/')}</td>
                <td style={{ ...TD2, textAlign:'right', color:'#111827', fontWeight:400 }}>{fmt2(data.totalGst)}</td>
              </tr>
              <tr style={{ fontWeight:400, background:primaryColor, color:textColor }}>
                <td style={{ ...TD2, background:primaryColor, color:textColor, textAlign:'left', fontWeight:400 }}>GRAND TOTAL</td>
                <td style={{ ...TD2, background:primaryColor, color:textColor, textAlign:'right' }}>—</td>
                <td style={{ ...TD2, background:primaryColor, color:textColor, textAlign:'center' }}>—</td>
                <td style={{ ...TD2, background:primaryColor, color:textColor, textAlign:'right', fontWeight:400, fontSize:'12px' }}>{fmt2(data.grandTotal)}</td>
              </tr>
            </tbody>
          </table>

          {/* ══ AUTHORISED SIGNATORY + PATIENT SIGNATURE ══ */}
          <div className="inv-print-footer" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid #d1d5db' }}>

            {/* Authorised Signatory */}
            <div style={{
              borderRight:'1px solid #d1d5db',
              padding:'14px 16px',
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'space-between',
              textAlign:'center', minHeight:120,
            }}>
              <div style={{ fontSize:'12px', color:'#374151', lineHeight:1.7, fontWeight:400 }}>
                Certified that the particulars given above are<br/>true and correct.
              </div>
              <div>
                <div style={{ fontWeight:400, fontSize:'12.5px', color:primaryColor, marginTop:10, letterSpacing:'0.2px' }}>
                  For {branding.hospitalName || 'Healthcare Center'}
                </div>
                <div style={{
                  fontSize:'12px', color:'#374151', marginTop:38,
                  borderTop:`1px solid #d1d5db`, paddingTop:6, fontWeight:400,
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
                fontSize:'12px', color:'#374151',
                borderTop:'1px solid #d1d5db', paddingTop:6,
                textAlign:'center', width:'75%', fontWeight:400,
              }}>
                Patient Signature
              </div>
            </div>
          </div>

          {/* ══ FOOTER ══ */}
          <div className="inv-print-footer" style={{
            textAlign:'center', padding:'10px 16px',
            fontSize:'13px', color:'#374151', background:'#f9fafb',
            borderTop:'1px solid #e5e7eb', fontStyle:'italic', fontWeight:400, letterSpacing:'0.2px',
          }}>
            {branding.footerNote || 'Thank you for choosing our hospital. We look forward to serving you again.'}
          </div>

        </div>{/* end invoice root */}
      </div>{/* end backdrop */}

      <style>{`
        @media print {
          @page {
            size: ${paperSize} portrait;
            margin: ${isA5 ? '8mm' : '10mm'};
          }

          html, body {
            height: auto !important;
            overflow: visible !important;
          }

          body * { visibility: hidden !important; }
          #invoice-print-root,
          #invoice-print-root * { visibility: visible !important; }

          /* Critical fix: the on-screen preview wrapper is
             position:fixed with inset:0 and overflow-y:auto, so it is
             viewport-sized. Because the invoice root is absolutely
             positioned INSIDE that wrapper, the fixed/scroll container
             was clipping everything past one page's height when
             printing -- that's why long bills (lots of medicines) got
             squashed onto a single page instead of flowing onto page
             2, 3, etc. Neutralising the wrapper for print lets the
             invoice flow naturally across pages. */
          #invoice-print-backdrop {
            position: static !important;
            inset: auto !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            background: none !important;
          }

          #invoice-print-root {
            /* absolute (not fixed) so overflow continues on next pages */
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            max-width: ${isA5 ? '148mm' : '210mm'} !important;
            height: auto !important;
            overflow: visible !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            font-size: ${isA5 ? '10.5pt' : '11pt'} !important;
            line-height: 1.35 !important;
          }
          #invoice-print-root, #invoice-print-root * {
            font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #invoice-print-root table { page-break-inside: auto !important; }
          #invoice-print-root thead { display: table-header-group !important; }
          /* tfoot defaults to table-footer-group, which browsers repeat
             on every printed page (same mechanism as thead repeating).
             We only want the TOTAL row once, on the last page, so force
             it to behave like a normal row-group instead. */
          #invoice-print-root tfoot { display: table-row-group !important; }
          #invoice-print-root tbody tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: auto !important;
          }
          #invoice-print-root .inv-print-totals,
          #invoice-print-root .inv-print-footer {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </>
  );
}
import React from 'react';
import { Printer, X } from 'lucide-react';
import { useBranding } from '../../hooks/useBranding';

const fmt2 = (n) => Number(n || 0).toFixed(2);
const fmtINR = (n) => `₹ ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) => {
  if (!d) return 'N/A';
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const mon = dt.toLocaleString('en-IN', { month: 'short' });
  const yr = dt.getFullYear();
  return `${day}-${mon}-${yr}`;
};

const fmtMonthYear = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  return dt.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
};

const ones = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE',
  'TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
const tens = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
function convert(n) {
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
  if (n < 1000) return ones[Math.floor(n/100)]+' HUNDRED'+(n%100 ? ' '+convert(n%100) : '');
  if (n < 100000) return convert(Math.floor(n/1000))+' THOUSAND'+(n%1000 ? ' '+convert(n%1000) : '');
  if (n < 10000000) return convert(Math.floor(n/100000))+' LAKH'+(n%100000 ? ' '+convert(n%100000) : '');
  return convert(Math.floor(n/10000000))+' CRORE'+(n%10000000 ? ' '+convert(n%10000000) : '');
}
function numberToWords(num) {
  if (!num || isNaN(num)) return 'ZERO RUPEES ONLY';
  const r = Math.floor(num);
  const p = Math.round((num - r) * 100);
  let w = convert(r) + ' RUPEES';
  if (p > 0) w += ' AND ' + convert(p) + ' PAISA';
  return w + ' ONLY';
}

export default function PharmacyTaxInvoice({ sale, onClose }) {
  const { branding } = useBranding();

  if (!sale) return null;

  const items = sale.items || [];
  const subtotal = items.reduce((s, i) => s + (i.unitPrice || 0) * (i.quantity || 0), 0);
  const totalDiscount = items.reduce((s, i) => s + (i.discountAmount || 0), 0);
  const taxableValue = subtotal - totalDiscount;
  const totalGst = items.reduce((s, i) => s + (i.gstAmount || 0), 0);
  const grandTotal = sale.grandTotal || (taxableValue + totalGst);
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);

  // Collect HSN codes
  const hsnCodes = [...new Set(items.map(i => i.hsnCode).filter(Boolean))].join(', ');

  // GST summary by rate
  const gstMap = {};
  items.forEach(item => {
    const rate = item.gstPercent || 0;
    if (!gstMap[rate]) gstMap[rate] = { taxable: 0, gst: 0 };
    const lineSubtotal = (item.unitPrice || 0) * (item.quantity || 0);
    const discAmt = item.discountAmount || 0;
    gstMap[rate].taxable += lineSubtotal - discAmt;
    gstMap[rate].gst += item.gstAmount || 0;
  });

  const invoiceNo = sale.saleNumber || String(sale._id).slice(-4).toUpperCase();

  return (
    <>
      {/* Toolbar */}
      <div style={{
        position:'fixed',top:0,left:0,right:0,zIndex:10001,
        background:'#1a6b3c',display:'flex',gap:10,padding:'8px 16px',
        justifyContent:'flex-end'
      }}>
        <button onClick={() => window.print()} style={{
          display:'flex',alignItems:'center',gap:6,padding:'6px 18px',
          background:'#fff',color:'#1a6b3c',border:'none',borderRadius:6,
          fontWeight:700,fontSize:13,cursor:'pointer'
        }}>
          <Printer size={15}/> Print
        </button>
        <button onClick={onClose} style={{
          display:'flex',alignItems:'center',gap:6,padding:'6px 18px',
          background:'#e5e7eb',color:'#374151',border:'none',borderRadius:6,
          fontWeight:700,fontSize:13,cursor:'pointer'
        }}>
          <X size={15}/> Close
        </button>
      </div>

      {/* Overlay */}
      <div style={{
        position:'fixed',inset:0,zIndex:10000,background:'rgba(0,0,0,0.6)',
        overflowY:'auto',paddingTop:60,paddingBottom:32,display:'flex',
        justifyContent:'center'
      }}>
        {/* Invoice Root */}
        <div id="ph-invoice-print" style={{
          background:'#fff',width:794,fontFamily:'Arial, sans-serif',
          fontSize:11,color:'#111',border:'2px solid #1a6b3c',
          boxShadow:'0 4px 32px rgba(0,0,0,0.25)'
        }}>

          {/* ═══ HEADER ═══ */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px 8px',borderBottom:'2px solid #1a6b3c'}}>
            {/* Left: logo + name + address */}
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              {branding.logo ? (
                <img src={branding.logo} alt="" style={{width:64,height:64,objectFit:'contain'}}/>
              ) : (
                <div style={{width:64,height:64,background:'#e8f5e9',border:'2px solid #1a6b3c',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:10,color:'#1a6b3c',textAlign:'center',padding:2}}>
                  MEDI<br/>CARE
                </div>
              )}
              <div>
                <div style={{fontSize:26,fontWeight:900,color:'#1a6b3c',lineHeight:1.1}}>
                  {branding.hospitalName || 'MediCare'}
                </div>
                {branding.tagline && (
                  <div style={{fontSize:13,fontWeight:700,color:'#1a6b3c'}}>{branding.tagline}</div>
                )}
                <div style={{fontSize:10.5,color:'#333',marginTop:3,display:'flex',gap:4,alignItems:'center'}}>
                  <span>📍</span>
                  <span>{branding.address || '13 Health Street, Mumbai, Maharashtra, India'}</span>
                </div>
                {branding.phone && (
                  <div style={{fontSize:10.5,color:'#333',display:'flex',gap:4,alignItems:'center'}}>
                    <span>📞</span><span>{branding.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: promo box */}
            <div style={{
              border:'2px solid #1a6b3c',borderRadius:8,padding:'10px 18px',
              textAlign:'center',minWidth:120
            }}>
              <div style={{fontSize:13,fontWeight:800,color:'#1a6b3c',whiteSpace:'nowrap'}}>
                Buy 1 Get 1 Free
              </div>
            </div>
          </div>

          {/* ═══ TAGLINE BAND ═══ */}
          <div style={{
            textAlign:'center',padding:'5px',fontSize:11,
            fontStyle:'italic',color:'#333',borderBottom:'1px solid #aaa',
            background:'#fafafa'
          }}>
            A single stop for all your Healthcare needs!
          </div>

          {/* ═══ GSTIN + TAX INVOICE + ORIGINAL ═══ */}
          <div style={{
            display:'grid',gridTemplateColumns:'1fr auto 1fr',
            alignItems:'center',padding:'6px 10px',
            borderBottom:'1px solid #555',background:'#fff'
          }}>
            <div style={{fontSize:12,fontWeight:700}}>
              {branding.gstNumber ? (
                <><span style={{fontWeight:800}}>GSTIN : </span>{branding.gstNumber}</>
              ) : (
                <span style={{fontWeight:800}}>GSTIN : N/A</span>
              )}
            </div>
            <div style={{fontSize:17,fontWeight:900,color:'#1a6b3c',letterSpacing:'0.06em',textAlign:'center',padding:'0 24px'}}>
              TAX INVOICE
            </div>
            <div style={{fontSize:11,fontWeight:700,textAlign:'right'}}>
              ORIGINAL FOR RECIPIENT
            </div>
          </div>

          {/* ═══ CUSTOMER DETAIL + INVOICE META ═══ */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',borderBottom:'1px solid #888'}}>
            {/* Customer box */}
            <div style={{borderRight:'1px solid #888'}}>
              <div style={{
                background:'#1a6b3c',color:'#fff',fontWeight:700,
                fontSize:11,textAlign:'center',padding:'4px'
              }}>Customer Detail</div>
              <div style={{padding:'6px 10px'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:10.5}}>
                  <tbody>
                    <tr>
                      <td style={{fontWeight:700,width:75,paddingBottom:2,verticalAlign:'top'}}>M/S</td>
                      <td style={{paddingBottom:2}}>{sale.customerName || sale.patient?.name || 'Walk-in Customer'}</td>
                    </tr>
                    {sale.patient?.name && sale.saleType === 'patient' && (
                      <tr>
                        <td style={{fontWeight:700,paddingBottom:2,verticalAlign:'top'}}>C.Person</td>
                        <td style={{paddingBottom:2}}>{sale.patient.name}</td>
                      </tr>
                    )}
                    {sale.customerPhone && (
                      <tr>
                        <td style={{fontWeight:700,paddingBottom:2}}>Phone</td>
                        <td style={{paddingBottom:2}}>{sale.customerPhone}</td>
                      </tr>
                    )}
                    {sale.patient?.phone && (
                      <tr>
                        <td style={{fontWeight:700,paddingBottom:2}}>Phone</td>
                        <td style={{paddingBottom:2}}>{sale.patient.phone}</td>
                      </tr>
                    )}
                    {sale.patient?.patientId && (
                      <tr>
                        <td style={{fontWeight:700,paddingBottom:2}}>Patient ID</td>
                        <td style={{paddingBottom:2}}>{sale.patient.patientId}</td>
                      </tr>
                    )}
                    {branding.gstNumber && (
                      <tr>
                        <td style={{fontWeight:700,paddingBottom:2}}>GSTIN</td>
                        <td style={{paddingBottom:2}}>{branding.gstNumber}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{fontWeight:700,paddingBottom:2,verticalAlign:'top'}}>Place of<br/>Supply</td>
                      <td style={{paddingBottom:2}}>{branding.state || 'Maharashtra ( 27 )'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Invoice meta */}
            <div style={{padding:'6px 10px',display:'flex',flexDirection:'column',justifyContent:'flex-start'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:10.5}}>
                <tbody>
                  <tr>
                    <td style={{paddingBottom:4}}>Invoice No.</td>
                    <td style={{fontWeight:700,fontSize:13,paddingBottom:4,textAlign:'center'}}>{invoiceNo}</td>
                    <td style={{paddingBottom:4,paddingLeft:8}}>Invoice Date</td>
                    <td style={{fontWeight:700,paddingBottom:4,textAlign:'right'}}>{fmtDate(sale.saleDate || sale.createdAt)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ ITEMS TABLE ═══ */}
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,borderBottom:'1px solid #888'}}>
            <thead>
              <tr style={{background:'#1a6b3c',color:'#fff'}}>
                <th style={TH}>Sr.<br/>No.</th>
                <th style={{...TH,textAlign:'left',width:'22%'}}>Name of Product / Service</th>
                <th style={TH}>Batch No</th>
                <th style={TH}>MFG Date</th>
                <th style={TH}>Expiry Date</th>
                <th style={TH}>HSN / SAC</th>
                <th style={TH}>Qty</th>
                <th style={TH}>MRP</th>
                <th style={TH}>Rate</th>
                <th style={TH} colSpan={2}>Disc.<br/>(%)</th>
                <th style={{...TH,textAlign:'right'}}>Taxable Value</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const lineSubtotal = (item.unitPrice || 0) * (item.quantity || 0);
                const discAmt = item.discountAmount || 0;
                const taxable = lineSubtotal - discAmt;
                return (
                  <tr key={i} style={{background: i % 2 === 0 ? '#fff' : '#f6fff8'}}>
                    <td style={TD_C}>{i + 1}</td>
                    <td style={{...TD,textAlign:'left',fontWeight:600}}>{item.medicineName}</td>
                    <td style={TD_C}>{item.batchNumber || 'A1'}</td>
                    <td style={TD_C}>{item.mfgDate ? fmtMonthYear(item.mfgDate) : 'Dec 2024'}</td>
                    <td style={TD_C}>{item.expiryDate ? fmtMonthYear(item.expiryDate) : '-'}</td>
                    <td style={TD_C}>{item.hsnCode || '-'}</td>
                    <td style={TD_C}>{item.quantity} {item.unitOfMeasure || 'Nos'}</td>
                    <td style={TD_R}>{item.mrp ? fmt2(item.mrp) : fmt2(item.unitPrice)}</td>
                    <td style={TD_R}>{fmt2(item.unitPrice)}</td>
                    <td style={TD_C} colSpan={2}>{fmt2(item.discountPercent || 0)}</td>
                    <td style={TD_R}>{fmt2(taxable)}</td>
                  </tr>
                );
              })}

              {/* IGST row */}
              <tr>
                <td colSpan={11} style={{...TD,textAlign:'right',fontWeight:600,fontSize:10,paddingRight:10}}>
                  IGST ({Object.keys(gstMap).join('/')} %)
                </td>
                <td style={TD_R}>{fmt2(totalGst)}</td>
              </tr>

              {/* Empty spacing rows like the image */}
              <tr style={{height:18}}><td colSpan={12} style={{borderBottom:'1px solid #ddd'}}></td></tr>
              <tr style={{height:18}}><td colSpan={12} style={{borderBottom:'1px solid #ddd'}}></td></tr>
            </tbody>
            <tfoot>
              <tr style={{borderTop:'2px solid #888',fontWeight:700,background:'#f9f9f9'}}>
                <td colSpan={4} style={{...TD,textAlign:'right',fontWeight:700,paddingRight:8}}>Total</td>
                <td style={TD_C}></td>
                <td style={TD_C}></td>
                <td style={TD_C}><b>{totalQty}</b></td>
                <td style={TD_C}></td>
                <td style={TD_R}><b>{fmt2(taxableValue - totalGst > 0 ? taxableValue - totalGst : taxableValue)}</b></td>
                <td style={TD_C} colSpan={2}></td>
                <td style={{...TD_R,fontSize:13,fontWeight:900,color:'#1a6b3c'}}>
                  {fmtINR(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* E&OE */}
          <div style={{textAlign:'right',fontSize:9,color:'#777',padding:'2px 8px',borderBottom:'1px solid #ddd'}}>
            (E &amp; O.E.)
          </div>

          {/* ═══ TOTAL IN WORDS ═══ */}
          <div style={{padding:'6px 10px',borderBottom:'1px solid #888',background:'#fff'}}>
            <span style={{fontWeight:600}}>Total in words</span>
            <div style={{fontWeight:800,fontSize:11,marginTop:3,textTransform:'uppercase'}}>
              {numberToWords(grandTotal)}
            </div>
          </div>

          {/* ═══ GST SUMMARY TABLE ═══ */}
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:10.5,borderBottom:'1px solid #888'}}>
            <thead>
              <tr style={{background:'#f0f0f0'}}>
                <th style={{...TH2,textAlign:'left',width:'35%'}}>HSN / SAC</th>
                <th style={{...TH2,textAlign:'right'}}>Taxable Value</th>
                <th style={{...TH2,textAlign:'center',borderLeft:'1px solid #bbb'}} colSpan={2}>IGST</th>
                <th style={{...TH2,textAlign:'right'}}>Total</th>
              </tr>
              <tr style={{background:'#f0f0f0'}}>
                <th style={{...TH2,textAlign:'left'}}></th>
                <th style={{...TH2}}></th>
                <th style={{...TH2,textAlign:'center',borderLeft:'1px solid #bbb',width:'10%'}}>%</th>
                <th style={{...TH2,textAlign:'right',width:'14%'}}>Amount</th>
                <th style={{...TH2}}></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(gstMap).map(([rate, vals]) => (
                <tr key={rate}>
                  <td style={{...TD2,textAlign:'left'}}>{hsnCodes || '-'}</td>
                  <td style={{...TD2,textAlign:'right'}}>{fmt2(vals.taxable)}</td>
                  <td style={{...TD2,textAlign:'center',borderLeft:'1px solid #ddd'}}>{rate}.00</td>
                  <td style={{...TD2,textAlign:'right'}}>{fmt2(vals.gst)}</td>
                  <td style={{...TD2,textAlign:'right'}}>{fmt2(vals.gst)}</td>
                </tr>
              ))}
              {Object.keys(gstMap).length === 0 && (
                <tr>
                  <td style={{...TD2,textAlign:'left'}}>{hsnCodes || '-'}</td>
                  <td style={{...TD2,textAlign:'right'}}>{fmt2(taxableValue)}</td>
                  <td style={{...TD2,textAlign:'center',borderLeft:'1px solid #ddd'}}>0.00</td>
                  <td style={{...TD2,textAlign:'right'}}>0.00</td>
                  <td style={{...TD2,textAlign:'right'}}>0.00</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{fontWeight:700,background:'#f9f9f9',borderTop:'1px solid #aaa'}}>
                <td style={{...TD2,textAlign:'right',fontWeight:800}}>Total</td>
                <td style={{...TD2,textAlign:'right'}}>{fmt2(taxableValue)}</td>
                <td style={{...TD2,borderLeft:'1px solid #ddd'}}></td>
                <td style={{...TD2,textAlign:'right'}}>{fmt2(totalGst)}</td>
                <td style={{...TD2,textAlign:'right'}}>{fmt2(totalGst)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Total tax in words */}
          <div style={{padding:'5px 10px',fontSize:10.5,borderBottom:'1px solid #888'}}>
            <b>Total Tax in words: </b>
            <span style={{textTransform:'uppercase'}}>{numberToWords(totalGst)}</span>
          </div>

          {/* ═══ BANK DETAILS + CERTIFIED ═══ */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',borderBottom:'1px solid #888'}}>

            {/* Bank Details */}
            <div style={{borderRight:'1px solid #888',padding:'0 0 8px 0'}}>
              <div style={{
                fontWeight:700,fontSize:11,textAlign:'center',
                borderBottom:'1px solid #ccc',padding:'4px',background:'#fafafa'
              }}>Bank Details</div>
              <div style={{padding:'6px 12px'}}>
                {branding.bankName ? (
                  <>
                    <BankRow label="Name" value={branding.bankName}/>
                    <BankRow label="Branch" value={branding.bankBranch}/>
                    <BankRow label="Acc. Number" value={branding.bankAccount}/>
                    <BankRow label="IFSC" value={branding.bankIfsc}/>
                    {branding.upiId && <BankRow label="UPI ID" value={branding.upiId}/>}
                  </>
                ) : (
                  <>
                    <BankRow label="Name" value="ICICI"/>
                    <BankRow label="Branch" value="Surate"/>
                    <BankRow label="Acc. Number" value="2715500356"/>
                    <BankRow label="IFSC" value="ICIC045F"/>
                    <BankRow label="UPI ID" value="ifox@icici"/>
                  </>
                )}
                {/* QR placeholder */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
                  <div style={{
                    width:60,height:60,border:'1px solid #333',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:7,color:'#888',flexShrink:0,
                    background:'repeating-linear-gradient(45deg,#f0f0f0,#f0f0f0 2px,#fff 2px,#fff 8px)'
                  }}>QR</div>
                  <div style={{fontSize:10,fontWeight:700,color:'#1a6b3c'}}>Pay using UPI</div>
                </div>
              </div>
            </div>

            {/* Certified + Signatory */}
            <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'space-between',textAlign:'center',minHeight:140}}>
              <div style={{fontSize:10,color:'#333',lineHeight:1.5}}>
                Certified that the particulars given above are<br/>true and correct.
              </div>
              <div>
                <div style={{fontWeight:800,fontSize:12,color:'#1a6b3c',marginTop:16}}>
                  For {branding.hospitalName || 'Medicare Wholesale Pharmacy'}
                </div>
                <div style={{fontSize:10,color:'#555',marginTop:32,borderTop:'1px solid #aaa',paddingTop:4}}>
                  Authorised Signatory
                </div>
              </div>
            </div>
          </div>

          {/* ═══ TERMS + CUSTOMER SIGNATURE ═══ */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',borderBottom:'1px solid #888'}}>
            {/* Terms */}
            <div style={{borderRight:'1px solid #888'}}>
              <div style={{
                fontWeight:700,fontSize:11,textAlign:'center',
                borderBottom:'1px solid #ccc',padding:'4px',background:'#fafafa'
              }}>Terms and Conditions</div>
              <div style={{padding:'6px 10px',fontSize:10,color:'#333',lineHeight:1.6}}>
                {branding.invoiceTerms ||
                  'Subject to Maharashtra Junction.\nOur Responsibility Ceases as soon as goods leaves our Premises.\nGoods once sold will not taken back.\nDelivery Ex-Premises.'}
              </div>
              <div style={{padding:'4px 10px 8px',fontWeight:700,fontSize:10.5}}>Customer Signature</div>
            </div>

            {/* Authorised Signatory bottom right */}
            <div style={{display:'flex',flexDirection:'column',justifyContent:'flex-end',alignItems:'center',padding:'10px 14px'}}>
              <div style={{fontSize:10,color:'#555',borderTop:'1px solid #aaa',paddingTop:4,textAlign:'center',width:'80%'}}>
                Authorised Signatory
              </div>
            </div>
          </div>

          {/* ═══ FOOTER ═══ */}
          <div style={{
            textAlign:'center',padding:'8px',fontSize:11,
            fontStyle:'italic',color:'#333',borderTop:'1px solid #888'
          }}>
            {branding.footerNote || 'Thanks for your order! We look forward to working with you again soon.'}
          </div>

        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          body * { visibility: hidden; }
          #ph-invoice-print, #ph-invoice-print * { visibility: visible; }
          #ph-invoice-print {
            position: fixed !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border: 2px solid #1a6b3c !important;
            z-index: 99999;
          }
        }
      `}</style>
    </>
  );
}

// Shared cell styles
const TH = {
  padding:'5px 4px', textAlign:'center', fontSize:9.5,
  border:'1px solid rgba(255,255,255,0.25)', fontWeight:700, lineHeight:1.3
};
const TD = {
  padding:'4px 5px', border:'1px solid #ddd', verticalAlign:'middle', lineHeight:1.3
};
const TD_C = { ...TD, textAlign:'center' };
const TD_R = { ...TD, textAlign:'right' };
const TH2 = {
  padding:'4px 6px', border:'1px solid #bbb', fontWeight:700, fontSize:10
};
const TD2 = {
  padding:'4px 6px', border:'1px solid #ddd', fontSize:10.5
};

function BankRow({ label, value }) {
  return (
    <div style={{display:'flex',gap:8,marginBottom:3,fontSize:10.5}}>
      <span style={{fontWeight:700,minWidth:78,flexShrink:0}}>{label}</span>
      <span>{value || '-'}</span>
    </div>
  );
}
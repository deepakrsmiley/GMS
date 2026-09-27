import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import PurchaseEntry from '../components/pharmacy/PurchaseEntry';
import PurchaseHistoryPanel from '../components/pharmacy/PurchaseHistoryPanel';
import PurchaseReturnPanel from '../components/pharmacy/PurchaseReturnPanel';
import {
  PurchaseReturnHistory,
  StockLedgerPanel,
  StockValuationPanel,
  PurchaseReportsPanel,
} from '../components/pharmacy/PurchaseBoards';
import { printPurchase } from '../utils/purchaseMoney';
import '../styles/purchase.css';

const WORK = [
  { id: 'entry', label: 'New purchase' },
  { id: 'history', label: 'History' },
  { id: 'return', label: 'Return' },
];

const RECORDS = [
  { id: 'return-history', label: 'Return history' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'valuation', label: 'Stock value' },
  { id: 'reports', label: 'Reports' },
];

export default function PharmacyPurchasesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'entry';
  const purchaseId = params.get('purchase') || '';

  const setTab = (id, extra = {}) => {
    const next = { tab: id, ...extra };
    if (!next.purchase) delete next.purchase;
    setParams(next);
  };

  return (
    <div className="pur">
      <PageHeader
        icon={ShoppingBag}
        title="Purchases"
        subtitle="Record a supplier invoice, then review history, returns, and stock value"
      />
      <div className="pur-nav">
        <div className="corp-tabs pur-nav__main">
          {WORK.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id, item.id === 'return' ? { purchase: purchaseId } : {})}
              className={`corp-tab whitespace-nowrap ${tab === item.id ? 'corp-tab-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="pur-nav__records">
          <span className="pur-nav__label">Records</span>
          {RECORDS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`pur-chip ${tab === item.id ? 'pur-chip--on' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'entry' && (
        <PurchaseEntry onSaved={(purchase, shouldPrint) => {
          if (shouldPrint) printPurchase(purchase);
          setTab('history');
        }} />
      )}
      {tab === 'history' && (
        <PurchaseHistoryPanel onReturn={(id) => setTab('return', { purchase: id })} />
      )}
      {tab === 'return' && <PurchaseReturnPanel purchaseId={purchaseId} />}
      {tab === 'return-history' && <PurchaseReturnHistory />}
      {tab === 'ledger' && <StockLedgerPanel />}
      {tab === 'valuation' && <StockValuationPanel />}
      {tab === 'reports' && <PurchaseReportsPanel />}
    </div>
  );
}

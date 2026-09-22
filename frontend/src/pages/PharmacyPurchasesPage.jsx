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

const TABS = [
  { id: 'entry', label: 'Purchase Entry' },
  { id: 'history', label: 'Purchase History' },
  { id: 'return', label: 'Purchase Return' },
  { id: 'return-history', label: 'Return History' },
  { id: 'ledger', label: 'Stock Ledger' },
  { id: 'valuation', label: 'Stock Valuation' },
  { id: 'reports', label: 'Purchase Reports' },
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
    <div className="space-y-4">
      <PageHeader
        icon={ShoppingBag}
        title="Purchases"
        subtitle="Record supplier invoices, returns, stock value, and the movement ledger"
      />
      <div className="corp-tabs overflow-x-auto">
        {TABS.map((item) => (
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

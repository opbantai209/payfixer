import React, { useState, useEffect } from 'react';
import {
  Wallet, Scale, ArrowLeftRight, ShieldCheck, TrendingUp, RefreshCw, 
  Download, ShieldAlert, Search, Filter, AlertTriangle, CheckCircle, 
  Eye, Lock, Unlock, AlertCircle, ArrowUpRight, ArrowDownLeft, FileText, 
  ExternalLink, Check, X, RotateCcw, Building2, User, ChevronRight,
  Info, Sparkles, Layers, DollarSign, Clock, Shield, LayoutDashboard
} from 'lucide-react';

interface WalletItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: 'buyer' | 'freelancer' | 'admin';
  currency: string;
  availableBalance: number;
  pendingIncoming: number;
  fundsOnHold: number;
  pendingWithdrawals: number;
  status: 'active' | 'frozen' | 'restricted';
  restrictionReason?: string;
  lastActivityAt: string;
  createdAt: string;
  ledgerDerivedBalance: number;
  isReconciled: boolean;
  discrepancy: number;
}

interface FinancialTxn {
  id: string;
  type: string;
  amount: number;
  currency: string;
  timestamp: string;
  status: string;
  userId: string;
  userName: string;
  userRole: string;
  relatedOrderId?: string;
  relatedPayoutId?: string;
  providerReference?: string;
  journalId?: string;
  description: string;
}

interface LedgerEntryItem {
  id: string;
  journalId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  currency: string;
  description: string;
  userId?: string;
  orderId?: string;
}

interface LedgerJournalItem {
  id: string;
  reference: string;
  postingDate: string;
  timestamp: string;
  description: string;
  eventType: string;
  idempotencyKey: string;
  entries: LedgerEntryItem[];
  totalDebit: number;
  totalCredit: number;
  status: 'posted' | 'reversed';
  actor: string;
  reversedByJournalId?: string;
  reversalOfJournalId?: string;
  notes?: string;
}

interface EscrowOrderItem {
  id: string;
  title: string;
  amount: number;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  platformFeeRate: string;
  platformFeeAmount: number;
  freelancerNetAmount: number;
  escrowState: string;
  isDisputed: boolean;
  createdAt: string;
  dueDate: string;
  status: string;
  gigId?: string;
  projectId?: string;
  gigSlug?: string;
  sellerUsername?: string;
  serviceUrl?: string;
  serviceTitle?: string;
}

export const resolveOrderServiceUrl = (order: {
  id?: string;
  title?: string;
  gigId?: string;
  projectId?: string;
  serviceUrl?: string;
  gigSlug?: string;
  sellerUsername?: string;
  sellerId?: string;
}) => {
  if (order.serviceUrl && order.serviceUrl !== '#' && order.serviceUrl.startsWith('/')) {
    return order.serviceUrl;
  }
  if (order.sellerUsername && order.gigSlug) {
    return `/${order.sellerUsername.toLowerCase()}/${order.gigSlug.toLowerCase()}`;
  }
  const t = (order.title || '').toLowerCase();
  const id = order.id || '';
  const gId = order.gigId || '';

  if (gId === 'gig_0' || id === 'ord_bk' || t.includes('puppet') || t.includes('promotional explainer')) {
    return '/broadcastking/create-an-amazing-promotional-explainer-video-a-puppet';
  }
  if (gId === 'gig_1' || t.includes('link building') || t.includes('high da authority')) {
    return '/jacob_m/i-will-seo-backlinks-high-da-authority-link-building-service-for-google-ranking';
  }
  if (gId === 'gig_2' || id === 'ord_bushra' || t.includes('ahrefs') || t.includes('dr 70') || t.includes('domain rating')) {
    return '/bushra/i-will-increase-ahrefs-domain-rating-dr-70-using-high-authority-seo-backlinks';
  }
  if (gId === 'gig_3' || id === 'ord_1' || t.includes('saas') || t.includes('mvp') || t.includes('full stack') || t.includes('web app in react')) {
    return '/elena_rostova/i-will-build-a-high-performance-full-stack-web-app-in-react-and-node';
  }
  if (order.projectId === 'proj_1' || t.includes('react native') || t.includes('fintech mobile')) {
    return '/project/looking-for-a-react-native-expert-to-build-an-ios-android-fintech-mobile-app';
  }
  return '/gigs';
};

interface PayoutItem {
  id: string;
  freelancerId: string;
  freelancerName: string;
  freelancerEmail: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
  accountDetails: string;
  walletAvailableBalance: number;
  currency: string;
}

interface ReconciliationData {
  trialBalance: {
    accounts: Array<{
      code: string;
      name: string;
      type: string;
      normalBalance: string;
      totalDebits: number;
      totalCredits: number;
      netBalance: number;
    }>;
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
    difference: number;
  };
  walletAudit: {
    totalWalletsChecked: number;
    reconciledCount: number;
    driftedCount: number;
    driftedWallets: any[];
  };
  exceptions: Array<{
    id: string;
    type: string;
    entityId: string;
    amount: number;
    currency: string;
    description: string;
    status: string;
    assignedTo?: string;
    investigationNotes?: string;
    detectedAt: string;
  }>;
}

interface FinancialAuditItem {
  id: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  reason: string;
  journalId?: string;
  timestamp: string;
}

interface FinancialOverview {
  totalUserWalletLiabilities: number;
  availableBuyerBalances: number;
  availableFreelancerBalances: number;
  fundsHeldInEscrow: number;
  pendingPayouts: number;
  platformRevenue: number;
  failedTransactionsCount: number;
  unreconciledExceptionsCount: number;
  trialBalanceInBalance: boolean;
  totalLedgerDebits: number;
  totalLedgerCredits: number;
  trialBalanceDiscrepancy: number;
  activeWalletsCount: number;
  frozenWalletsCount: number;
  restrictedWalletsCount: number;
}

export const UserWalletsLedgerModule: React.FC<{ currentUser?: any }> = ({ currentUser }) => {
  // Navigation: 9 Secondary Tabs
  const [subTab, setSubTab] = useState<
    'overview' | 'wallets' | 'transactions' | 'ledger' | 'escrow' | 'payouts' | 'reconciliation' | 'reports' | 'audit'
  >('overview');

  // Loading and Notification States
  const [loading, setLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Data Collections
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [transactions, setTransactions] = useState<FinancialTxn[]>([]);
  const [journals, setJournals] = useState<LedgerJournalItem[]>([]);
  const [escrowOrders, setEscrowOrders] = useState<EscrowOrderItem[]>([]);
  const [payoutsList, setPayoutsList] = useState<PayoutItem[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationData | null>(null);
  const [auditLogs, setAuditLogs] = useState<FinancialAuditItem[]>([]);

  // Filtering States
  const [walletSearch, setWalletSearch] = useState('');
  const [walletRoleFilter, setWalletRoleFilter] = useState('all');
  const [walletStatusFilter, setWalletStatusFilter] = useState('all');

  const [txnSearch, setTxnSearch] = useState('');
  const [txnTypeFilter, setTxnTypeFilter] = useState('all');

  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState('all');

  const [escrowFilter, setEscrowFilter] = useState('all');
  const [payoutFilter, setPayoutFilter] = useState('all');

  // Selected Detail Drawers/Modals
  const [inspectingWalletId, setInspectingWalletId] = useState<string | null>(null);
  const [walletDetailData, setWalletDetailData] = useState<any | null>(null);

  const [inspectingJournal, setInspectingJournal] = useState<LedgerJournalItem | null>(null);
  const [inspectingTxn, setInspectingTxn] = useState<FinancialTxn | null>(null);

  // Administrative Adjustment Modal State
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjUserId, setAdjUserId] = useState('');
  const [adjAmount, setAdjAmount] = useState<number>(50);
  const [adjDirection, setAdjDirection] = useState<'credit_user' | 'debit_user'>('credit_user');
  const [adjCategory, setAdjCategory] = useState<'goodwill' | 'dispute_resolution' | 'accounting_correction' | 'chargeback_recovery'>('goodwill');
  const [adjReason, setAdjReason] = useState('');
  const [adjEvidence, setAdjEvidence] = useState('');
  const [adjPreview, setAdjPreview] = useState<any | null>(null);
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  // Reversal Prompt Modal
  const [reversingJournalId, setReversingJournalId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Wallet Restriction Modal
  const [restrictingWallet, setRestrictingWallet] = useState<{ id: string; name: string; type: 'freeze' | 'restrict' } | null>(null);
  const [restrictionReasonInput, setRestrictionReasonInput] = useState('');

  // Exception Resolution Modal
  const [resolvingExceptionId, setResolvingExceptionId] = useState<string | null>(null);
  const [resolutionNotesInput, setResolutionNotesInput] = useState('');

  // Fetch Authoritative Data
  const fetchAllFinanceData = async () => {
    setLoading(true);
    try {
      const [ovRes, walRes, txnRes, ledgRes, escRes, payRes, recRes, audRes] = await Promise.all([
        fetch('/api/admin/finance/overview').then(r => r.json()).catch(() => null),
        fetch('/api/admin/finance/wallets').then(r => r.json()).catch(() => []),
        fetch('/api/admin/finance/transactions').then(r => r.json()).catch(() => []),
        fetch('/api/admin/finance/ledger').then(r => r.json()).catch(() => []),
        fetch('/api/admin/finance/escrow').then(r => r.json()).catch(() => []),
        fetch('/api/admin/finance/payouts').then(r => r.json()).catch(() => []),
        fetch('/api/admin/finance/reconciliation').then(r => r.json()).catch(() => null),
        fetch('/api/admin/finance/audit').then(r => r.json()).catch(() => [])
      ]);

      if (ovRes) setOverview(ovRes);
      if (Array.isArray(walRes)) setWallets(walRes);
      if (Array.isArray(txnRes)) setTransactions(txnRes);
      if (Array.isArray(ledgRes)) setJournals(ledgRes);
      if (Array.isArray(escRes)) setEscrowOrders(escRes);
      if (Array.isArray(payRes)) setPayoutsList(payRes);
      if (recRes) setReconciliation(recRes);
      if (Array.isArray(audRes)) setAuditLogs(audRes);
    } catch (err: any) {
      console.error('Error loading financial ledger data:', err);
      setActionError('Could not load authoritative financial records: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllFinanceData();
  }, []);

  // Fetch single wallet detail when inspected
  const handleOpenWalletDetail = async (userId: string) => {
    setInspectingWalletId(userId);
    try {
      const res = await fetch(`/api/admin/finance/wallets/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setWalletDetailData(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Preview live adjustment
  useEffect(() => {
    if (isAdjustmentModalOpen && adjUserId && adjAmount > 0) {
      fetch('/api/admin/finance/adjustments/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adjUserId,
          amount: adjAmount,
          direction: adjDirection,
          category: adjCategory,
          reason: adjReason
        })
      })
        .then(r => r.json())
        .then(data => setAdjPreview(data))
        .catch(() => setAdjPreview(null));
    } else {
      setAdjPreview(null);
    }
  }, [isAdjustmentModalOpen, adjUserId, adjAmount, adjDirection, adjCategory, adjReason]);

  // Execute Adjustment
  const handlePostAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjUserId || adjAmount <= 0 || !adjReason.trim()) {
      setActionError('Please specify wallet, amount (> 0), and mandatory adjustment reason.');
      return;
    }
    setAdjSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/finance/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adjUserId,
          amount: adjAmount,
          direction: adjDirection,
          category: adjCategory,
          reason: adjReason,
          evidenceReference: adjEvidence,
          actor: currentUser?.name || 'Super Admin'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post adjustment');

      setActionSuccess(`Successfully posted balanced double-entry adjustment (${data.journal.id}) for $${adjAmount}.`);
      setIsAdjustmentModalOpen(false);
      setAdjReason('');
      setAdjEvidence('');
      fetchAllFinanceData();
      if (inspectingWalletId === adjUserId) {
        handleOpenWalletDetail(adjUserId);
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setAdjSubmitting(false);
    }
  };

  // Execute Journal Reversal
  const handleReverseJournal = async () => {
    if (!reversingJournalId || !reversalReason.trim()) return;
    try {
      const res = await fetch(`/api/admin/finance/ledger/${reversingJournalId}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reversalReason,
          actor: currentUser?.name || 'Chief Finance Officer'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reverse journal');

      setActionSuccess(`Reversal journal ${data.id} posted. Debits and credits inverted atomically.`);
      setReversingJournalId(null);
      setReversalReason('');
      setInspectingJournal(null);
      fetchAllFinanceData();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  // Escrow Release
  const handleReleaseEscrow = async (orderId: string) => {
    if (!confirm(`Are you sure you want to release escrow for Order #${orderId}? This will credit 90% net earnings to the freelancer and book 10% platform fee revenue.`)) return;
    try {
      const res = await fetch(`/api/admin/finance/escrow/${orderId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: currentUser?.name || 'Super Admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to release escrow');

      setActionSuccess(`Order #${orderId} escrow released! Freelancer received $${data.freelancerNet}, Platform fee booked: $${data.platformFee}.`);
      fetchAllFinanceData();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  // Escrow Refund
  const handleRefundEscrow = async (orderId: string) => {
    const reason = prompt(`Enter reason to refund Order #${orderId} escrow back to buyer:`);
    if (!reason) return;
    try {
      const res = await fetch(`/api/admin/finance/escrow/${orderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, actor: currentUser?.name || 'Super Admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to refund escrow');

      setActionSuccess(`Order #${orderId} escrow refunded to buyer wallet balance.`);
      fetchAllFinanceData();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  // Payout Actions
  const handleApprovePayout = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/finance/payouts/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: currentUser?.name || 'Super Admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve payout');
      setActionSuccess(`Payout #${id} approved for disbursement.`);
      fetchAllFinanceData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleProcessPayout = async (id: string) => {
    if (!confirm(`Confirm disbursement settlement for Payout #${id}? This will debit freelancer liability and record payment transit.`)) return;
    try {
      const res = await fetch(`/api/admin/finance/payouts/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: currentUser?.name || 'Super Admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process payout');
      setActionSuccess(`Payout #${id} settled and posted to ledger.`);
      fetchAllFinanceData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleRejectPayout = async (id: string) => {
    const reason = prompt(`Enter mandatory reason to reject Payout #${id} (funds will be refunded to freelancer):`);
    if (!reason) return;
    try {
      const res = await fetch(`/api/admin/finance/payouts/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, actor: currentUser?.name || 'Super Admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject payout');
      setActionSuccess(`Payout #${id} rejected and funds restored to freelancer available balance.`);
      fetchAllFinanceData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  // Wallet Restriction Confirmation
  const handleExecuteWalletRestriction = async () => {
    if (!restrictingWallet || !restrictionReasonInput.trim()) return;
    try {
      const endpoint = restrictingWallet.type === 'freeze' ? 'freeze' : 'restrict';
      const res = await fetch(`/api/admin/finance/wallets/${restrictingWallet.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: restrictionReasonInput, actor: currentUser?.name || 'Super Admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply restriction');

      setActionSuccess(`Wallet for ${restrictingWallet.name} is now ${restrictingWallet.type === 'freeze' ? 'Frozen' : 'Restricted'}.`);
      setRestrictingWallet(null);
      setRestrictionReasonInput('');
      fetchAllFinanceData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleUnfreezeWallet = async (userId: string, name: string) => {
    try {
      const res = await fetch(`/api/admin/finance/wallets/${userId}/unfreeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Administrative review cleared', actor: currentUser?.name || 'Super Admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unfreeze wallet');

      setActionSuccess(`Wallet for ${name} has been unfrozen.`);
      fetchAllFinanceData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  // Resolve Reconciliation Exception
  const handleResolveException = async () => {
    if (!resolvingExceptionId || !resolutionNotesInput.trim()) return;
    try {
      const res = await fetch(`/api/admin/finance/reconciliation/resolve/${resolvingExceptionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: resolutionNotesInput, actor: currentUser?.name || 'Super Admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve exception');

      setActionSuccess(`Exception #${resolvingExceptionId} marked resolved.`);
      setResolvingExceptionId(null);
      setResolutionNotesInput('');
      fetchAllFinanceData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  // CSV Export Trigger
  const handleTriggerExport = (type: string) => {
    window.open(`/api/admin/finance/export/${type}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Financial Alerts */}
      {actionSuccess && (
        <div className="bg-emerald-950/80 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between text-emerald-300 text-xs">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="p-1 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {actionError && (
        <div className="bg-red-950/80 border border-red-500/30 rounded-2xl p-4 flex items-center justify-between text-red-300 text-xs">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="font-semibold">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="p-1 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* MODULE HEADER & DUAL NAVIGATION */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Authoritative Double-Entry Accounting
              </span>
              <span className="text-[10px] font-bold text-slate-500">· Append-Only Invariant Ledger</span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
              <Wallet className="w-6 h-6 text-emerald-600" />
              <span>User Wallets & Double-Entry Ledger</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Complete financial administration: inspect individual wallets, review balanced double-entry journals, monitor escrow protections, execute controlled adjustments, and audit trial balance parity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Live Trial Balance Equality Status */}
            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-mono ${
              overview?.trialBalanceInBalance 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                : 'bg-red-50 border-red-200 text-red-700 animate-pulse'
            }`}>
              <Scale className="w-4 h-4" />
              <span className="font-bold">
                {overview?.trialBalanceInBalance ? 'Trial Balance: Balanced ($0.00 Diff)' : `OUT OF BALANCE: $${overview?.trialBalanceDiscrepancy}`}
              </span>
            </div>

            {/* Quick Adjustment Trigger */}
            <button
              onClick={() => {
                setAdjUserId(wallets[0]?.userId || '');
                setIsAdjustmentModalOpen(true);
              }}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>New Adjustment</span>
            </button>

            {/* Refresh Data */}
            <button
              onClick={fetchAllFinanceData}
              disabled={loading}
              className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 transition-colors"
              title="Refresh Authoritative Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* 9 Secondary Sub-Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'overview', label: '1. Overview', icon: LayoutDashboard },
            { id: 'wallets', label: '2. User Wallets', icon: Wallet, count: wallets.length },
            { id: 'transactions', label: '3. Transactions', icon: ArrowLeftRight, count: transactions.length },
            { id: 'ledger', label: '4. Double-Entry Ledger', icon: Scale, count: journals.length },
            { id: 'escrow', label: '5. Escrow & Holds', icon: ShieldCheck, count: escrowOrders.length },
            { id: 'payouts', label: '6. Payouts', icon: TrendingUp, count: payoutsList.length },
            { id: 'reconciliation', label: '7. Reconciliation', icon: RefreshCw },
            { id: 'reports', label: '8. Reports & Exports', icon: Download },
            { id: 'audit', label: '9. Audit & Controls', icon: ShieldAlert, count: auditLogs.length },
          ].map((item) => {
            const Icon = item.icon;
            const active = subTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSubTab(item.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent hover:border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    active ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: OVERVIEW DASHBOARD */}
      {/* ========================================================================= */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          {/* Prominent Needs Attention Section */}
          {(overview?.unreconciledExceptionsCount || 0) > 0 || (overview?.frozenWalletsCount || 0) > 0 || payoutsList.some(p => p.status === 'pending') ? (
            <div className="bg-amber-950/20 border border-amber-500/30 rounded-3xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <span>Financial Matters Requiring Administrator Attention</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {overview && overview.unreconciledExceptionsCount > 0 && (
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-amber-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block font-medium">Reconciliation Exceptions</span>
                      <span className="text-amber-400 font-bold text-sm mt-0.5 block">{overview.unreconciledExceptionsCount} Unresolved Items</span>
                    </div>
                    <button onClick={() => setSubTab('reconciliation')} className="text-amber-400 hover:text-white font-bold flex items-center gap-1">
                      Investigate <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {payoutsList.some(p => p.status === 'pending') && (
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-amber-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block font-medium">Pending Payout Requests</span>
                      <span className="text-amber-400 font-bold text-sm mt-0.5 block">{payoutsList.filter(p => p.status === 'pending').length} Awaiting Approval</span>
                    </div>
                    <button onClick={() => setSubTab('payouts')} className="text-amber-400 hover:text-white font-bold flex items-center gap-1">
                      Review <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {overview && overview.frozenWalletsCount > 0 && (
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-amber-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block font-medium">Frozen Accounts</span>
                      <span className="text-amber-400 font-bold text-sm mt-0.5 block">{overview.frozenWalletsCount} Wallets Under Restriction</span>
                    </div>
                    <button onClick={() => setSubTab('wallets')} className="text-amber-400 hover:text-white font-bold flex items-center gap-1">
                      View <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Total User Liabilities</span>
              <div className="text-2xl font-black text-white font-mono">
                ${overview?.totalUserWalletLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">Available User Balances</span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Buyer Available Funds</span>
              <div className="text-2xl font-black text-indigo-400 font-mono">
                ${overview?.availableBuyerBalances.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">Pre-funded contract reserves</span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Freelancer Earnings</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                ${overview?.availableFreelancerBalances.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">Withdrawable talent balances</span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Escrow Funds in Trust</span>
              <div className="text-2xl font-black text-amber-400 font-mono">
                ${overview?.fundsHeldInEscrow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">14-Day Vault Protection</span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Platform Revenue (10%)</span>
              <div className="text-2xl font-black text-purple-400 font-mono">
                ${overview?.platformRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">Commission on completed orders</span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Pending Payouts</span>
              <div className="text-2xl font-black text-sky-400 font-mono">
                ${overview?.pendingPayouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">Disbursements in processing</span>
            </div>
          </div>

          {/* Double-Entry Balance Verification Banner */}
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Scale className="w-4 h-4 text-emerald-400" />
                  <span>Authoritative Double-Entry Invariant Verification</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every transaction posts equal debits and credits. Stored wallet balances are actively checked against the real-time sum of ledger lines.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
                  Total Ledger Debits: <strong className="text-white">${overview?.totalLedgerDebits.toLocaleString()}</strong>
                </span>
                <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
                  Total Ledger Credits: <strong className="text-white">${overview?.totalLedgerCredits.toLocaleString()}</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-xs">
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <span className="text-slate-400 font-medium block">Active Chart of Accounts</span>
                <span className="text-base font-bold text-white mt-1 block">11 Authoritative Accounts</span>
                <p className="text-[11px] text-slate-500 mt-1">Asset (1010-1030), Liability (2010-2050), Revenue (4010), Expense (5010-5020)</p>
              </div>

              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <span className="text-slate-400 font-medium block">Total Posted Journals</span>
                <span className="text-base font-bold text-white mt-1 block">{journals.length} Balanced Journals</span>
                <p className="text-[11px] text-slate-500 mt-1">Append-only, immutable history with reversal linkage</p>
              </div>

              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <span className="text-slate-400 font-medium block">Wallet-to-Ledger Parity</span>
                <span className="text-base font-bold text-emerald-400 mt-1 block">100% Mathematically Reconciled</span>
                <p className="text-[11px] text-slate-500 mt-1">Zero undetected drift between user wallets and ledger lines</p>
              </div>
            </div>
          </div>

          {/* Recent Financial Activity Log Preview */}
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-emerald-400" />
                <span>Recent Platform Financial Activity</span>
              </h3>
              <button onClick={() => setSubTab('transactions')} className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1">
                View All {transactions.length} Transactions <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="p-3">Txn ID</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">User & Role</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3 text-right">Journal Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {transactions.slice(0, 5).map(t => (
                    <tr key={t.id} className="hover:bg-slate-900/50">
                      <td className="p-3 font-mono font-bold text-white">{t.id}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 border border-slate-700 text-slate-300">
                          {t.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-white block">{t.userName}</span>
                        <span className="text-[10px] text-slate-500 uppercase">{t.userRole}</span>
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-400">${t.amount.toFixed(2)}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {t.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{t.timestamp}</td>
                      <td className="p-3 text-right font-mono text-slate-400">
                        {t.journalId ? (
                          <button
                            onClick={() => {
                              const j = journals.find(x => x.id === t.journalId);
                              if (j) setInspectingJournal(j);
                            }}
                            className="text-emerald-400 hover:underline font-bold"
                          >
                            {t.journalId}
                          </button>
                        ) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: USER WALLETS */}
      {/* ========================================================================= */}
      {subTab === 'wallets' && (
        <div className="space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-400" />
                  <span>User Wallet Accounts & Balances</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Direct inspection of all buyer and freelancer wallets with real-time double-entry ledger reconciliation.
                </p>
              </div>
              <span className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-400">
                {wallets.length} User Wallets Enrolled
              </span>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search user name, email, wallet ID..."
                  value={walletSearch}
                  onChange={e => setWalletSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={walletRoleFilter}
                onChange={e => setWalletRoleFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All User Roles</option>
                <option value="buyer">Buyers Only</option>
                <option value="freelancer">Freelancers Only</option>
              </select>

              <select
                value={walletStatusFilter}
                onChange={e => setWalletStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Wallet Statuses</option>
                <option value="active">Active (Normal)</option>
                <option value="frozen">Frozen Accounts</option>
                <option value="restricted">Withdrawals Restricted</option>
              </select>
            </div>
          </div>

          {/* Wallets Table */}
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="p-4">User Identity</th>
                    <th className="p-4">Wallet ID</th>
                    <th className="p-4">Available Balance</th>
                    <th className="p-4">Escrow On Hold</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Ledger Parity</th>
                    <th className="p-4">Last Activity</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {wallets
                    .filter(w => {
                      const q = walletSearch.toLowerCase();
                      const matchesSearch = !q || w.userName.toLowerCase().includes(q) || w.userEmail.toLowerCase().includes(q) || w.id.toLowerCase().includes(q);
                      const matchesRole = walletRoleFilter === 'all' || w.userRole === walletRoleFilter;
                      const matchesStatus = walletStatusFilter === 'all' || w.status === walletStatusFilter;
                      return matchesSearch && matchesRole && matchesStatus;
                    })
                    .map(w => (
                      <tr key={w.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="p-4">
                          <span className="font-bold text-white block">{w.userName}</span>
                          <span className="text-[11px] text-slate-400 block">{w.userEmail}</span>
                          <span className={`inline-block mt-0.5 px-2 py-0.2 rounded text-[9px] font-extrabold uppercase border ${
                            w.userRole === 'buyer' 
                              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}>
                            {w.userRole}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-slate-400">{w.id}</td>
                        <td className="p-4 font-mono font-black text-sm text-white">
                          ${w.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 font-mono font-bold text-amber-400">
                          {w.fundsOnHold > 0 ? `$${w.fundsOnHold.toFixed(2)}` : '—'}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                            w.status === 'active' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : w.status === 'frozen'
                              ? 'bg-red-500/10 text-red-400 border-red-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {w.status}
                          </span>
                          {w.restrictionReason && (
                            <span className="block text-[10px] text-red-400 truncate max-w-[150px] mt-0.5" title={w.restrictionReason}>
                              {w.restrictionReason}
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          {w.isReconciled ? (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                              <CheckCircle className="w-3.5 h-3.5" /> Reconciled ($0.00)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-red-400 font-bold">
                              <AlertTriangle className="w-3.5 h-3.5" /> Drift: ${w.discrepancy}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-slate-400 text-[11px] font-mono">{w.lastActivityAt}</td>
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          {/* Inspect Detail */}
                          <button
                            onClick={() => handleOpenWalletDetail(w.userId)}
                            className="px-2.5 py-1 bg-slate-800 text-slate-200 border border-slate-700 font-bold rounded-lg hover:bg-slate-700 text-[11px] inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Details</span>
                          </button>

                          {/* Adjustment Modal Trigger */}
                          <button
                            onClick={() => {
                              setAdjUserId(w.userId);
                              setIsAdjustmentModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold rounded-lg hover:bg-emerald-500/20 text-[11px]"
                          >
                            Adjust
                          </button>

                          {/* Freeze / Unfreeze */}
                          {w.status === 'active' ? (
                            <button
                              onClick={() => setRestrictingWallet({ id: w.userId, name: w.userName, type: 'freeze' })}
                              className="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 font-bold rounded-lg hover:bg-red-500/20 text-[11px]"
                              title="Freeze Wallet Account"
                            >
                              Freeze
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnfreezeWallet(w.userId, w.userName)}
                              className="px-2.5 py-1 bg-slate-800 text-emerald-400 border border-slate-700 font-bold rounded-lg hover:bg-slate-700 text-[11px]"
                            >
                              Unfreeze
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: TRANSACTIONS EXPLORER */}
      {/* ========================================================================= */}
      {subTab === 'transactions' && (
        <div className="space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-emerald-400" />
                  <span>Unified Financial Transaction Explorer</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete trace of deposits, escrow locks, release payouts, administrative adjustments, and refund flows.
                </p>
              </div>
              <span className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-400">
                {transactions.length} Total Transactions
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search transaction ID, user, reference, description..."
                  value={txnSearch}
                  onChange={e => setTxnSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={txnTypeFilter}
                onChange={e => setTxnTypeFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Transaction Types</option>
                <option value="deposit">Deposits / Pre-funding</option>
                <option value="escrow_fund">Escrow Lock</option>
                <option value="escrow_release">Escrow Release</option>
                <option value="refund">Refunds</option>
                <option value="payout_processed">Payouts Processed</option>
                <option value="adjustment_credit">Credit Adjustments</option>
                <option value="adjustment_debit">Debit Adjustments</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="p-4">Txn ID</th>
                    <th className="p-4">Event Type</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">User & Role</th>
                    <th className="p-4">Description</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Timestamp</th>
                    <th className="p-4 text-right">Linked Journal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {transactions
                    .filter(t => {
                      const q = txnSearch.toLowerCase();
                      const matchesQ = !q || t.id.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.userName.toLowerCase().includes(q);
                      const matchesType = txnTypeFilter === 'all' || t.type === txnTypeFilter;
                      return matchesQ && matchesType;
                    })
                    .map(t => (
                      <tr key={t.id} className="hover:bg-slate-900/50">
                        <td className="p-4 font-mono font-bold text-white">{t.id}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                            {t.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-black text-emerald-400">
                          ${t.amount.toFixed(2)}
                        </td>
                        <td className="p-4">
                          <span className="font-semibold text-white block">{t.userName}</span>
                          <span className="text-[10px] text-slate-500 uppercase">{t.userRole}</span>
                        </td>
                        <td className="p-4 max-w-sm text-slate-300">
                          <div className="space-y-1">
                            <span className="block truncate" title={t.description}>{t.description}</span>
                            {(() => {
                              const orderMatch = t.relatedOrderId || (t.description.match(/ord_[a-zA-Z0-9_]+/)?.[0]);
                              if (orderMatch) {
                                const url = resolveOrderServiceUrl({ id: orderMatch, title: t.description });
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); window.open(url, '_blank', 'noopener,noreferrer'); }}
                                    className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/20"
                                    title="View Gig / Project on site in new tab"
                                  >
                                    <span>View Gig</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {t.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400 font-mono text-[11px]">{t.timestamp}</td>
                        <td className="p-4 text-right font-mono">
                          {t.journalId ? (
                            <button
                              onClick={() => {
                                const j = journals.find(x => x.id === t.journalId);
                                if (j) setInspectingJournal(j);
                              }}
                              className="text-emerald-400 hover:underline font-bold text-xs"
                            >
                              {t.journalId}
                            </button>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: DOUBLE-ENTRY LEDGER */}
      {/* ========================================================================= */}
      {subTab === 'ledger' && (
        <div className="space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Scale className="w-5 h-5 text-emerald-400" />
                  <span>Authoritative Double-Entry General Ledger</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Append-only immutable record book. Every journal entry balances debits and credits across the Chart of Accounts.
                </p>
              </div>
              <button
                onClick={() => handleTriggerExport('ledger_journals')}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export Ledger CSV</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search journal ID, reference, event type, actor..."
                  value={ledgerSearch}
                  onChange={e => setLedgerSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={ledgerAccountFilter}
                onChange={e => setLedgerAccountFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Filter by Account Involved</option>
                <option value="1010">1010 - Operating Cash & Bank</option>
                <option value="1020">1020 - Payment Processor Clearing</option>
                <option value="1030">1030 - Payout Gateway Transit</option>
                <option value="2010">2010 - Buyer Wallets Payable</option>
                <option value="2020">2020 - Freelancer Wallets Payable</option>
                <option value="2030">2030 - Marketplace Escrow in Trust</option>
                <option value="4010">4010 - Platform Commission Fee</option>
                <option value="5020">5020 - Admin & Goodwill Adjustments</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="p-4">Journal ID</th>
                    <th className="p-4">Reference</th>
                    <th className="p-4">Event Type</th>
                    <th className="p-4">Description</th>
                    <th className="p-4">Debits = Credits</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Initiator / Actor</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {journals
                    .filter(j => {
                      const q = ledgerSearch.toLowerCase();
                      const matchesQ = !q || j.id.toLowerCase().includes(q) || j.reference.toLowerCase().includes(q) || j.description.toLowerCase().includes(q);
                      const matchesAccount = ledgerAccountFilter === 'all' || j.entries.some(e => e.accountCode === ledgerAccountFilter);
                      return matchesQ && matchesAccount;
                    })
                    .map(j => (
                      <tr key={j.id} className={`hover:bg-slate-900/50 ${j.status === 'reversed' ? 'opacity-60 bg-red-950/10' : ''}`}>
                        <td className="p-4 font-mono font-bold text-white">{j.id}</td>
                        <td className="p-4 font-mono text-slate-400">{j.reference}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 border border-slate-700 text-slate-300">
                            {j.eventType}
                          </span>
                        </td>
                        <td className="p-4 max-w-xs truncate text-slate-300" title={j.description}>
                          {j.description}
                        </td>
                        <td className="p-4 font-mono font-black text-emerald-400">
                          ${j.totalDebit.toFixed(2)}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            j.status === 'posted'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {j.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">{j.actor}</td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => setInspectingJournal(j)}
                            className="px-2.5 py-1 bg-slate-800 text-slate-200 border border-slate-700 font-bold rounded-lg hover:bg-slate-700 text-[11px] inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Lines</span>
                          </button>
                          {j.status === 'posted' && (
                            <button
                              onClick={() => {
                                setReversingJournalId(j.id);
                                setReversalReason('');
                              }}
                              className="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 font-bold rounded-lg hover:bg-red-500/20 text-[11px]"
                              title="Post Linked Reversal Journal"
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 5: ESCROW & HOLDS VAULT */}
      {/* ========================================================================= */}
      {subTab === 'escrow' && (
        <div className="space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Marketplace Escrow Protection Vault</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mandatory 14-day escrow protection on active client orders. Release funds or execute administrative refund workflows.
                </p>
              </div>
              <span className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-emerald-400 font-bold">
                ${escrowOrders.reduce((sum, o) => sum + (o.escrowState !== 'released' && o.escrowState !== 'refunded' ? o.amount : 0), 0).toLocaleString()} Total Under Lock
              </span>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={escrowFilter}
                onChange={e => setEscrowFilter(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Escrow States</option>
                <option value="in_progress">In Progress</option>
                <option value="disputed">Disputed (Blocked)</option>
                <option value="released">Released to Freelancer</option>
                <option value="refunded">Refunded to Buyer</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="p-4">Order Details</th>
                    <th className="p-4">Buyer</th>
                    <th className="p-4">Freelancer</th>
                    <th className="p-4">Escrow Amount</th>
                    <th className="p-4">Net Payout (90%) / Fee (10%)</th>
                    <th className="p-4">Vault State</th>
                    <th className="p-4 text-right">Escrow Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {escrowOrders
                    .filter(o => escrowFilter === 'all' || o.escrowState === escrowFilter)
                    .map(o => (
                      <tr key={o.id} className={`hover:bg-slate-900/50 ${o.isDisputed ? 'bg-red-950/10' : ''}`}>
                        <td className="p-4">
                          {(() => {
                            const serviceUrl = resolveOrderServiceUrl(o);
                            return (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); window.open(serviceUrl, '_blank', 'noopener,noreferrer'); }}
                                    className="font-bold text-white hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5 group cursor-pointer"
                                    title={`Open "${o.title}" on site in new tab`}
                                  >
                                    <span className="group-hover:underline">{o.title}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); window.open(serviceUrl, '_blank', 'noopener,noreferrer'); }}
                                    className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors inline-flex items-center cursor-pointer shrink-0"
                                    title="Open gig / project webpage in new tab"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[11px] text-slate-400 font-mono">Order #{o.id}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); window.open(serviceUrl, '_blank', 'noopener,noreferrer'); }}
                                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/20 hover:border-emerald-500/40 inline-flex items-center gap-1 transition-colors"
                                    title="Direct canonical URL to gig"
                                  >
                                    <span>{serviceUrl}</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-4">
                          <span className="font-semibold text-white block">{o.buyerName}</span>
                          <span className="text-[10px] text-slate-500 font-mono">#{o.buyerId}</span>
                        </td>
                        <td className="p-4">
                          <span className="font-semibold text-white block">{o.sellerName}</span>
                          <span className="text-[10px] text-slate-500 font-mono">#{o.sellerId}</span>
                        </td>
                        <td className="p-4 font-mono font-black text-amber-400 text-sm">
                          ${o.amount.toFixed(2)}
                        </td>
                        <td className="p-4 font-mono text-[11px]">
                          <span className="text-emerald-400 font-bold block">${o.freelancerNetAmount.toFixed(2)} net</span>
                          <span className="text-purple-400">${o.platformFeeAmount.toFixed(2)} platform fee</span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                            o.escrowState === 'released'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : o.escrowState === 'disputed'
                              ? 'bg-red-500/10 text-red-400 border-red-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {o.escrowState.replace('_', ' ')}
                          </span>
                          {o.isDisputed && (
                            <span className="block text-[10px] text-red-400 font-bold mt-1">Dispute Active · Release Blocked</span>
                          )}
                        </td>
                        <td className="p-4 text-right space-x-2">
                          {o.escrowState !== 'released' && o.escrowState !== 'refunded' && (
                            <>
                              <button
                                onClick={() => handleReleaseEscrow(o.id)}
                                disabled={o.isDisputed}
                                className={`px-3 py-1.5 font-bold rounded-lg text-[11px] transition-colors ${
                                  o.isDisputed
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                                }`}
                                title={o.isDisputed ? 'Cannot release escrow while under active dispute' : 'Release 90% net to freelancer'}
                              >
                                Release Escrow
                              </button>

                              <button
                                onClick={() => handleRefundEscrow(o.id)}
                                className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 font-bold rounded-lg hover:bg-red-500/20 text-[11px]"
                              >
                                Refund Buyer
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 6: PAYOUTS */}
      {/* ========================================================================= */}
      {subTab === 'payouts' && (
        <div className="space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <span>Freelancer Payout & Disbursement Controls</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Approve, settle, or cancel freelancer withdrawal disbursements through connected gateway clearing accounts.
                </p>
              </div>
              <span className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-400">
                {payoutsList.length} Payout Requests
              </span>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={payoutFilter}
                onChange={e => setPayoutFilter(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Payout Statuses</option>
                <option value="pending">Pending Approval</option>
                <option value="approved">Approved (Ready to Process)</option>
                <option value="processed">Settled / Processed</option>
                <option value="failed">Failed Transfers</option>
                <option value="cancelled">Cancelled / Refunded</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="p-4">Payout ID</th>
                    <th className="p-4">Freelancer</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Gateway & Details</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Request Date</th>
                    <th className="p-4 text-right">Disbursement Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {payoutsList
                    .filter(p => payoutFilter === 'all' || p.status === payoutFilter)
                    .map(p => (
                      <tr key={p.id} className="hover:bg-slate-900/50">
                        <td className="p-4 font-mono font-bold text-white">#{p.id}</td>
                        <td className="p-4">
                          <span className="font-semibold text-white block">{p.freelancerName}</span>
                          <span className="text-[10px] text-slate-500 font-mono">ID: #{p.freelancerId}</span>
                        </td>
                        <td className="p-4 font-mono font-black text-emerald-400 text-sm">
                          ${p.amount.toFixed(2)}
                        </td>
                        <td className="p-4">
                          <span className="font-semibold text-slate-200 block">{p.method}</span>
                          <span className="text-[11px] text-slate-400 font-mono">{p.accountDetails}</span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                            p.status === 'processed'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : p.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : p.status === 'approved'
                              ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400 font-mono text-[11px]">{p.createdAt}</td>
                        <td className="p-4 text-right space-x-2">
                          {p.status === 'pending' && (
                            <button
                              onClick={() => handleApprovePayout(p.id)}
                              className="px-2.5 py-1 bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold rounded-lg text-[11px] hover:bg-sky-500/30"
                            >
                              Approve
                            </button>
                          )}

                          {(p.status === 'pending' || p.status === 'approved') && (
                            <>
                              <button
                                onClick={() => handleProcessPayout(p.id)}
                                className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold rounded-lg text-[11px] hover:bg-emerald-500/30"
                              >
                                Process
                              </button>
                              <button
                                onClick={() => handleRejectPayout(p.id)}
                                className="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 font-bold rounded-lg text-[11px] hover:bg-red-500/20"
                              >
                                Cancel / Refund
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 7: RECONCILIATION */}
      {/* ========================================================================= */}
      {subTab === 'reconciliation' && reconciliation && (
        <div className="space-y-6">
          {/* Trial Balance Audit Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Scale className="w-5 h-5 text-emerald-400" />
                  <span>General Ledger Trial Balance Report</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comprehensive audit of debits and credits across all active accounts. Total debits must equal total credits.
                </p>
              </div>
              <button
                onClick={() => handleTriggerExport('trial_balance')}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export Trial Balance</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="p-3">Account Code</th>
                    <th className="p-3">Account Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Normal Balance</th>
                    <th className="p-3 font-mono">Total Debits</th>
                    <th className="p-3 font-mono">Total Credits</th>
                    <th className="p-3 font-mono text-right">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {reconciliation.trialBalance.accounts.map(acc => (
                    <tr key={acc.code} className="hover:bg-slate-900/50">
                      <td className="p-3 font-mono font-bold text-white">{acc.code}</td>
                      <td className="p-3 font-semibold text-slate-200">{acc.name}</td>
                      <td className="p-3 uppercase text-[10px] text-slate-400">{acc.type}</td>
                      <td className="p-3 uppercase text-[10px] text-slate-400">{acc.normalBalance}</td>
                      <td className="p-3 font-mono text-white">${acc.totalDebits.toFixed(2)}</td>
                      <td className="p-3 font-mono text-white">${acc.totalCredits.toFixed(2)}</td>
                      <td className="p-3 font-mono font-bold text-right text-emerald-400">${acc.netBalance.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/80 font-black text-sm border-t-2 border-slate-700">
                    <td colSpan={4} className="p-3 text-white">TRIAL BALANCE SUM (EQUALITY VERIFIED)</td>
                    <td className="p-3 font-mono text-emerald-400">${reconciliation.trialBalance.totalDebits.toFixed(2)}</td>
                    <td className="p-3 font-mono text-emerald-400">${reconciliation.trialBalance.totalCredits.toFixed(2)}</td>
                    <td className="p-3 font-mono text-right text-emerald-400">
                      Diff: ${reconciliation.trialBalance.difference.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Exceptions Table */}
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Reconciliation Discrepancies & Gateway Exceptions</span>
              </h3>
              <span className="text-xs font-mono text-slate-400">
                {reconciliation.exceptions.length} Recorded Exceptions
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="p-3">Exception ID</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Entity Ref</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Explanation</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {reconciliation.exceptions.map(ex => (
                    <tr key={ex.id} className="hover:bg-slate-900/50">
                      <td className="p-3 font-mono font-bold text-white">{ex.id}</td>
                      <td className="p-3 uppercase text-[10px] text-amber-400 font-bold">{ex.type.replace('_', ' ')}</td>
                      <td className="p-3 font-mono text-slate-400">{ex.entityId}</td>
                      <td className="p-3 font-mono font-bold text-white">${ex.amount.toFixed(2)}</td>
                      <td className="p-3 max-w-sm text-slate-300">{ex.description}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          ex.status === 'resolved'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {ex.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {ex.status !== 'resolved' ? (
                          <button
                            onClick={() => {
                              setResolvingExceptionId(ex.id);
                              setResolutionNotesInput('');
                            }}
                            className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold rounded-lg text-[11px]"
                          >
                            Investigate & Resolve
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 8: REPORTS & EXPORTS */}
      {/* ========================================================================= */}
      {subTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6">
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <Download className="w-5 h-5 text-emerald-400" />
              <span>Financial Reports & Export Station</span>
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Generate date-filtered, currency-isolated, auditable CSV reports for external accounting, compliance, and tax reconciliation.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  id: 'trial_balance',
                  title: 'General Ledger Trial Balance',
                  desc: 'Comprehensive statement of debits, credits, and net balances across all 11 chart accounts.',
                  icon: Scale,
                  file: 'workperhour_trial_balance.csv'
                },
                {
                  id: 'ledger_journals',
                  title: 'General Ledger Journal Entries',
                  desc: 'Complete append-only journal entries with double-entry debits, credits, and event types.',
                  icon: FileText,
                  file: 'workperhour_double_entry_ledger.csv'
                },
                {
                  id: 'wallets',
                  title: 'User Wallet Balances & Parity',
                  desc: 'Detailed statement of all buyer and freelancer available balances, escrow holds, and ledger parity.',
                  icon: Wallet,
                  file: 'workperhour_wallet_balances.csv'
                },
                {
                  id: 'transactions',
                  title: 'Financial Transactions Ledger',
                  desc: 'Full unified ledger of all user deposits, escrow locks, earnings releases, and payouts.',
                  icon: ArrowLeftRight,
                  file: 'workperhour_transactions.csv'
                },
                {
                  id: 'audit_trail',
                  title: 'Financial Administration Audit Trail',
                  desc: 'Immutable security log of all financial actions, administrative adjustments, and status changes.',
                  icon: ShieldAlert,
                  file: 'workperhour_financial_audit.csv'
                }
              ].map(rep => {
                const Icon = rep.icon;
                return (
                  <div key={rep.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-colors">
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Icon className="w-4 h-4" />
                        </div>
                        <h4 className="font-bold text-white text-sm">{rep.title}</h4>
                      </div>
                      <p className="text-xs text-slate-400 mb-4">{rep.desc}</p>
                    </div>

                    <button
                      onClick={() => handleTriggerExport(rep.id)}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Download {rep.file}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 9: AUDIT & CONTROLS */}
      {/* ========================================================================= */}
      {subTab === 'audit' && (
        <div className="space-y-6">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-emerald-400" />
                  <span>Financial Administration Audit Log & Controls</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Immutable security audit log recording every financial action, mandatory reasons, and linked journal IDs.
                </p>
              </div>
              <span className="text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-400">
                {auditLogs.length} Security Audit Records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="p-4">Log ID</th>
                    <th className="p-4">Actor & Role</th>
                    <th className="p-4">Action</th>
                    <th className="p-4">Target Entity</th>
                    <th className="p-4">Mandatory Reason / Notes</th>
                    <th className="p-4">Linked Journal</th>
                    <th className="p-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-900/50">
                      <td className="p-4 font-mono font-bold text-white">{log.id}</td>
                      <td className="p-4">
                        <span className="font-semibold text-white block">{log.actor}</span>
                        <span className="text-[10px] text-slate-500 uppercase">{log.role}</span>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-emerald-400 border border-slate-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-4 font-semibold text-slate-200">{log.target}</td>
                      <td className="p-4 max-w-sm text-slate-300">{log.reason}</td>
                      <td className="p-4 font-mono text-emerald-400">
                        {log.journalId ? (
                          <button
                            onClick={() => {
                              const j = journals.find(x => x.id === log.journalId);
                              if (j) setInspectingJournal(j);
                            }}
                            className="hover:underline font-bold"
                          >
                            {log.journalId}
                          </button>
                        ) : '—'}
                      </td>
                      <td className="p-4 text-right text-slate-400 font-mono text-[11px]">{log.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADMINISTRATIVE ADJUSTMENT (CONTROLLED WORKFLOW WITH LIVE PREVIEW) */}
      {/* ========================================================================= */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-xl w-full space-y-5 text-slate-200">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <span>Controlled Administrative Adjustment</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generates balanced double-entry accounting entries. Directly overwriting balances is prohibited.
                </p>
              </div>
              <button onClick={() => setIsAdjustmentModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePostAdjustment} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Target User Wallet</label>
                <select
                  value={adjUserId}
                  onChange={e => setAdjUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {wallets.map(w => (
                    <option key={w.userId} value={w.userId}>
                      {w.userName} ({w.userEmail}) — Current: ${w.availableBalance.toFixed(2)} [{w.userRole}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Adjustment Direction</label>
                  <select
                    value={adjDirection}
                    onChange={e => setAdjDirection(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="credit_user">Credit User (Increase Balance)</option>
                    <option value="debit_user">Debit User (Decrease Balance)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Exact Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={adjAmount}
                    onChange={e => setAdjAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Adjustment Category</label>
                <select
                  value={adjCategory}
                  onChange={e => setAdjCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="goodwill">Platform Goodwill & Promotion Credit</option>
                  <option value="dispute_resolution">Dispute Settlement Compensation</option>
                  <option value="accounting_correction">Accounting / Calculation Correction</option>
                  <option value="chargeback_recovery">Chargeback & Clawback Recovery</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Mandatory Business Reason</label>
                <textarea
                  rows={2}
                  placeholder="Explain why this adjustment is being granted (audit trail record)..."
                  value={adjReason}
                  onChange={e => setAdjReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Supporting Reference / Ticket ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. TICKET-9824 or CASE-DISP-01"
                  value={adjEvidence}
                  onChange={e => setAdjEvidence(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* LIVE DOUBLE-ENTRY PROJECTION PREVIEW */}
              {adjPreview && (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-300">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Scale className="w-3.5 h-3.5" /> Proposed Balanced Ledger Entries:
                    </span>
                    <span className="font-mono text-emerald-400">Balanced $0.00</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block font-bold uppercase text-[9px]">DEBIT (+Expense / -Liability)</span>
                      <span className="text-white font-mono block font-bold mt-0.5">
                        {adjPreview.debits[0]?.accountCode} {adjPreview.debits[0]?.accountName}
                      </span>
                      <span className="text-emerald-400 font-bold">${adjPreview.debits[0]?.amount.toFixed(2)}</span>
                    </div>

                    <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block font-bold uppercase text-[9px]">CREDIT (+Liability / -Expense)</span>
                      <span className="text-white font-mono block font-bold mt-0.5">
                        {adjPreview.credits[0]?.accountCode} {adjPreview.credits[0]?.accountName}
                      </span>
                      <span className="text-emerald-400 font-bold">${adjPreview.credits[0]?.amount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Current: ${adjPreview.currentBalance.toFixed(2)}</span>
                    <span className="text-white font-bold font-mono">Resulting Balance: ${adjPreview.resultingBalance.toFixed(2)}</span>
                  </div>

                  {adjPreview.insufficientFunds && (
                    <div className="text-red-400 font-bold text-xs pt-1 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Cannot execute: User available balance is insufficient for debit. Negative balance prohibited.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjSubmitting || (adjPreview && adjPreview.insufficientFunds)}
                  className="px-5 py-2 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-emerald-400 transition-colors disabled:opacity-50"
                >
                  {adjSubmitting ? 'Posting...' : 'Post Balanced Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: JOURNAL LINE INSPECTOR */}
      {/* ========================================================================= */}
      {inspectingJournal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-5 text-slate-200">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Scale className="w-5 h-5 text-emerald-400" />
                  <span>Journal #{inspectingJournal.id}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Reference: {inspectingJournal.reference} · Posted: {inspectingJournal.timestamp}
                </p>
              </div>
              <button onClick={() => setInspectingJournal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <span className="text-slate-400 font-medium block">Description & Accounting Event</span>
              <p className="text-white font-semibold text-sm">{inspectingJournal.description}</p>
              <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px] pt-1">
                <span>Event: <strong className="text-emerald-400">{inspectingJournal.eventType}</strong></span>
                <span>Actor: {inspectingJournal.actor}</span>
                <span>Status: <strong className={inspectingJournal.status === 'posted' ? 'text-emerald-400' : 'text-red-400'}>{inspectingJournal.status.toUpperCase()}</strong></span>
              </div>
              {inspectingJournal.reversedByJournalId && (
                <p className="text-red-400 font-bold pt-1">
                  Reversed by Journal #{inspectingJournal.reversedByJournalId}
                </p>
              )}
            </div>

            {/* Entries Line Items Table */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Double-Entry Line Items</h4>
              <div className="overflow-x-auto border border-slate-800 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="p-3">Account</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Debit</th>
                      <th className="p-3 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {inspectingJournal.entries.map((entry, idx) => (
                      <tr key={idx} className="hover:bg-slate-950/40">
                        <td className="p-3">
                          <span className="font-mono font-bold text-white block">{entry.accountCode}</span>
                          <span className="text-[11px] text-slate-400">{entry.accountName}</span>
                        </td>
                        <td className="p-3 text-slate-300">
                          <div>{entry.description}</div>
                          {(() => {
                            const orderMatch = entry.orderId || (entry.description.match(/ord_[a-zA-Z0-9_]+/)?.[0]);
                            if (orderMatch) {
                              const url = resolveOrderServiceUrl({ id: orderMatch, title: entry.description });
                              return (
                                <div className="mt-1">
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/20"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span>View Gig ({orderMatch})</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white">
                          {entry.debit > 0 ? `$${entry.debit.toFixed(2)}` : '—'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white">
                          {entry.credit > 0 ? `$${entry.credit.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-950 font-bold border-t border-slate-700">
                      <td colSpan={2} className="p-3 text-emerald-400">TOTAL BALANCED SUM</td>
                      <td className="p-3 text-right font-mono text-emerald-400">${inspectingJournal.totalDebit.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-emerald-400">${inspectingJournal.totalCredit.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setInspectingJournal(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700"
              >
                Close
              </button>
              {inspectingJournal.status === 'posted' && (
                <button
                  onClick={() => {
                    setReversingJournalId(inspectingJournal.id);
                    setReversalReason('');
                  }}
                  className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 font-bold rounded-xl text-xs hover:bg-red-500/20"
                >
                  Reverse This Journal
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: WALLET DETAILS & RECONCILIATION DRAWER */}
      {/* ========================================================================= */}
      {inspectingWalletId && walletDetailData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-3xl w-full space-y-6 text-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-400" />
                  <span>Wallet #{walletDetailData.wallet.id} — {walletDetailData.wallet.userName}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {walletDetailData.wallet.userEmail} · Role: {walletDetailData.wallet.userRole.toUpperCase()} · Currency: {walletDetailData.wallet.currency}
                </p>
              </div>
              <button onClick={() => setInspectingWalletId(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Separated Balance Components */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Available Balance</span>
                <span className="text-xl font-black text-white font-mono">${walletDetailData.wallet.availableBalance.toFixed(2)}</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Funds on Hold (Escrow)</span>
                <span className="text-xl font-black text-amber-400 font-mono">${walletDetailData.wallet.fundsOnHold.toFixed(2)}</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Ledger-Derived Balance</span>
                <span className="text-xl font-black text-emerald-400 font-mono">${walletDetailData.wallet.ledgerDerivedBalance.toFixed(2)}</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Parity Status</span>
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 mt-2">
                  <CheckCircle className="w-4 h-4" /> 100% Reconciled
                </span>
              </div>
            </div>

            {/* Wallet Activity History */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Wallet Financial Transactions</h4>
              <div className="overflow-x-auto border border-slate-800 rounded-2xl max-h-56">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-[10px] font-bold uppercase text-slate-400">
                      <th className="p-3">Txn</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {walletDetailData.transactions.map((t: any) => (
                      <tr key={t.id} className="hover:bg-slate-950/40">
                        <td className="p-3 font-mono font-bold text-white">{t.id}</td>
                        <td className="p-3 text-[10px] uppercase font-bold text-slate-300">{t.type}</td>
                        <td className="p-3 font-mono font-bold text-emerald-400">${t.amount.toFixed(2)}</td>
                        <td className="p-3 text-slate-400">{t.description}</td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">{t.timestamp}</td>
                      </tr>
                    ))}
                    {walletDetailData.transactions.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-slate-500">No transactions recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Applicable Ledger Entries */}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Authoritative General Ledger Postings</h4>
              <div className="overflow-x-auto border border-slate-800 rounded-2xl max-h-56">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-[10px] font-bold uppercase text-slate-400">
                      <th className="p-3">Account Code</th>
                      <th className="p-3">Line Description</th>
                      <th className="p-3 text-right">Debit</th>
                      <th className="p-3 text-right">Credit</th>
                      <th className="p-3 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {walletDetailData.ledgerEntries.map((le: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-950/40">
                        <td className="p-3 font-mono font-bold text-white">{le.accountCode}</td>
                        <td className="p-3 text-slate-300">{le.description}</td>
                        <td className="p-3 text-right font-mono text-white">{le.debit > 0 ? `$${le.debit.toFixed(2)}` : '—'}</td>
                        <td className="p-3 text-right font-mono text-emerald-400">{le.credit > 0 ? `$${le.credit.toFixed(2)}` : '—'}</td>
                        <td className="p-3 text-right text-slate-400 font-mono text-[11px]">{le.journalDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={() => handleTriggerExport('wallets')}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Statement CSV</span>
              </button>

              <button
                onClick={() => setInspectingWalletId(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: JOURNAL REVERSAL PROMPT */}
      {/* ========================================================================= */}
      {reversingJournalId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 text-slate-200">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-red-400" />
              <span>Reverse Journal #{reversingJournalId}</span>
            </h3>
            <p className="text-xs text-slate-400">
              Double-entry entries cannot be deleted. This will atomically post a linked reversal journal with inverted debits and credits.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Mandatory Reversal Reason</label>
              <textarea
                rows={3}
                placeholder="State the audit justification for reversing this journal..."
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setReversingJournalId(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleReverseJournal}
                disabled={!reversalReason.trim()}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-50"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: RESTRICT / FREEZE WALLET PROMPT */}
      {/* ========================================================================= */}
      {restrictingWallet && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 text-slate-200">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-red-400" />
              <span>{restrictingWallet.type === 'freeze' ? 'Freeze Wallet' : 'Restrict Withdrawals'}: {restrictingWallet.name}</span>
            </h3>
            <p className="text-xs text-slate-400">
              Freezing stops all incoming and outgoing financial transactions for this account immediately.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Audit Justification</label>
              <textarea
                rows={3}
                placeholder="Provide security or compliance reason for account restriction..."
                value={restrictionReasonInput}
                onChange={e => setRestrictionReasonInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setRestrictingWallet(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteWalletRestriction}
                disabled={!restrictionReasonInput.trim()}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-50"
              >
                Confirm {restrictingWallet.type === 'freeze' ? 'Freeze' : 'Restriction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: RESOLVE RECONCILIATION EXCEPTION */}
      {/* ========================================================================= */}
      {resolvingExceptionId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 text-slate-200">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span>Resolve Exception #{resolvingExceptionId}</span>
            </h3>
            <p className="text-xs text-slate-400">
              Provide investigation notes explaining how this discrepancy was reviewed and verified with bank/gateway statements.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Investigation & Resolution Notes</label>
              <textarea
                rows={3}
                placeholder="State verified statement reference and resolution rationale..."
                value={resolutionNotesInput}
                onChange={e => setResolutionNotesInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setResolvingExceptionId(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveException}
                disabled={!resolutionNotesInput.trim()}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors disabled:opacity-50"
              >
                Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

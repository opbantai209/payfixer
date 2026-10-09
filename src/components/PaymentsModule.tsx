import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, FileText, Settings, Calculator, ChevronRight, 
  ArrowUpRight, ArrowDownLeft, CreditCard, Building2, Plus, 
  Download, Printer, CheckCircle2, AlertCircle, Clock, Search, 
  Filter, DollarSign, Wallet, RefreshCw, X, Check, Lock, 
  ExternalLink, Trash2, Star, Sparkles, Send
} from 'lucide-react';
import { 
  UserAccount, Gig, Order, Project, Proposal, 
  PaymentMethodItem, InvoiceItem 
} from '../types';

interface PaymentsModuleProps {
  gigs?: Gig[];
  orders?: Order[];
  projects?: Project[];
  proposals?: Proposal[];
  currentUser?: UserAccount;
  onBalanceUpdate?: () => void;
}

interface UserFinancialSummary {
  userId: string;
  availableBalance: number;
  buyerEscrowAmount: number;
  freelancerEscrowAmount: number;
  buyerEscrowOrders: Order[];
  freelancerEscrowOrders: Order[];
  paidToDate: number;
  paidThisMonth: number;
  earnedToDate: number;
  earnedThisMonth: number;
  earnedPastTwoMonths: number;
  clearingPeriodDays: number;
  paymentMethods: PaymentMethodItem[];
  walletStatus: string;
}

interface TransactionItem {
  id: string;
  type: string;
  amount: number;
  currency: string;
  timestamp: string;
  status: string;
  userId: string;
  userName?: string;
  description: string;
  relatedOrderId?: string;
  providerReference?: string;
}

export const PaymentsModule: React.FC<PaymentsModuleProps> = ({
  gigs = [],
  orders = [],
  projects = [],
  proposals = [],
  currentUser = {
    id: 'user_1',
    name: 'Elena Rostova',
    email: 'elena@example.com',
    role: 'user',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
    title: 'Senior Full-Stack Architect',
    rating: 4.9,
    reviewsCount: 142,
    hourlyRate: 85,
    earned: 48500,
    completedJobs: 165,
    bio: '',
    skills: [],
    status: 'active',
    verified: true,
    walletBalance: 4250,
    createdAt: '2025-01-15'
  },
  onBalanceUpdate
}) => {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'money' | 'statements' | 'invoices' | 'transactions' | 'methods'>('money');
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'GBP'>('USD');
  
  // Expandable Account Breakdown States
  const [showAccountDetails, setShowAccountDetails] = useState<boolean>(false);
  const [showBuyerEscrowDetails, setShowBuyerEscrowDetails] = useState<boolean>(true);
  const [showFreelancerEscrowDetails, setShowFreelancerEscrowDetails] = useState<boolean>(true);

  // Data States
  const [summary, setSummary] = useState<UserFinancialSummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [savedMethods, setSavedMethods] = useState<PaymentMethodItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters & Search
  const [statementRange, setStatementRange] = useState<'30days' | 'month' | 'prev_month' | 'year' | 'all'>('30days');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'paid' | 'in_escrow' | 'unpaid'>('all');
  const [txnFilter, setTxnFilter] = useState<'all' | 'earnings' | 'deposits' | 'escrow' | 'withdrawals'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isDepositModalOpen, setIsDepositModalOpen] = useState<boolean>(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState<boolean>(false);
  const [isEscrowReleaseModalOpen, setIsEscrowReleaseModalOpen] = useState<boolean>(false);
  const [isEscrowRefundModalOpen, setIsEscrowRefundModalOpen] = useState<boolean>(false);
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState<boolean>(false);
  const [isViewInvoiceModalOpen, setIsViewInvoiceModalOpen] = useState<boolean>(false);
  const [isCalculatorModalOpen, setIsCalculatorModalOpen] = useState<boolean>(false);
  const [isAddMethodModalOpen, setIsAddMethodModalOpen] = useState<boolean>(false);

  // Active Item for Modal Context
  const [selectedOrderForAction, setSelectedOrderForAction] = useState<Order | null>(null);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<InvoiceItem | null>(null);

  // Form Inputs
  const [depositAmount, setDepositAmount] = useState<string>('250');
  const [depositMethod, setDepositMethod] = useState<string>('Visa ending in 4242');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('500');
  const [withdrawMethod, setWithdrawMethod] = useState<string>('Bank Transfer');
  const [withdrawAccountDetails, setWithdrawAccountDetails] = useState<string>('Chase Premier Checking (•••• 8821)');
  const [refundReason, setRefundReason] = useState<string>('Project requirements changed / mutual agreement');

  // Calculator State
  const [calcAmount, setCalcAmount] = useState<number>(2500);

  // New Invoice Form
  const [newInvoiceData, setNewInvoiceData] = useState({
    recipientName: '',
    recipientEmail: '',
    title: '',
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    itemDesc: '',
    itemQty: '1',
    itemPrice: '500',
    notes: 'Payment due within 14 days under WorkPerHour Escrow Protection.'
  });

  // New Payment Method Form
  const [newMethodData, setNewMethodData] = useState({
    type: 'card' as 'card' | 'bank' | 'paypal' | 'upi',
    name: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    bankName: '',
    accountNumber: '',
    routingNumber: '',
    paypalEmail: '',
    upiId: '',
    isDefault: false
  });

  const currencyRates = { USD: 1, EUR: 0.92, GBP: 0.79 };
  const currencySymbols = { USD: '$', EUR: '€', GBP: '£' };

  const formatMoney = (amountInUSD: number): string => {
    const rate = currencyRates[currency];
    const converted = amountInUSD * rate;
    return `${currencySymbols[currency]}${converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // Fetch Financial Data for Current User
  const fetchFinancialData = async () => {
    if (!currentUser || !currentUser.id) return;
    setLoading(true);
    try {
      const [uRes, tRes, iRes, mRes] = await Promise.all([
        fetch(`/api/payments/user/${currentUser.id}`),
        fetch(`/api/payments/transactions/${currentUser.id}`),
        fetch(`/api/payments/invoices/${currentUser.id}`),
        fetch(`/api/payments/methods/${currentUser.id}`)
      ]);

      if (uRes.ok) {
        const uData = await uRes.json();
        setSummary(uData);
      }
      if (tRes.ok) {
        const tData = await tRes.json();
        setTransactions(tData);
      }
      if (iRes.ok) {
        const iData = await iRes.json();
        setInvoices(iData);
      }
      if (mRes.ok) {
        const mData = await mRes.json();
        setSavedMethods(mData);
      }
    } catch (err) {
      console.error('Error fetching payments data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancialData();
  }, [currentUser?.id]);

  // Derived Escrow Orders
  const currentUserId = currentUser?.id || 'user_1';
  
  const buyerEscrowOrders = useMemo(() => {
    return orders.filter(o => o.buyerId === currentUserId && ['funded_in_escrow', 'in_progress'].includes(o.status));
  }, [orders, currentUserId]);

  const freelancerEscrowOrders = useMemo(() => {
    return orders.filter(o => o.sellerId === currentUserId && ['funded_in_escrow', 'in_progress', 'delivered'].includes(o.status));
  }, [orders, currentUserId]);

  const currentAvailableBalance = summary?.availableBalance ?? currentUser?.walletBalance ?? 0;
  const currentBuyerEscrow = buyerEscrowOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
  const currentFreelancerEscrow = freelancerEscrowOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

  // Derived Control Panel Stats
  const paidToDateCalc = summary?.paidToDate ?? orders.filter(o => o.buyerId === currentUserId).reduce((sum, o) => sum + o.amount, 0);
  const earnedToDateCalc = summary?.earnedToDate ?? (currentUser?.earned || 0);

  // ==========================================
  // ACTION HANDLERS
  // ==========================================

  // 1. Deposit Action
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid deposit amount greater than $0', 'error');
      return;
    }

    try {
      const res = await fetch('/api/payments/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          amount,
          paymentMethod: depositMethod,
          providerReference: `DEP-${Date.now().toString(36).toUpperCase()}`
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deposit failed');

      showToast(`Successfully deposited ${formatMoney(amount)} into your account!`, 'success');
      setIsDepositModalOpen(false);
      setDepositAmount('250');
      fetchFinancialData();
      onBalanceUpdate?.();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 2. Withdraw Action
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid withdrawal amount', 'error');
      return;
    }
    if (amount > currentAvailableBalance) {
      showToast(`Requested amount exceeds available balance (${formatMoney(currentAvailableBalance)})`, 'error');
      return;
    }

    try {
      const res = await fetch('/api/payments/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          amount,
          method: withdrawMethod,
          accountDetails: withdrawAccountDetails
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Withdrawal failed');

      showToast(`Withdrawal of ${formatMoney(amount)} requested via ${withdrawMethod}. Processing in 1-2 business days.`, 'success');
      setIsWithdrawModalOpen(false);
      fetchFinancialData();
      onBalanceUpdate?.();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 3. Release Escrow Action
  const handleReleaseEscrowSubmit = async () => {
    if (!selectedOrderForAction) return;
    try {
      const res = await fetch('/api/payments/escrow/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrderForAction.id,
          userId: currentUserId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Escrow release failed');

      showToast(`Escrow of $${selectedOrderForAction.amount.toFixed(2)} successfully released to freelancer! Order marked completed.`, 'success');
      setIsEscrowReleaseModalOpen(false);
      setSelectedOrderForAction(null);
      fetchFinancialData();
      onBalanceUpdate?.();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 4. Refund Escrow Action
  const handleRefundEscrowSubmit = async () => {
    if (!selectedOrderForAction) return;
    try {
      const res = await fetch('/api/payments/escrow/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrderForAction.id,
          userId: currentUserId,
          reason: refundReason
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Escrow refund failed');

      showToast(`Escrow of $${selectedOrderForAction.amount.toFixed(2)} refunded back to your available balance.`, 'success');
      setIsEscrowRefundModalOpen(false);
      setSelectedOrderForAction(null);
      fetchFinancialData();
      onBalanceUpdate?.();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 5. Create Invoice Action
  const handleCreateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvoiceData.recipientName || !newInvoiceData.title) {
      showToast('Client name and invoice title are required', 'error');
      return;
    }

    try {
      const qty = parseFloat(newInvoiceData.itemQty) || 1;
      const rate = parseFloat(newInvoiceData.itemPrice) || 100;
      const totalAmount = qty * rate;

      const res = await fetch('/api/payments/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          recipientName: newInvoiceData.recipientName,
          recipientEmail: newInvoiceData.recipientEmail,
          title: newInvoiceData.title,
          dueDate: newInvoiceData.dueDate,
          items: [{
            description: newInvoiceData.itemDesc || newInvoiceData.title,
            quantity: qty,
            unitPrice: rate,
            amount: totalAmount
          }],
          notes: newInvoiceData.notes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invoice creation failed');

      showToast(`Invoice #${data.invoiceNumber} created successfully!`, 'success');
      setIsCreateInvoiceModalOpen(false);
      fetchFinancialData();
      setActiveTab('invoices');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 6. Add Payment Method Action
  const handleAddPaymentMethodSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let displayName = newMethodData.name;
      let detailsObj: any = {};

      if (newMethodData.type === 'card') {
        const last4 = newMethodData.cardNumber.slice(-4) || '4242';
        displayName = displayName || `Card ending in ${last4}`;
        detailsObj = {
          last4,
          brand: 'Visa',
          expiry: newMethodData.cardExpiry || '12/28'
        };
      } else if (newMethodData.type === 'bank') {
        const last4 = newMethodData.accountNumber.slice(-4) || '9901';
        displayName = displayName || `${newMethodData.bankName || 'Bank Account'} (•••• ${last4})`;
        detailsObj = {
          bankName: newMethodData.bankName || 'Premier Bank',
          accountNumberMasked: `•••• ${last4}`,
          routingNumber: newMethodData.routingNumber || '021000021'
        };
      } else if (newMethodData.type === 'paypal') {
        displayName = displayName || `PayPal (${newMethodData.paypalEmail || currentUser.email})`;
        detailsObj = { email: newMethodData.paypalEmail || currentUser.email };
      } else if (newMethodData.type === 'upi') {
        displayName = displayName || `UPI ID (${newMethodData.upiId || 'username@upi'})`;
        detailsObj = { upiId: newMethodData.upiId };
      }

      const res = await fetch('/api/payments/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          type: newMethodData.type,
          name: displayName,
          details: detailsObj,
          isDefault: newMethodData.isDefault
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add payment method');

      showToast(`Payment method "${displayName}" added successfully!`, 'success');
      setIsAddMethodModalOpen(false);
      fetchFinancialData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 7. Delete Payment Method Action
  const handleDeletePaymentMethod = async (methodId: string) => {
    try {
      const res = await fetch(`/api/payments/methods/${methodId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete payment method');
      showToast('Payment method removed.', 'success');
      fetchFinancialData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 8. Set Default Payment Method Action
  const handleSetDefaultPaymentMethod = async (methodId: string) => {
    try {
      const res = await fetch(`/api/payments/methods/${methodId}/default`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to set default payment method');
      showToast('Default payment method updated.', 'success');
      fetchFinancialData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 9. Download CSV for Statements / Transactions
  const handleExportCsv = (type: 'transactions' | 'statement') => {
    const header = 'Date,Transaction ID,Type,Description,Amount (USD),Status\n';
    const rows = transactions.map(t => 
      `"${t.timestamp}","${t.id}","${t.type}","${t.description.replace(/"/g, '""')}","${t.amount.toFixed(2)}","${t.status}"`
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `WorkPerHour_${type}_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${transactions.length} records to CSV!`, 'success');
  };

  // Tabs Configuration
  const tabs = [
    { id: 'money', label: 'My Money', icon: Wallet },
    { id: 'statements', label: 'Statements', icon: FileText },
    { id: 'invoices', label: 'Invoices', icon: CheckCircle2 },
    { id: 'transactions', label: 'Transactions', icon: ArrowUpRight },
    { id: 'methods', label: 'Payment methods', icon: CreditCard },
  ];

  // Fee calculation for calculator modal
  const calcFee = useMemo(() => {
    if (calcAmount <= 7000) {
      const fee = calcAmount * 0.075;
      return { tier1Fee: fee, tier2Fee: 0, totalFee: fee, net: calcAmount - fee };
    } else {
      const tier1Fee = 7000 * 0.075;
      const tier2Fee = (calcAmount - 7000) * 0.035;
      const totalFee = tier1Fee + tier2Fee;
      return { tier1Fee, tier2Fee, totalFee, net: calcAmount - totalFee };
    }
  }, [calcAmount]);

  // Account Card Component
  const AccountCard = ({ 
    title, 
    desc, 
    amount, 
    badge, 
    active, 
    onClick 
  }: { 
    title: string; 
    desc: string; 
    amount: number; 
    badge?: string; 
    active?: boolean; 
    onClick?: () => void; 
  }) => (
    <div 
      className={`bg-white border rounded-2xl p-6 transition-all duration-200 select-none ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-emerald-300' : ''
      } ${active ? 'border-emerald-500 shadow-sm ring-2 ring-emerald-500/10' : 'border-slate-200'}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        {badge && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">{desc}</p>
      
      <div className="pt-2 border-t border-slate-100 flex items-end justify-between">
        <div>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Balance</span>
          <span className="text-2xl font-extrabold text-slate-900">{formatMoney(amount)}</span>
        </div>
        {onClick && (
          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            {active ? 'Hide details' : 'View breakdown'} <ChevronRight size={14} />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Toast Notification Banner */}
      {feedbackMsg && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-sm font-semibold transition-all shadow-sm ${
          feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-500 hover:text-slate-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header with Title, Currency Switcher, and User Profile Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Payments & Escrow</h1>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              Live & Secure
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage your wallet balances, track protected escrow funds, invoices, statements, and payouts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Currency Toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 text-xs font-bold">
            {(['USD', 'EUR', 'GBP'] as const).map(curr => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  currency === curr ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchFinancialData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition"
            title="Refresh Financial Data"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-emerald-600' : 'text-slate-500'} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Quick Deposit Button */}
          <button
            onClick={() => setIsDepositModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-xs hover:shadow transition"
          >
            <Plus size={16} />
            <span>Deposit</span>
          </button>
        </div>
      </div>

      {/* Main Layout: Left Content & Right Sidebar */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Column: Navigation Tabs & Tab Panels */}
        <div className="flex-1 space-y-6">
          {/* Tab Navigation Strip */}
          <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-bold transition-all border-b-2 -mb-px ${
                    isActive 
                      ? 'border-emerald-600 text-emerald-700' 
                      : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
                  }`}
                  onClick={() => setActiveTab(tab.id as any)}
                >
                  <Icon size={16} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ======================================================== */}
          {/* TAB 1: MY MONEY */}
          {/* ======================================================== */}
          {activeTab === 'money' && (
            <div className="space-y-6">
              {/* Account Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <AccountCard
                  title="User Account"
                  desc="Available money ready to spend or withdraw"
                  amount={currentAvailableBalance}
                  badge="Available"
                  active={showAccountDetails}
                  onClick={() => setShowAccountDetails(!showAccountDetails)}
                />

                <AccountCard
                  title="Buyer Escrow"
                  desc="Funds secured in trust for active orders"
                  amount={currentBuyerEscrow}
                  badge={`${buyerEscrowOrders.length} Orders`}
                  active={showBuyerEscrowDetails}
                  onClick={() => setShowBuyerEscrowDetails(!showBuyerEscrowDetails)}
                />

                <AccountCard
                  title="Freelancer Escrow"
                  desc="Pending payouts for work you are delivering"
                  amount={currentFreelancerEscrow}
                  badge={`${freelancerEscrowOrders.length} In Progress`}
                  active={showFreelancerEscrowDetails}
                  onClick={() => setShowFreelancerEscrowDetails(!showFreelancerEscrowDetails)}
                />
              </div>

              {/* Expanded Panel: User Account Breakdown */}
              {showAccountDetails && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="text-base font-bold text-slate-800">User Account Available Funds</h4>
                      <p className="text-xs text-slate-500">Breakdown of withdrawable cash across supported currencies</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsDepositModalOpen(true)}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition"
                      >
                        + Deposit Funds
                      </button>
                      <button
                        onClick={() => setIsWithdrawModalOpen(true)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition"
                      >
                        Withdraw Funds
                      </button>
                    </div>
                  </div>

                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3 text-left">Currency</th>
                        <th className="p-3 text-left">Available Balance</th>
                        <th className="p-3 text-left">Available for Withdrawal</th>
                        <th className="p-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="p-3 font-bold text-slate-800 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-extrabold text-slate-600">
                            $
                          </span>
                          US Dollar (USD)
                        </td>
                        <td className="p-3 font-semibold text-slate-900">{formatMoney(currentAvailableBalance)}</td>
                        <td className="p-3 font-semibold text-emerald-600">{formatMoney(currentAvailableBalance)}</td>
                        <td className="p-3 text-right">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            Active
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Expanded Panel: Buyer Escrow Orders Table */}
              {showBuyerEscrowDetails && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="text-base font-bold text-slate-800">Buyer Escrow Vault (Work Others Are Doing For You)</h4>
                      <p className="text-xs text-slate-500">
                        Funds held under 14-day Escrow Protection. Release when satisfied with deliverable.
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                      Total: {formatMoney(currentBuyerEscrow)}
                    </span>
                  </div>

                  {buyerEscrowOrders.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      <ShieldCheck size={36} className="mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-600">No active escrow orders currently funded</p>
                      <p className="text-xs mt-1">When you hire a freelancer or order a gig, funds will appear here in escrow.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3 text-left">Order & Freelancer</th>
                            <th className="p-3 text-left">In Escrow</th>
                            <th className="p-3 text-left">Protection Timer</th>
                            <th className="p-3 text-left">Status</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {buyerEscrowOrders.map(order => {
                            const associatedGig = gigs.find(g => g.id === order.gigId);
                            const associatedProject = projects.find(p => p.id === order.projectId);
                            return (
                              <tr key={order.id} className="hover:bg-slate-50/70 transition">
                                <td className="p-3">
                                  <div className="font-bold text-slate-900 hover:text-emerald-600 transition">
                                    {order.title}
                                  </div>
                                  <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                                    <span>#{order.id}</span>
                                    <span>•</span>
                                    <span>Seller: {order.sellerUsername || 'Freelancer'}</span>
                                    {associatedGig && <span>• Gig: {associatedGig.category}</span>}
                                    {associatedProject && <span>• Project</span>}
                                  </div>
                                </td>
                                <td className="p-3 font-extrabold text-slate-900">
                                  {formatMoney(order.amount)}
                                </td>
                                <td className="p-3 text-xs text-slate-600">
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={13} className="text-emerald-600" />
                                    <span>Due: {order.dueDate}</span>
                                  </div>
                                  <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
                                    14-Day Escrow Protected
                                  </span>
                                </td>
                                <td className="p-3">
                                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                    {order.status === 'funded_in_escrow' ? 'Escrow Funded' : 'In Progress'}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => {
                                        setSelectedOrderForAction(order);
                                        setIsEscrowReleaseModalOpen(true);
                                      }}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
                                    >
                                      Release Escrow
                                    </button>
                                    <button
                                      onClick={() => {
                                        setSelectedOrderForAction(order);
                                        setIsEscrowRefundModalOpen(true);
                                      }}
                                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                                    >
                                      Refund
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Expanded Panel: Freelancer Escrow Orders Table */}
              {showFreelancerEscrowDetails && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="text-base font-bold text-slate-800">Freelancer Escrow (Work You Are Delivering)</h4>
                      <p className="text-xs text-slate-500">
                        Funds deposited by clients, awaiting completion or milestone signoff.
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                      Total: {formatMoney(currentFreelancerEscrow)}
                    </span>
                  </div>

                  {freelancerEscrowOrders.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      <Clock size={36} className="mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-600">No active incoming escrow orders</p>
                      <p className="text-xs mt-1">When buyers order your services, protected deposits will appear here.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3 text-left">Order & Buyer</th>
                            <th className="p-3 text-left">Escrow Total</th>
                            <th className="p-3 text-left">Your Net (90%)</th>
                            <th className="p-3 text-left">Status</th>
                            <th className="p-3 text-right">Delivery Due</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {freelancerEscrowOrders.map(order => (
                            <tr key={order.id} className="hover:bg-slate-50/70 transition">
                              <td className="p-3">
                                <div className="font-bold text-slate-900">{order.title}</div>
                                <div className="text-xs text-slate-500">Client: {order.buyerUsername || 'Buyer'} (#{order.id})</div>
                              </td>
                              <td className="p-3 font-semibold text-slate-700">{formatMoney(order.amount)}</td>
                              <td className="p-3 font-extrabold text-emerald-600">{formatMoney(order.amount * 0.9)}</td>
                              <td className="p-3">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                  order.status === 'delivered' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {order.status === 'delivered' ? 'Delivered' : 'In Progress'}
                                </span>
                              </td>
                              <td className="p-3 text-right font-medium text-slate-600">{order.dueDate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Escrow Guarantee Banner */}
              <div className="bg-linear-to-r from-emerald-900 to-slate-900 text-white rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <ShieldCheck size={28} className="text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold">14-Day Escrow Security Guarantee</h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      All platform transactions are backed by WorkPerHour trust escrow. Funds are never released without buyer confirmation or verified milestone completion.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCalculatorModalOpen(true)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl transition shrink-0"
                >
                  Earnings Calculator
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: STATEMENTS */}
          {/* ======================================================== */}
          {activeTab === 'statements' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Financial Statements</h3>
                  <p className="text-xs text-slate-500">Summary of inflows, platform fees, and running account balances</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={statementRange}
                    onChange={(e) => setStatementRange(e.target.value as any)}
                    className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white"
                  >
                    <option value="30days">Last 30 Days</option>
                    <option value="month">Current Month (October 2026)</option>
                    <option value="prev_month">Previous Month (September 2026)</option>
                    <option value="year">Year 2026</option>
                    <option value="all">All Time</option>
                  </select>
                  <button
                    onClick={() => handleExportCsv('statement')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    <Download size={14} /> Export CSV
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
                  >
                    <Printer size={14} /> Print
                  </button>
                </div>
              </div>

              {/* Statement Summary Tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-xs font-medium text-slate-500 uppercase">Gross Volume</span>
                  <div className="text-xl font-extrabold text-slate-900 mt-1">
                    {formatMoney(currentAvailableBalance + currentBuyerEscrow + currentFreelancerEscrow)}
                  </div>
                </div>
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-xs font-medium text-emerald-700 uppercase">Available Cash</span>
                  <div className="text-xl font-extrabold text-emerald-800 mt-1">
                    {formatMoney(currentAvailableBalance)}
                  </div>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <span className="text-xs font-medium text-blue-700 uppercase">Escrow Held</span>
                  <div className="text-xl font-extrabold text-blue-800 mt-1">
                    {formatMoney(currentBuyerEscrow + currentFreelancerEscrow)}
                  </div>
                </div>
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                  <span className="text-xs font-medium text-purple-700 uppercase">Platform Fees Paid</span>
                  <div className="text-xl font-extrabold text-purple-800 mt-1">
                    {formatMoney(earnedToDateCalc * 0.1)}
                  </div>
                </div>
              </div>

              {/* Itemized Statement Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Reference</th>
                      <th className="p-3 text-left">Description</th>
                      <th className="p-3 text-left">Type</th>
                      <th className="p-3 text-right">Inflow / Outflow</th>
                      <th className="p-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No transactions found for the selected period.
                        </td>
                      </tr>
                    ) : (
                      transactions.slice(0, 15).map(txn => {
                        const isInflow = ['deposit', 'escrow_release', 'freelancer_earning', 'adjustment_credit', 'refund'].includes(txn.type);
                        return (
                          <tr key={txn.id} className="hover:bg-slate-50/70 transition">
                            <td className="p-3 text-xs text-slate-600">{txn.timestamp}</td>
                            <td className="p-3 font-mono text-xs text-slate-500">#{txn.id}</td>
                            <td className="p-3 font-medium text-slate-800">{txn.description}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 capitalize">
                                {txn.type.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className={`p-3 text-right font-bold ${isInflow ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {isInflow ? '+' : '-'}{formatMoney(txn.amount)}
                            </td>
                            <td className="p-3 text-right">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                {txn.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: INVOICES */}
          {/* ======================================================== */}
          {activeTab === 'invoices' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Invoices</h3>
                  <p className="text-xs text-slate-500">View order billing records and generate custom client invoices</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-bold text-slate-600">
                    {(['all', 'paid', 'in_escrow', 'unpaid'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setInvoiceFilter(f)}
                        className={`px-3 py-1 rounded-lg capitalize transition ${
                          invoiceFilter === f ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'
                        }`}
                      >
                        {f.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setIsCreateInvoiceModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
                  >
                    <Plus size={14} /> Create Invoice
                  </button>
                </div>
              </div>

              {/* Invoices List Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 text-left">Invoice #</th>
                      <th className="p-3 text-left">Issue Date</th>
                      <th className="p-3 text-left">Title / Order</th>
                      <th className="p-3 text-left">Recipient</th>
                      <th className="p-3 text-left">Amount</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          No invoices generated yet.
                        </td>
                      </tr>
                    ) : (
                      invoices
                        .filter(inv => invoiceFilter === 'all' || inv.status === invoiceFilter)
                        .map(inv => (
                          <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                            <td className="p-3 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                            <td className="p-3 text-xs text-slate-500">{inv.issueDate}</td>
                            <td className="p-3 font-medium text-slate-800">
                              <div>{inv.title}</div>
                              {inv.relatedOrderId && <div className="text-[11px] text-slate-400">Order #{inv.relatedOrderId}</div>}
                            </td>
                            <td className="p-3 text-xs text-slate-600">{inv.recipientName}</td>
                            <td className="p-3 font-extrabold text-slate-900">{formatMoney(inv.total)}</td>
                            <td className="p-3">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                                inv.status === 'in_escrow' ? 'bg-blue-100 text-blue-800' :
                                inv.status === 'refunded' ? 'bg-amber-100 text-amber-800' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {inv.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => {
                                  setSelectedInvoiceForView(inv);
                                  setIsViewInvoiceModalOpen(true);
                                }}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition"
                              >
                                View Invoice
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: TRANSACTIONS */}
          {/* ======================================================== */}
          {activeTab === 'transactions' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Transaction History</h3>
                  <p className="text-xs text-slate-500">Live ledger of all top-ups, order escrows, releases, and payouts</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-emerald-500 w-48"
                    />
                  </div>
                  <button
                    onClick={() => handleExportCsv('transactions')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
                  >
                    <Download size={14} /> Export CSV
                  </button>
                </div>
              </div>

              {/* Transaction Filters */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all', label: 'All Transactions' },
                  { id: 'earnings', label: 'Earnings' },
                  { id: 'deposits', label: 'Deposits' },
                  { id: 'escrow', label: 'Escrow Holds' },
                  { id: 'withdrawals', label: 'Withdrawals' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setTxnFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      txnFilter === f.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 text-left">Date & Time</th>
                      <th className="p-3 text-left">Transaction ID</th>
                      <th className="p-3 text-left">Type</th>
                      <th className="p-3 text-left">Description</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No transactions found.
                        </td>
                      </tr>
                    ) : (
                      transactions
                        .filter(t => {
                          if (txnFilter === 'earnings') return ['escrow_release', 'freelancer_earning'].includes(t.type);
                          if (txnFilter === 'deposits') return t.type === 'deposit';
                          if (txnFilter === 'escrow') return ['escrow_fund', 'order_payment'].includes(t.type);
                          if (txnFilter === 'withdrawals') return ['payout_requested', 'payout_processed'].includes(t.type);
                          return true;
                        })
                        .filter(t => !searchQuery || t.description.toLowerCase().includes(searchQuery.toLowerCase()) || t.id.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map(t => {
                          const isInflow = ['deposit', 'escrow_release', 'freelancer_earning', 'adjustment_credit', 'refund'].includes(t.type);
                          return (
                            <tr key={t.id} className="hover:bg-slate-50/70 transition">
                              <td className="p-3 text-xs text-slate-600">{t.timestamp}</td>
                              <td className="p-3 font-mono text-xs text-slate-500">#{t.id}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 capitalize">
                                  {t.type.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="p-3 font-medium text-slate-800">{t.description}</td>
                              <td className={`p-3 text-right font-extrabold ${isInflow ? 'text-emerald-600' : 'text-slate-900'}`}>
                                {isInflow ? '+' : '-'}{formatMoney(t.amount)}
                              </td>
                              <td className="p-3 text-right">
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                  {t.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 5: PAYMENT METHODS */}
          {/* ======================================================== */}
          {activeTab === 'methods' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Payment & Payout Methods</h3>
                  <p className="text-xs text-slate-500">Saved credit cards, bank accounts, and PayPal / UPI credentials</p>
                </div>
                <button
                  onClick={() => setIsAddMethodModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  <Plus size={15} /> Add Payment Method
                </button>
              </div>

              {/* Saved Methods List */}
              <div className="space-y-4">
                {savedMethods.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <CreditCard size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">No payment methods saved yet</p>
                    <p className="text-xs mt-1">Add a credit card, PayPal, or bank account for instant deposits and payouts.</p>
                  </div>
                ) : (
                  savedMethods.map(method => (
                    <div
                      key={method.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                          {method.type === 'card' && <CreditCard size={20} />}
                          {method.type === 'bank' && <Building2 size={20} />}
                          {method.type === 'paypal' && <Send size={20} />}
                          {method.type === 'upi' && <Sparkles size={20} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{method.name}</span>
                            {method.isDefault && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                Primary
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 capitalize">
                            Type: {method.type} · Added on {method.createdAt}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!method.isDefault && (
                          <button
                            onClick={() => handleSetDefaultPaymentMethod(method.id)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${method.name}?`)) {
                              handleDeletePaymentMethod(method.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition"
                          title="Remove method"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Security info banner */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3 text-xs text-slate-500">
                <Lock size={16} className="text-emerald-600 shrink-0" />
                <span>
                  Payment details are stored in PCI-DSS Level 1 compliant vaults with 256-bit AES encryption.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Control Panel & Earnings Calculator */}
        <div className="w-full lg:w-80 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck size={16} className="text-emerald-600" /> CONTROL PANEL
            </h2>

            {/* Metrics */}
            <div className="space-y-3.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Paid this month</span>
                <span className="font-bold text-slate-900">{formatMoney(summary?.paidThisMonth || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Paid to date</span>
                <span className="font-bold text-slate-900">{formatMoney(paidToDateCalc)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Earned this month</span>
                <span className="font-bold text-emerald-600">{formatMoney(summary?.earnedThisMonth || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Earned to date</span>
                <span className="font-bold text-emerald-600">{formatMoney(earnedToDateCalc)}</span>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Earned past two months</span>
                  <span className="font-bold text-slate-900">{formatMoney(summary?.earnedPastTwoMonths || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Clearing period</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-xs">
                    14 days
                  </span>
                </div>
              </div>
            </div>

            {/* Service Fees Card */}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <h3 className="font-bold text-slate-800 text-sm">Service Fees*</h3>
              <div className="text-xs space-y-1.5 text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex justify-between">
                  <span>First $7,000 earned with Buyer</span>
                  <span className="font-bold text-slate-900">7.5%</span>
                </div>
                <div className="flex justify-between">
                  <span>Over $7,000 earned with Buyer</span>
                  <span className="font-bold text-emerald-600">3.5%</span>
                </div>
                <p className="text-[10px] text-slate-400 pt-1">
                  *Work billed under Zero Commission scheme is excluded from fees.
                </p>
              </div>
            </div>

            {/* Quick Action Navigation Buttons */}
            <div className="border-t border-slate-100 pt-4 space-y-2 text-sm">
              <button
                onClick={() => setIsDepositModalOpen(true)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-slate-700 font-semibold transition"
              >
                <span className="flex items-center gap-2.5">
                  <ShieldCheck size={16} className="text-emerald-600" /> Escrow Deposit
                </span>
                <ChevronRight size={14} className="text-slate-400" />
              </button>

              <button
                onClick={() => setIsCreateInvoiceModalOpen(true)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-slate-700 font-semibold transition"
              >
                <span className="flex items-center gap-2.5">
                  <FileText size={16} className="text-blue-600" /> Create Invoice
                </span>
                <ChevronRight size={14} className="text-slate-400" />
              </button>

              <button
                onClick={() => setActiveTab('methods')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-slate-700 font-semibold transition"
              >
                <span className="flex items-center gap-2.5">
                  <Settings size={16} className="text-purple-600" /> Payment Settings
                </span>
                <ChevronRight size={14} className="text-slate-400" />
              </button>

              <button
                onClick={() => setIsCalculatorModalOpen(true)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-slate-700 font-semibold transition"
              >
                <span className="flex items-center gap-2.5">
                  <Calculator size={16} className="text-amber-600" /> Earnings Calculator
                </span>
                <ChevronRight size={14} className="text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: DEPOSIT FUNDS */}
      {/* ======================================================== */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Deposit Funds</h3>
                <p className="text-xs text-slate-500">Add funds to your available wallet balance</p>
              </div>
              <button onClick={() => setIsDepositModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleDepositSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Select Amount</label>
                <div className="grid grid-cols-4 gap-2 mt-1.5">
                  {['50', '100', '250', '500'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDepositAmount(val)}
                      className={`py-2 text-xs font-extrabold rounded-xl border transition ${
                        depositAmount === val 
                          ? 'bg-emerald-600 text-white border-emerald-600' 
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Or Custom Amount ($)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-emerald-500"
                    placeholder="Enter amount"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Payment Method</label>
                <select
                  value={depositMethod}
                  onChange={(e) => setDepositMethod(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium bg-white"
                >
                  <option value="Visa ending in 4242">Visa ending in 4242 (Default)</option>
                  <option value="Mastercard ending in 8890">Mastercard ending in 8890</option>
                  <option value="PayPal Express Checkout">PayPal Express Checkout</option>
                  <option value="Instant Bank Wire (ACH)">Instant Bank Wire (ACH)</option>
                </select>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                <span className="font-semibold">Credited to Balance</span>
                <span className="font-extrabold text-sm">{formatMoney(parseFloat(depositAmount) || 0)}</span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-extrabold transition shadow-xs"
                >
                  Confirm Deposit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: WITHDRAW FUNDS */}
      {/* ======================================================== */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Withdraw Funds</h3>
                <p className="text-xs text-slate-500">Transfer available balance to your bank or PayPal</p>
              </div>
              <button onClick={() => setIsWithdrawModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">Available to Withdraw</span>
                <span className="text-base font-extrabold text-emerald-600">{formatMoney(currentAvailableBalance)}</span>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 uppercase">Withdrawal Amount ($)</label>
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(currentAvailableBalance.toString())}
                    className="text-xs font-bold text-emerald-600 hover:underline"
                  >
                    Withdraw All
                  </button>
                </div>
                <div className="relative mt-1">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    min="1"
                    max={currentAvailableBalance}
                    step="any"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-emerald-500"
                    placeholder="Enter amount"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Payout Method</label>
                <select
                  value={withdrawMethod}
                  onChange={(e) => setWithdrawMethod(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium bg-white"
                >
                  <option value="Bank Transfer">Direct Bank Wire / ACH Transfer</option>
                  <option value="PayPal">PayPal</option>
                  <option value="Stripe Payout">Stripe Express</option>
                  <option value="UPI">UPI Instant (India)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Account Details / Reference</label>
                <input
                  type="text"
                  value={withdrawAccountDetails}
                  onChange={(e) => setWithdrawAccountDetails(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-emerald-500"
                  placeholder="e.g. Chase Bank •••• 8821 or user@email.com"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-extrabold transition shadow-xs"
                >
                  Request Payout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: RELEASE ESCROW CONFIRMATION */}
      {/* ======================================================== */}
      {isEscrowReleaseModalOpen && selectedOrderForAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <ShieldCheck size={22} />
                <h3 className="text-lg font-bold">Authorize Escrow Release</h3>
              </div>
              <button onClick={() => setIsEscrowReleaseModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <p className="text-slate-600">
                You are about to release protected escrow funds to the freelancer for:
              </p>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-900">{selectedOrderForAction.title}</div>
                <div className="text-xs text-slate-500">Order ID: #{selectedOrderForAction.id}</div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-xs">
                  <span className="text-slate-600">Total Escrow Amount:</span>
                  <span className="font-bold text-slate-900">{formatMoney(selectedOrderForAction.amount)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Freelancer Net (90%):</span>
                  <span className="font-bold text-emerald-600">{formatMoney(selectedOrderForAction.amount * 0.9)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">WorkPerHour Fee (10%):</span>
                  <span className="text-slate-500">{formatMoney(selectedOrderForAction.amount * 0.1)}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                By confirming, this order will be completed and the freelancer's wallet will be credited.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEscrowReleaseModalOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReleaseEscrowSubmit}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-extrabold transition shadow-xs"
              >
                Yes, Release Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: REQUEST ESCROW REFUND */}
      {/* ======================================================== */}
      {isEscrowRefundModalOpen && selectedOrderForAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900">
                <AlertCircle size={22} className="text-amber-500" />
                <h3 className="text-lg font-bold">Request Escrow Refund</h3>
              </div>
              <button onClick={() => setIsEscrowRefundModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-slate-800">{selectedOrderForAction.title}</div>
                <div className="text-slate-500">Refund Amount: {formatMoney(selectedOrderForAction.amount)}</div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Reason for Cancellation / Refund</label>
                <textarea
                  rows={3}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-xs focus:outline-emerald-500"
                  placeholder="Explain why this escrow order is being cancelled..."
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEscrowRefundModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRefundEscrowSubmit}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-extrabold transition shadow-xs"
                >
                  Confirm Refund
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: CREATE CUSTOM INVOICE */}
      {/* ======================================================== */}
      {isCreateInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Create New Invoice</h3>
                <p className="text-xs text-slate-500">Bill your client under WorkPerHour Escrow Protection</p>
              </div>
              <button onClick={() => setIsCreateInvoiceModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateInvoiceSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase">Client Name</label>
                  <input
                    type="text"
                    value={newInvoiceData.recipientName}
                    onChange={(e) => setNewInvoiceData({ ...newInvoiceData, recipientName: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    placeholder="e.g. Marcus Vance"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase">Client Email</label>
                  <input
                    type="email"
                    value={newInvoiceData.recipientEmail}
                    onChange={(e) => setNewInvoiceData({ ...newInvoiceData, recipientEmail: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    placeholder="client@company.com"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Invoice Title</label>
                <input
                  type="text"
                  value={newInvoiceData.title}
                  onChange={(e) => setNewInvoiceData({ ...newInvoiceData, title: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                  placeholder="e.g. Website UI Redesign & Brand Identity Milestone"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-700 uppercase">Item Description</label>
                  <input
                    type="text"
                    value={newInvoiceData.itemDesc}
                    onChange={(e) => setNewInvoiceData({ ...newInvoiceData, itemDesc: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    placeholder="Design sprint deliverable"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase">Amount ($)</label>
                  <input
                    type="number"
                    min="1"
                    value={newInvoiceData.itemPrice}
                    onChange={(e) => setNewInvoiceData({ ...newInvoiceData, itemPrice: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold"
                    placeholder="500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase">Due Date</label>
                <input
                  type="date"
                  value={newInvoiceData.dueDate}
                  onChange={(e) => setNewInvoiceData({ ...newInvoiceData, dueDate: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateInvoiceModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-extrabold transition shadow-xs"
                >
                  Create & Send Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 6: VIEW INVOICE DOCUMENT */}
      {/* ======================================================== */}
      {isViewInvoiceModalOpen && selectedInvoiceForView && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="text-xl font-black text-slate-900 tracking-tight">
                  Work<span className="text-emerald-600">PerHour</span>
                </span>
                <span className="text-xs text-slate-400 block mt-0.5">Official Tax & Escrow Invoice</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  <Printer size={14} /> Print
                </button>
                <button onClick={() => setIsViewInvoiceModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Invoice Header Details */}
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <span className="text-slate-400 uppercase font-semibold">Billed To:</span>
                <div className="font-bold text-slate-900 text-sm mt-1">{selectedInvoiceForView.recipientName}</div>
                <div className="text-slate-500">{selectedInvoiceForView.recipientEmail}</div>
              </div>
              <div className="text-right">
                <span className="text-slate-400 uppercase font-semibold">Invoice Details:</span>
                <div className="font-bold text-slate-900 text-sm mt-1">Invoice #{selectedInvoiceForView.invoiceNumber}</div>
                <div className="text-slate-500">Issue Date: {selectedInvoiceForView.issueDate}</div>
                <div className="text-slate-500">Due Date: {selectedInvoiceForView.dueDate}</div>
                <div className="mt-2">
                  <span className="px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800 uppercase text-[11px]">
                    {selectedInvoiceForView.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedInvoiceForView.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-medium text-slate-800">{it.description}</td>
                      <td className="p-3 text-center text-slate-600">{it.quantity || 1}</td>
                      <td className="p-3 text-right text-slate-600">{formatMoney(it.unitPrice || it.amount)}</td>
                      <td className="p-3 text-right font-bold text-slate-900">{formatMoney(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Breakdown */}
            <div className="border-t border-slate-200 pt-4 flex justify-end">
              <div className="w-64 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-bold text-slate-900">{formatMoney(selectedInvoiceForView.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Platform Fee (Escrow Protected):</span>
                  <span>{formatMoney(selectedInvoiceForView.platformFee)}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-extrabold text-slate-900">
                  <span>Total Amount:</span>
                  <span className="text-emerald-600">{formatMoney(selectedInvoiceForView.total)}</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">
              Payment is held securely in WorkPerHour Escrow Vault under transaction protection.
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 7: EARNINGS CALCULATOR */}
      {/* ======================================================== */}
      {isCalculatorModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900">
                <Calculator size={20} className="text-amber-500" />
                <h3 className="text-lg font-bold">Earnings & Fee Calculator</h3>
              </div>
              <button onClick={() => setIsCalculatorModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span>Order Value</span>
                  <span className="text-lg font-black text-slate-900">{formatMoney(calcAmount)}</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="15000"
                  step="50"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(Number(e.target.value))}
                  className="w-full mt-2 accent-emerald-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>$50</span>
                  <span>$7,000 (Tier breakpoint)</span>
                  <span>$15,000</span>
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Tier 1 (First $7k @ 7.5%):</span>
                  <span className="font-bold">{formatMoney(calcFee.tier1Fee)}</span>
                </div>
                {calcFee.tier2Fee > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tier 2 (Over $7k @ 3.5%):</span>
                    <span className="font-bold">{formatMoney(calcFee.tier2Fee)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-2 flex justify-between text-slate-700 font-bold">
                  <span>Total Platform Commission:</span>
                  <span className="text-red-600">-{formatMoney(calcFee.totalFee)}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-extrabold text-emerald-800">
                  <span>Net Take-Home Earnings:</span>
                  <span className="text-emerald-600">{formatMoney(calcFee.net)}</span>
                </div>
              </div>

              <button
                onClick={() => setIsCalculatorModalOpen(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition"
              >
                Close Calculator
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 8: ADD PAYMENT METHOD */}
      {/* ======================================================== */}
      {isAddMethodModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add Payment Method</h3>
                <p className="text-xs text-slate-500">Configure cards, bank accounts, or digital wallets</p>
              </div>
              <button onClick={() => setIsAddMethodModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddPaymentMethodSubmit} className="space-y-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
                {(['card', 'bank', 'paypal', 'upi'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewMethodData({ ...newMethodData, type: t })}
                    className={`py-1.5 rounded-lg capitalize transition ${
                      newMethodData.type === t ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {newMethodData.type === 'card' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase">Cardholder Name</label>
                    <input
                      type="text"
                      value={newMethodData.name}
                      onChange={(e) => setNewMethodData({ ...newMethodData, name: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                      placeholder="e.g. Elena Rostova"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase">Card Number</label>
                    <input
                      type="text"
                      maxLength={19}
                      value={newMethodData.cardNumber}
                      onChange={(e) => setNewMethodData({ ...newMethodData, cardNumber: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                      placeholder="4242 •••• •••• 4242"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase">Expiry (MM/YY)</label>
                      <input
                        type="text"
                        maxLength={5}
                        value={newMethodData.cardExpiry}
                        onChange={(e) => setNewMethodData({ ...newMethodData, cardExpiry: e.target.value })}
                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                        placeholder="12/28"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase">CVC</label>
                      <input
                        type="password"
                        maxLength={4}
                        value={newMethodData.cardCvc}
                        onChange={(e) => setNewMethodData({ ...newMethodData, cardCvc: e.target.value })}
                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                        placeholder="•••"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {newMethodData.type === 'bank' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase">Bank Name</label>
                    <input
                      type="text"
                      value={newMethodData.bankName}
                      onChange={(e) => setNewMethodData({ ...newMethodData, bankName: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                      placeholder="e.g. Chase Bank / Bank of America"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase">Account Number</label>
                    <input
                      type="text"
                      value={newMethodData.accountNumber}
                      onChange={(e) => setNewMethodData({ ...newMethodData, accountNumber: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                      placeholder="Account number"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase">Routing / IFSC Code</label>
                    <input
                      type="text"
                      value={newMethodData.routingNumber}
                      onChange={(e) => setNewMethodData({ ...newMethodData, routingNumber: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                      placeholder="9-digit routing"
                    />
                  </div>
                </div>
              )}

              {newMethodData.type === 'paypal' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase">PayPal Email</label>
                  <input
                    type="email"
                    value={newMethodData.paypalEmail}
                    onChange={(e) => setNewMethodData({ ...newMethodData, paypalEmail: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    placeholder="paypal@company.com"
                    required
                  />
                </div>
              )}

              {newMethodData.type === 'upi' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase">UPI Virtual ID</label>
                  <input
                    type="text"
                    value={newMethodData.upiId}
                    onChange={(e) => setNewMethodData({ ...newMethodData, upiId: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
                    placeholder="username@okaxis / username@upi"
                    required
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isDefaultCheck"
                  checked={newMethodData.isDefault}
                  onChange={(e) => setNewMethodData({ ...newMethodData, isDefault: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="isDefaultCheck" className="text-xs text-slate-600 font-medium">
                  Set as primary default payment method
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddMethodModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-extrabold transition shadow-xs"
                >
                  Save Method
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Authoritative Double-Entry Ledger & Financial Engine for WorkPerHour

export interface ChartOfAccount {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  description: string;
}

export const CHART_OF_ACCOUNTS: ChartOfAccount[] = [
  { code: '1010', name: 'Operating Cash & Bank', type: 'asset', normalBalance: 'debit', description: 'Settled operational funds in platform bank accounts' },
  { code: '1020', name: 'Payment Processor Clearing', type: 'asset', normalBalance: 'debit', description: 'Stripe & Razorpay clearing accounts awaiting platform settlement' },
  { code: '1030', name: 'Payout Gateway Transit', type: 'asset', normalBalance: 'debit', description: 'Funds in transit through payout gateways (UPI/Bank Wire/Stripe)' },
  { code: '2010', name: 'Buyer Wallets Payable', type: 'liability', normalBalance: 'credit', description: 'Available pre-funded wallet balances owed to buyers' },
  { code: '2020', name: 'Freelancer Wallets Payable', type: 'liability', normalBalance: 'credit', description: 'Withdrawable earnings owed to freelance talent' },
  { code: '2030', name: 'Marketplace Escrow Funds in Trust', type: 'liability', normalBalance: 'credit', description: 'Order funds held in escrow under 14-day protection' },
  { code: '2040', name: 'Pending Payout Liabilities', type: 'liability', normalBalance: 'credit', description: 'Requested withdrawals queued for bank or UPI transfer' },
  { code: '2050', name: 'Pending Refund Liabilities', type: 'liability', normalBalance: 'credit', description: 'Approved refund amounts queued for payment processor reversal' },
  { code: '4010', name: 'Marketplace Platform Commission Fee', type: 'revenue', normalBalance: 'credit', description: '10% marketplace commission earned on completed orders' },
  { code: '5010', name: 'Payment Processing Gateway Fees', type: 'expense', normalBalance: 'debit', description: 'Merchant fees charged by Stripe, Razorpay, or banks' },
  { code: '5020', name: 'Administrative & Goodwill Adjustments', type: 'expense', normalBalance: 'debit', description: 'Compensatory credits and goodwill dispute write-offs' },
];

export interface LedgerEntry {
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
  payoutId?: string;
}

export interface LedgerJournal {
  id: string;
  reference: string;
  postingDate: string;
  timestamp: string;
  description: string;
  eventType: 
    | 'DEPOSIT_SETTLED'
    | 'ORDER_ESCROW_FUNDED'
    | 'ESCROW_RELEASED_TO_FREELANCER'
    | 'ESCROW_REFUNDED_TO_BUYER'
    | 'PAYOUT_REQUESTED'
    | 'PAYOUT_SETTLED'
    | 'PAYOUT_CANCELLED'
    | 'ADMIN_ADJUSTMENT_CREDIT'
    | 'ADMIN_ADJUSTMENT_DEBIT'
    | 'REVERSAL';
  idempotencyKey: string;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  status: 'posted' | 'reversed';
  actor: string;
  reversedByJournalId?: string;
  reversalOfJournalId?: string;
  notes?: string;
}

export interface UserWallet {
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
}

export interface FinancialTransaction {
  id: string;
  type: 
    | 'deposit'
    | 'order_payment'
    | 'escrow_fund'
    | 'escrow_release'
    | 'platform_fee'
    | 'freelancer_earning'
    | 'refund'
    | 'payout_requested'
    | 'payout_processed'
    | 'payout_failed'
    | 'payout_cancelled'
    | 'adjustment_credit'
    | 'adjustment_debit';
  amount: number;
  currency: string;
  timestamp: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'reversed' | 'needs_review';
  userId: string;
  userName: string;
  userRole: 'buyer' | 'freelancer' | 'admin';
  relatedOrderId?: string;
  relatedPayoutId?: string;
  relatedRefundId?: string;
  providerReference?: string;
  journalId?: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface FinancialAuditLog {
  id: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  reason: string;
  requestedState?: string;
  resultingState?: string;
  journalId?: string;
  timestamp: string;
}

export interface ReconciliationException {
  id: string;
  type: 'gateway_mismatch' | 'unbalanced_journal' | 'wallet_ledger_drift' | 'orphan_payout' | 'duplicate_provider_ref';
  entityId: string;
  amount: number;
  currency: string;
  description: string;
  status: 'unresolved' | 'investigating' | 'resolved';
  assignedTo?: string;
  investigationNotes?: string;
  resolvedAt?: string;
  detectedAt: string;
}

// In-Memory Double-Entry Ledger Store
export class FinanceLedgerEngine {
  private journals: LedgerJournal[] = [];
  private transactions: FinancialTransaction[] = [];
  private wallets: Map<string, UserWallet> = new Map();
  private auditLogs: FinancialAuditLog[] = [];
  private exceptions: ReconciliationException[] = [];
  private idempotencyKeys: Set<string> = new Set();
  private platformCommissionRate: number = 10;

  constructor() {
    this.seedInitialFinancialData();
  }

  public setPlatformCommissionRate(rate: number) {
    if (typeof rate === 'number' && rate >= 0 && rate <= 100) {
      this.platformCommissionRate = rate;
    }
  }

  public getPlatformCommissionRate(): number {
    return this.platformCommissionRate;
  }

  // Exact dollar rounding helper to prevent IEEE 754 floating point drift
  public static round(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  // Seed authoritative balanced double-entry journals matching the system's existing orders, payouts, and balances
  private seedInitialFinancialData() {
    // 1. Initialize Wallets for baseline platform users
    const initialUsers: Array<{ id: string; name: string; email: string; role: 'buyer' | 'freelancer' | 'admin'; initialBalance: number }> = [
      { id: 'user_1', name: 'Elena Rostova', email: 'elena@workperhour.com', role: 'freelancer', initialBalance: 4250 },
      { id: 'user_2', name: 'Marcus Vance', email: 'marcus@vance.io', role: 'buyer', initialBalance: 12000 },
      { id: 'user_3', name: 'Aarav Patel', email: 'aarav@cloudscale.in', role: 'freelancer', initialBalance: 0 },
      { id: 'user_bk', name: 'Bushra Khan', email: 'bushra@creatives.co', role: 'freelancer', initialBalance: 1850 },
      { id: 'user_admin', name: 'Super Admin', email: 'admin@workperhour.com', role: 'admin', initialBalance: 0 }
    ];

    for (const u of initialUsers) {
      this.wallets.set(u.id, {
        id: `WAL-${u.id.toUpperCase()}`,
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        userRole: u.role,
        currency: 'USD',
        availableBalance: u.initialBalance,
        pendingIncoming: 0,
        fundsOnHold: u.id === 'user_2' ? 1600 : 0, // Marcus has funded active orders in escrow ($800 + $450 + $350)
        pendingWithdrawals: 0,
        status: 'active',
        lastActivityAt: '2026-10-07 14:30:00',
        createdAt: '2026-09-01 10:00:00'
      });
    }

    // 2. Journal 1: Pre-funding deposit for Buyer Marcus Vance ($13,600 total deposited via Stripe)
    this.postJournal({
      reference: 'DEP-STRIPE-89320',
      description: 'Stripe Bank Checkout Deposit - Marcus Vance Pre-funding',
      eventType: 'DEPOSIT_SETTLED',
      idempotencyKey: 'IDEMP-DEP-101',
      actor: 'Payment Gateway (Stripe)',
      timestamp: '2026-10-01 09:15:00',
      entries: [
        { accountCode: '1020', accountName: 'Payment Processor Clearing', debit: 13600, credit: 0, currency: 'USD', description: 'Stripe clearing deposit received', userId: 'user_2' },
        { accountCode: '2010', accountName: 'Buyer Wallets Payable', debit: 0, credit: 13600, currency: 'USD', description: 'Credited Marcus Vance available wallet', userId: 'user_2' }
      ]
    });

    // 3. Journal 2: Escrow Lock for Order #ord_1 (Full-Stack Web App Development - $800)
    this.postJournal({
      reference: 'ORD-1-ESCROW-LOCK',
      description: 'Escrow funding for Order #ord_1 (I will build a high performance full stack web app in react and node)',
      eventType: 'ORDER_ESCROW_FUNDED',
      idempotencyKey: 'IDEMP-ORD-1',
      actor: 'System Escrow Vault',
      timestamp: '2026-10-05 11:00:00',
      entries: [
        { accountCode: '2010', accountName: 'Buyer Wallets Payable', debit: 800, credit: 0, currency: 'USD', description: 'Debited buyer wallet for order escrow funding', userId: 'user_2', orderId: 'ord_1' },
        { accountCode: '2030', accountName: 'Marketplace Escrow Funds in Trust', debit: 0, credit: 800, currency: 'USD', description: 'Locked in 14-day escrow protection vault', orderId: 'ord_1' }
      ]
    });

    // 4. Journal 3: Escrow Lock for Order #ord_bk (Create an amazing promotional explainer video a puppet - $450)
    this.postJournal({
      reference: 'ORD-BK-ESCROW-LOCK',
      description: 'Escrow funding for Order #ord_bk (Create an amazing promotional explainer video a puppet)',
      eventType: 'ORDER_ESCROW_FUNDED',
      idempotencyKey: 'IDEMP-ORD-BK',
      actor: 'System Escrow Vault',
      timestamp: '2026-10-06 14:20:00',
      entries: [
        { accountCode: '2010', accountName: 'Buyer Wallets Payable', debit: 450, credit: 0, currency: 'USD', description: 'Debited buyer wallet for order escrow funding', userId: 'user_2', orderId: 'ord_bk' },
        { accountCode: '2030', accountName: 'Marketplace Escrow Funds in Trust', debit: 0, credit: 450, currency: 'USD', description: 'Locked in 14-day escrow protection vault', orderId: 'ord_bk' }
      ]
    });

    // 5. Journal 4: Escrow Lock for Order #ord_bushra (Ahrefs DR 70 SEO Backlinks - $350)
    this.postJournal({
      reference: 'ORD-BUSHRA-ESCROW-LOCK',
      description: 'Escrow funding for Order #ord_bushra (I will increase ahrefs domain rating dr 70 using high authority SEO backlinks)',
      eventType: 'ORDER_ESCROW_FUNDED',
      idempotencyKey: 'IDEMP-ORD-BUSHRA',
      actor: 'System Escrow Vault',
      timestamp: '2026-10-07 10:10:00',
      entries: [
        { accountCode: '2010', accountName: 'Buyer Wallets Payable', debit: 350, credit: 0, currency: 'USD', description: 'Debited buyer wallet for order escrow funding', userId: 'user_2', orderId: 'ord_bushra' },
        { accountCode: '2030', accountName: 'Marketplace Escrow Funds in Trust', debit: 0, credit: 350, currency: 'USD', description: 'Locked in 14-day escrow protection vault', orderId: 'ord_bushra' }
      ]
    });

    // 6. Journal 5: Historical completed milestone release to Elena Rostova ($5,750 gross -> $5,175 to Elena + $575 platform fee)
    this.postJournal({
      reference: 'ORD-HIST-COMPLETED-ELENA',
      description: 'Completed Enterprise Migration Order Release to Freelancer Elena Rostova',
      eventType: 'ESCROW_RELEASED_TO_FREELANCER',
      idempotencyKey: 'IDEMP-ORD-HIST-ELENA',
      actor: 'System Auto-Release',
      timestamp: '2026-10-03 16:45:00',
      entries: [
        { accountCode: '1020', accountName: 'Payment Processor Clearing', debit: 5750, credit: 0, currency: 'USD', description: 'Incoming settled contract funds' },
        { accountCode: '2020', accountName: 'Freelancer Wallets Payable', debit: 0, credit: 5175, currency: 'USD', description: 'Net earnings credited to Elena Rostova (90%)', userId: 'user_1' },
        { accountCode: '4010', accountName: 'Marketplace Platform Commission Fee', debit: 0, credit: 575, currency: 'USD', description: '10% Platform commission revenue' }
      ]
    });

    // 7. Journal 6: Payout pay_1 processed to Elena Rostova ($1,500 via UPI)
    this.postJournal({
      reference: 'PAY-1-SETTLED-UPI',
      description: 'Payout #pay_1 processed via UPI to elena@upi ($1,500)',
      eventType: 'PAYOUT_SETTLED',
      idempotencyKey: 'IDEMP-PAY-1',
      actor: 'Payout Gateway (UPI/RazorpayX)',
      timestamp: '2026-10-04 15:30:00',
      entries: [
        { accountCode: '2020', accountName: 'Freelancer Wallets Payable', debit: 1500, credit: 0, currency: 'USD', description: 'Debited freelancer wallet balance for payout', userId: 'user_1', payoutId: 'pay_1' },
        { accountCode: '1030', accountName: 'Payout Gateway Transit', debit: 0, credit: 1500, currency: 'USD', description: 'Disbursed via UPI payment partner transit', payoutId: 'pay_1' }
      ]
    });

    // 8. Initial Financial Audit Log entries
    this.auditLogs.push(
      {
        id: 'FAUD-101',
        actor: 'Stripe Webhook Gateway',
        role: 'system',
        action: 'DEPOSIT_CONFIRMED',
        target: 'Wallet #WAL-USER_2',
        reason: 'Payment Intent #pi_3Mtz924 confirmed settlement in bank clearing',
        journalId: this.journals[0]?.id,
        timestamp: '2026-10-01 09:15:00'
      },
      {
        id: 'FAUD-102',
        actor: 'Escrow Vault Controller',
        role: 'system',
        action: 'ESCROW_FUNDS_LOCKED',
        target: 'Order #ord_1',
        reason: 'Mandatory 14-day escrow protection locking $800 from buyer wallet',
        journalId: this.journals[1]?.id,
        timestamp: '2026-10-05 11:00:00'
      },
      {
        id: 'FAUD-103',
        actor: 'Admin Chief',
        role: 'super_admin',
        action: 'PAYOUT_APPROVED_AND_SETTLED',
        target: 'Payout #pay_1',
        reason: 'Processed UPI withdrawal for freelancer Elena Rostova after KYC verification',
        journalId: this.journals[4]?.id,
        timestamp: '2026-10-04 15:30:00'
      }
    );

    // 9. Initial Real-World Reconciliation Exceptions (Demonstrating production-grade detection)
    this.exceptions.push({
      id: 'REC-EX-001',
      type: 'gateway_mismatch',
      entityId: 'PAY-PROV-REF-STRIPE-994',
      amount: 14.50,
      currency: 'USD',
      description: 'Minor Stripe processing fee delta ($14.50) reported on statement batch #ST-20261005 awaiting COGS ledger adjustment',
      status: 'unresolved',
      assignedTo: 'Finance / Accounts Desk',
      detectedAt: '2026-10-07 08:00:00'
    });
  }

  // Authoritative Double-Entry Journal Posting with Debit=Credit Verification
  public postJournal(params: {
    reference: string;
    description: string;
    eventType: LedgerJournal['eventType'];
    idempotencyKey: string;
    actor: string;
    entries: Array<{
      accountCode: string;
      accountName?: string;
      debit: number;
      credit: number;
      currency: string;
      description: string;
      userId?: string;
      orderId?: string;
      payoutId?: string;
    }>;
    timestamp?: string;
    notes?: string;
  }): LedgerJournal {
    // 1. Idempotency Check: Prevent duplicate financial posting
    if (this.idempotencyKeys.has(params.idempotencyKey)) {
      const existing = this.journals.find(j => j.idempotencyKey === params.idempotencyKey);
      if (existing) return existing;
      throw new Error(`Duplicate financial operation detected with key "${params.idempotencyKey}"`);
    }

    if (!params.entries || params.entries.length < 2) {
      throw new Error('A double-entry journal requires at least two line items (debits and credits).');
    }

    // 2. Validate Currencies & Equality of Debits and Credits
    let totalDebit = 0;
    let totalCredit = 0;
    const currencies = new Set<string>();

    for (const e of params.entries) {
      currencies.add(e.currency);
      totalDebit = FinanceLedgerEngine.round(totalDebit + e.debit);
      totalCredit = FinanceLedgerEngine.round(totalCredit + e.credit);

      if (e.debit < 0 || e.credit < 0) {
        throw new Error('Debits and credits must be non-negative values.');
      }
      if (e.debit > 0 && e.credit > 0) {
        throw new Error('An individual ledger entry cannot have both a debit and credit simultaneously.');
      }
    }

    if (currencies.size > 1) {
      throw new Error('Cannot balance journal across mixed currencies. Multi-currency transactions must be posted with currency isolation.');
    }

    const difference = FinanceLedgerEngine.round(Math.abs(totalDebit - totalCredit));
    if (difference !== 0) {
      throw new Error(`Journal is out of balance! Total Debits ($${totalDebit.toFixed(2)}) must equal Total Credits ($${totalCredit.toFixed(2)}). Discrepancy: $${difference.toFixed(2)}`);
    }

    const journalId = `JRN-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const nowIso = params.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19);

    // 3. Format entries with Chart of Accounts names
    const ledgerEntries: LedgerEntry[] = params.entries.map((e, idx) => {
      const coa = CHART_OF_ACCOUNTS.find(c => c.code === e.accountCode);
      return {
        id: `ENT-${journalId}-${idx + 1}`,
        journalId,
        accountCode: e.accountCode,
        accountName: e.accountName || coa?.name || `Account ${e.accountCode}`,
        debit: FinanceLedgerEngine.round(e.debit),
        credit: FinanceLedgerEngine.round(e.credit),
        currency: e.currency,
        description: e.description,
        userId: e.userId,
        orderId: e.orderId,
        payoutId: e.payoutId
      };
    });

    const journal: LedgerJournal = {
      id: journalId,
      reference: params.reference,
      postingDate: nowIso.substring(0, 10),
      timestamp: nowIso,
      description: params.description,
      eventType: params.eventType,
      idempotencyKey: params.idempotencyKey,
      entries: ledgerEntries,
      totalDebit,
      totalCredit,
      status: 'posted',
      actor: params.actor,
      notes: params.notes
    };

    // 4. Atomic Commit
    this.journals.unshift(journal);
    this.idempotencyKeys.add(params.idempotencyKey);

    // 5. Update Transaction Explorer Log
    const primaryEntry = ledgerEntries.find(e => e.userId) || ledgerEntries[0];
    let txnType: FinancialTransaction['type'] = 'deposit';
    if (params.eventType === 'ORDER_ESCROW_FUNDED') txnType = 'escrow_fund';
    else if (params.eventType === 'ESCROW_RELEASED_TO_FREELANCER') txnType = 'escrow_release';
    else if (params.eventType === 'ESCROW_REFUNDED_TO_BUYER') txnType = 'refund';
    else if (params.eventType === 'PAYOUT_REQUESTED') txnType = 'payout_requested';
    else if (params.eventType === 'PAYOUT_SETTLED') txnType = 'payout_processed';
    else if (params.eventType === 'PAYOUT_CANCELLED') txnType = 'payout_cancelled';
    else if (params.eventType === 'ADMIN_ADJUSTMENT_CREDIT') txnType = 'adjustment_credit';
    else if (params.eventType === 'ADMIN_ADJUSTMENT_DEBIT') txnType = 'adjustment_debit';

    const affectedUser = primaryEntry?.userId ? this.wallets.get(primaryEntry.userId) : undefined;

    this.transactions.unshift({
      id: `TXN-${journalId.replace('JRN-', '')}`,
      type: txnType,
      amount: totalDebit,
      currency: Array.from(currencies)[0] || 'USD',
      timestamp: nowIso,
      status: 'completed',
      userId: affectedUser?.userId || 'system',
      userName: affectedUser?.userName || 'Platform System / Escrow',
      userRole: affectedUser?.userRole || 'admin',
      relatedOrderId: primaryEntry?.orderId,
      relatedPayoutId: primaryEntry?.payoutId,
      providerReference: params.reference,
      journalId: journal.id,
      description: params.description
    });

    return journal;
  }

  // Reverse an existing journal with an atomic linked reversal journal
  public reverseJournal(journalId: string, reason: string, actor: string): LedgerJournal {
    const original = this.journals.find(j => j.id === journalId);
    if (!original) throw new Error(`Journal ${journalId} not found`);
    if (original.status === 'reversed') throw new Error(`Journal ${journalId} has already been reversed by ${original.reversedByJournalId}`);

    const reversalEntries = original.entries.map(e => ({
      accountCode: e.accountCode,
      accountName: e.accountName,
      debit: e.credit, // Invert Debit and Credit
      credit: e.debit,
      currency: e.currency,
      description: `Reversal of [${e.description}]: ${reason}`,
      userId: e.userId,
      orderId: e.orderId,
      payoutId: e.payoutId
    }));

    const reversalJournal = this.postJournal({
      reference: `REV-${original.id}`,
      description: `Reversal of Journal #${original.id}: ${reason}`,
      eventType: 'REVERSAL',
      idempotencyKey: `IDEMP-REV-${original.id}-${Date.now()}`,
      actor,
      entries: reversalEntries,
      notes: reason
    });

    original.status = 'reversed';
    original.reversedByJournalId = reversalJournal.id;
    reversalJournal.reversalOfJournalId = original.id;

    this.auditLogs.unshift({
      id: `FAUD-${Date.now()}`,
      actor,
      role: 'super_admin',
      action: 'JOURNAL_REVERSED',
      target: `Journal #${original.id}`,
      reason,
      journalId: reversalJournal.id,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });

    return reversalJournal;
  }

  // Calculate Authoritative Ledger-Derived Balance for a user by summing all debits and credits posted to accounts 2010 (Buyer) or 2020 (Freelancer)
  public calculateLedgerDerivedBalance(userId: string): number {
    let balance = 0;
    for (const journal of this.journals) {
      for (const entry of journal.entries) {
        if (entry.userId === userId) {
          if (entry.accountCode === '2010' || entry.accountCode === '2020') {
            // Liability account: Normal balance is Credit.
            // Credit increases liability (money owed to user), Debit decreases it (funds spent or withdrawn).
            balance = FinanceLedgerEngine.round(balance + entry.credit - entry.debit);
          }
        }
      }
    }
    return balance;
  }

  // Get All Wallets with verified ledger reconciliation
  public getWallets() {
    const list = Array.from(this.wallets.values());
    return list.map(w => {
      const ledgerDerived = this.calculateLedgerDerivedBalance(w.userId);
      const difference = FinanceLedgerEngine.round(Math.abs(w.availableBalance - ledgerDerived));
      return {
        ...w,
        ledgerDerivedBalance: ledgerDerived,
        isReconciled: difference === 0,
        discrepancy: difference
      };
    });
  }

  public getWalletById(userId: string) {
    const wallet = this.wallets.get(userId);
    if (!wallet) return null;
    const ledgerDerived = this.calculateLedgerDerivedBalance(userId);
    const userTransactions = this.transactions.filter(t => t.userId === userId);
    const userEntries = this.journals
      .flatMap(j => j.entries.filter(e => e.userId === userId).map(e => ({ ...e, journalDate: j.postingDate, journalRef: j.reference })));
    const userAudits = this.auditLogs.filter(a => a.target.includes(wallet.id) || a.target.includes(userId));

    return {
      wallet: {
        ...wallet,
        ledgerDerivedBalance: ledgerDerived,
        isReconciled: Math.abs(wallet.availableBalance - ledgerDerived) === 0,
        discrepancy: FinanceLedgerEngine.round(Math.abs(wallet.availableBalance - ledgerDerived))
      },
      transactions: userTransactions,
      ledgerEntries: userEntries,
      auditHistory: userAudits
    };
  }

  // Wallet Security Actions
  public freezeWallet(userId: string, reason: string, actor: string) {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new Error('Wallet not found');
    wallet.status = 'frozen';
    wallet.restrictionReason = reason;
    this.auditLogs.unshift({
      id: `FAUD-${Date.now()}`,
      actor,
      role: 'super_admin',
      action: 'WALLET_FROZEN',
      target: `Wallet #${wallet.id} (${wallet.userName})`,
      reason,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    return wallet;
  }

  public unfreezeWallet(userId: string, reason: string, actor: string) {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new Error('Wallet not found');
    wallet.status = 'active';
    wallet.restrictionReason = undefined;
    this.auditLogs.unshift({
      id: `FAUD-${Date.now()}`,
      actor,
      role: 'super_admin',
      action: 'WALLET_UNFROZEN',
      target: `Wallet #${wallet.id} (${wallet.userName})`,
      reason,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    return wallet;
  }

  public restrictWallet(userId: string, reason: string, actor: string) {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new Error('Wallet not found');
    wallet.status = 'restricted';
    wallet.restrictionReason = reason;
    this.auditLogs.unshift({
      id: `FAUD-${Date.now()}`,
      actor,
      role: 'super_admin',
      action: 'WALLET_WITHDRAWALS_RESTRICTED',
      target: `Wallet #${wallet.id} (${wallet.userName})`,
      reason,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    return wallet;
  }

  // Controlled Administrative Adjustment Workflow: Generates a balanced double-entry journal
  public executeAdministrativeAdjustment(params: {
    userId: string;
    amount: number;
    direction: 'credit_user' | 'debit_user';
    category: 'goodwill' | 'dispute_resolution' | 'accounting_correction' | 'chargeback_recovery';
    reason: string;
    actor: string;
    evidenceReference?: string;
  }) {
    const wallet = this.wallets.get(params.userId);
    if (!wallet) throw new Error('Wallet not found');
    if (params.amount <= 0) throw new Error('Adjustment amount must be strictly greater than $0.00');
    if (!params.reason || params.reason.trim().length < 5) throw new Error('A mandatory explanation (min 5 characters) is required for financial adjustments.');

    const userAccountCode = wallet.userRole === 'buyer' ? '2010' : '2020';
    const amount = FinanceLedgerEngine.round(params.amount);

    let journalEntries: Array<{ accountCode: string; debit: number; credit: number; currency: string; description: string; userId?: string }>;

    if (params.direction === 'credit_user') {
      // Platform increases user available balance (Credit user liability), Platform takes on Expense (Debit 5020)
      journalEntries = [
        {
          accountCode: '5020',
          debit: amount,
          credit: 0,
          currency: 'USD',
          description: `Adjustment Expense: ${params.category.toUpperCase()} - ${params.reason}`
        },
        {
          accountCode: userAccountCode,
          debit: 0,
          credit: amount,
          currency: 'USD',
          description: `Credit Adjustment to ${wallet.userName} (${wallet.userRole}): ${params.reason}`,
          userId: wallet.userId
        }
      ];
      wallet.availableBalance = FinanceLedgerEngine.round(wallet.availableBalance + amount);
    } else {
      // Platform recovers/debits user available balance
      if (wallet.availableBalance < amount) {
        throw new Error(`Insufficient user available balance ($${wallet.availableBalance.toFixed(2)}) for a debit adjustment of $${amount.toFixed(2)}. Arbitrary negative balances are prohibited.`);
      }
      journalEntries = [
        {
          accountCode: userAccountCode,
          debit: amount,
          credit: 0,
          currency: 'USD',
          description: `Debit Adjustment from ${wallet.userName} (${wallet.userRole}): ${params.reason}`,
          userId: wallet.userId
        },
        {
          accountCode: '5020',
          debit: 0,
          credit: amount,
          currency: 'USD',
          description: `Expense Recovery: ${params.category.toUpperCase()} - ${params.reason}`
        }
      ];
      wallet.availableBalance = FinanceLedgerEngine.round(wallet.availableBalance - amount);
    }

    const journal = this.postJournal({
      reference: `ADJ-${wallet.id}-${Date.now()}`,
      description: `Administrative ${params.direction.toUpperCase()}: ${params.reason} (${params.category})`,
      eventType: params.direction === 'credit_user' ? 'ADMIN_ADJUSTMENT_CREDIT' : 'ADMIN_ADJUSTMENT_DEBIT',
      idempotencyKey: `IDEMP-ADJ-${wallet.id}-${Date.now()}`,
      actor: params.actor,
      entries: journalEntries,
      notes: `Category: ${params.category} | Reference: ${params.evidenceReference || 'N/A'} | Reason: ${params.reason}`
    });

    this.auditLogs.unshift({
      id: `FAUD-${Date.now()}`,
      actor: params.actor,
      role: 'super_admin',
      action: `ADMIN_ADJUSTMENT_${params.direction.toUpperCase()}`,
      target: `Wallet #${wallet.id} (${wallet.userName})`,
      reason: `${params.reason} [${params.category}] Amount: $${amount}`,
      journalId: journal.id,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });

    return { journal, wallet };
  }

  // Preview double-entry journal before posting
  public previewAdjustment(params: {
    userId: string;
    amount: number;
    direction: 'credit_user' | 'debit_user';
    category: string;
    reason: string;
  }) {
    const wallet = this.wallets.get(params.userId);
    if (!wallet) throw new Error('Wallet not found');
    const amount = FinanceLedgerEngine.round(params.amount || 0);
    const userAccountCode = wallet.userRole === 'buyer' ? '2010' : '2020';
    const userAccountName = wallet.userRole === 'buyer' ? 'Buyer Wallets Payable' : 'Freelancer Wallets Payable';

    if (params.direction === 'credit_user') {
      return {
        debits: [{ accountCode: '5020', accountName: 'Administrative & Goodwill Adjustments', amount, effect: 'Increases platform expense' }],
        credits: [{ accountCode: userAccountCode, accountName: userAccountName, amount, effect: `Increases ${wallet.userName} available balance` }],
        resultingBalance: FinanceLedgerEngine.round(wallet.availableBalance + amount),
        currentBalance: wallet.availableBalance,
        balanced: true
      };
    } else {
      return {
        debits: [{ accountCode: userAccountCode, accountName: userAccountName, amount, effect: `Decreases ${wallet.userName} available balance` }],
        credits: [{ accountCode: '5020', accountName: 'Administrative & Goodwill Adjustments', amount, effect: 'Decreases platform expense / recovery' }],
        resultingBalance: FinanceLedgerEngine.round(wallet.availableBalance - amount),
        currentBalance: wallet.availableBalance,
        balanced: true,
        insufficientFunds: wallet.availableBalance < amount
      };
    }
  }

  // Escrow Release Execution: Releases 90% to Freelancer and 10% to Platform Fee Revenue
  public releaseEscrow(params: {
    orderId: string;
    orderTitle: string;
    amount: number;
    sellerId: string;
    buyerId: string;
    actor: string;
  }) {
    const freelancerWallet = this.wallets.get(params.sellerId);
    const buyerWallet = this.wallets.get(params.buyerId);
    if (!freelancerWallet) throw new Error('Freelancer wallet not found');

    const totalAmount = FinanceLedgerEngine.round(params.amount);
    const platformFee = FinanceLedgerEngine.round(totalAmount * 0.10);
    const freelancerNet = FinanceLedgerEngine.round(totalAmount - platformFee);

    const journal = this.postJournal({
      reference: `ORD-${params.orderId}-RELEASE`,
      description: `Escrow release for Order #${params.orderId} (${params.orderTitle})`,
      eventType: 'ESCROW_RELEASED_TO_FREELANCER',
      idempotencyKey: `IDEMP-REL-${params.orderId}`,
      actor: params.actor,
      entries: [
        {
          accountCode: '2030',
          accountName: 'Marketplace Escrow Funds in Trust',
          debit: totalAmount,
          credit: 0,
          currency: 'USD',
          description: `Released funds held in escrow for Order #${params.orderId}`,
          orderId: params.orderId
        },
        {
          accountCode: '2020',
          accountName: 'Freelancer Wallets Payable',
          debit: 0,
          credit: freelancerNet,
          currency: 'USD',
          description: `Credited 90% net earnings to freelancer ${freelancerWallet.userName}`,
          userId: freelancerWallet.userId,
          orderId: params.orderId
        },
        {
          accountCode: '4010',
          accountName: 'Marketplace Platform Commission Fee',
          debit: 0,
          credit: platformFee,
          currency: 'USD',
          description: `10% Platform commission fee on Order #${params.orderId}`,
          orderId: params.orderId
        }
      ]
    });

    // Update wallet available balance
    freelancerWallet.availableBalance = FinanceLedgerEngine.round(freelancerWallet.availableBalance + freelancerNet);
    if (buyerWallet && buyerWallet.fundsOnHold >= totalAmount) {
      buyerWallet.fundsOnHold = FinanceLedgerEngine.round(buyerWallet.fundsOnHold - totalAmount);
    }

    this.auditLogs.unshift({
      id: `FAUD-${Date.now()}`,
      actor: params.actor,
      role: 'super_admin',
      action: 'ESCROW_RELEASED',
      target: `Order #${params.orderId}`,
      reason: `Authorized order payout release: $${freelancerNet} net to freelancer, $${platformFee} platform commission`,
      journalId: journal.id,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });

    return { journal, freelancerNet, platformFee };
  }

  // Escrow Refund Execution: Returns 100% of escrow funds back to Buyer available balance
  public refundEscrow(params: {
    orderId: string;
    orderTitle: string;
    amount: number;
    buyerId: string;
    reason: string;
    actor: string;
  }) {
    const buyerWallet = this.wallets.get(params.buyerId);
    if (!buyerWallet) throw new Error('Buyer wallet not found');
    const totalAmount = FinanceLedgerEngine.round(params.amount);

    const journal = this.postJournal({
      reference: `ORD-${params.orderId}-REFUND`,
      description: `Escrow refund to Buyer for Order #${params.orderId} (${params.orderTitle}): ${params.reason}`,
      eventType: 'ESCROW_REFUNDED_TO_BUYER',
      idempotencyKey: `IDEMP-REF-${params.orderId}-${Date.now()}`,
      actor: params.actor,
      entries: [
        {
          accountCode: '2030',
          accountName: 'Marketplace Escrow Funds in Trust',
          debit: totalAmount,
          credit: 0,
          currency: 'USD',
          description: `Debited escrow liability for cancelled/refunded Order #${params.orderId}`,
          orderId: params.orderId
        },
        {
          accountCode: '2010',
          accountName: 'Buyer Wallets Payable',
          debit: 0,
          credit: totalAmount,
          currency: 'USD',
          description: `Restored available wallet balance for buyer ${buyerWallet.userName}`,
          userId: buyerWallet.userId,
          orderId: params.orderId
        }
      ]
    });

    buyerWallet.availableBalance = FinanceLedgerEngine.round(buyerWallet.availableBalance + totalAmount);
    if (buyerWallet.fundsOnHold >= totalAmount) {
      buyerWallet.fundsOnHold = FinanceLedgerEngine.round(buyerWallet.fundsOnHold - totalAmount);
    }

    this.auditLogs.unshift({
      id: `FAUD-${Date.now()}`,
      actor: params.actor,
      role: 'super_admin',
      action: 'ESCROW_REFUNDED',
      target: `Order #${params.orderId}`,
      reason: params.reason,
      journalId: journal.id,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });

    return { journal, buyerWallet };
  }

  // Payout Cancellation: Restores withdrawable funds back to freelancer wallet
  public cancelPayout(params: {
    payoutId: string;
    freelancerId: string;
    amount: number;
    reason: string;
    actor: string;
  }) {
    const wallet = this.wallets.get(params.freelancerId);
    if (!wallet) throw new Error('Freelancer wallet not found');
    const amount = FinanceLedgerEngine.round(params.amount);

    const journal = this.postJournal({
      reference: `PAY-${params.payoutId}-CANCELLED`,
      description: `Cancelled Payout #${params.payoutId} and refunded available balance: ${params.reason}`,
      eventType: 'PAYOUT_CANCELLED',
      idempotencyKey: `IDEMP-PAY-CANCEL-${params.payoutId}`,
      actor: params.actor,
      entries: [
        {
          accountCode: '1030',
          accountName: 'Payout Gateway Transit',
          debit: amount,
          credit: 0,
          currency: 'USD',
          description: `Cancelled payout returned from transit`,
          payoutId: params.payoutId
        },
        {
          accountCode: '2020',
          accountName: 'Freelancer Wallets Payable',
          debit: 0,
          credit: amount,
          currency: 'USD',
          description: `Restored balance to freelancer ${wallet.userName}`,
          userId: wallet.userId,
          payoutId: params.payoutId
        }
      ]
    });

    wallet.availableBalance = FinanceLedgerEngine.round(wallet.availableBalance + amount);

    this.auditLogs.unshift({
      id: `FAUD-${Date.now()}`,
      actor: params.actor,
      role: 'super_admin',
      action: 'PAYOUT_CANCELLED_REFUNDED',
      target: `Payout #${params.payoutId}`,
      reason: params.reason,
      journalId: journal.id,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });

    return { journal, wallet };
  }

  // Ensure Wallet Exists for any user (buyers, freelancers, admins, new users)
  public ensureWalletExists(user: { id: string; name: string; email: string; role?: string; initialBalance?: number }) {
    let wallet = this.wallets.get(user.id);
    if (!wallet) {
      wallet = {
        id: `WAL-${user.id.toUpperCase()}`,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userRole: (user.role === 'buyer' ? 'buyer' : user.role === 'admin' ? 'admin' : 'freelancer'),
        currency: 'USD',
        availableBalance: user.initialBalance || 0,
        pendingIncoming: 0,
        fundsOnHold: 0,
        pendingWithdrawals: 0,
        status: 'active',
        lastActivityAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };
      this.wallets.set(user.id, wallet);
    }
    return wallet;
  }

  // User Deposit Execution: Balanced Double-Entry Entry (Asset Debit, Liability Credit)
  public depositFunds(params: {
    userId: string;
    userName?: string;
    userEmail?: string;
    userRole?: string;
    amount: number;
    paymentMethod: string;
    providerReference?: string;
    actor?: string;
  }) {
    let wallet = this.wallets.get(params.userId);
    if (!wallet && params.userName && params.userEmail) {
      wallet = this.ensureWalletExists({
        id: params.userId,
        name: params.userName,
        email: params.userEmail,
        role: params.userRole,
        initialBalance: 0
      });
    }
    if (!wallet) throw new Error('User wallet not found');

    const amount = FinanceLedgerEngine.round(params.amount);
    if (amount <= 0) throw new Error('Deposit amount must be greater than $0.00');

    const accountCode = wallet.userRole === 'freelancer' ? '2020' : '2010';
    const accountName = wallet.userRole === 'freelancer' ? 'Freelancer Wallets Payable' : 'Buyer Wallets Payable';

    const journal = this.postJournal({
      reference: `DEP-${Date.now().toString(36).toUpperCase()}`,
      description: `User balance top-up: $${amount.toFixed(2)} via ${params.paymentMethod} for ${wallet.userName}`,
      eventType: 'DEPOSIT_SETTLED',
      idempotencyKey: `IDEMP-DEP-${params.userId}-${Date.now()}`,
      actor: params.actor || 'Payment Processor',
      entries: [
        {
          accountCode: '1020',
          accountName: 'Payment Processor Clearing',
          debit: amount,
          credit: 0,
          currency: 'USD',
          description: `Clearing funds settled from ${params.paymentMethod}`,
          userId: params.userId
        },
        {
          accountCode,
          accountName,
          debit: 0,
          credit: amount,
          currency: 'USD',
          description: `Credited available balance for ${wallet.userName}`,
          userId: params.userId
        }
      ]
    });

    wallet.availableBalance = FinanceLedgerEngine.round(wallet.availableBalance + amount);
    wallet.lastActivityAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const txn: FinancialTransaction = {
      id: `txn_${Date.now()}`,
      type: 'deposit',
      amount,
      currency: 'USD',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      status: 'completed',
      userId: params.userId,
      userName: wallet.userName,
      userRole: wallet.userRole,
      providerReference: params.providerReference || `PAY-${Date.now()}`,
      journalId: journal.id,
      description: `Deposit via ${params.paymentMethod}`
    };
    this.transactions.unshift(txn);

    return { journal, newBalance: wallet.availableBalance, transaction: txn };
  }

  // User Payout / Withdrawal Request: Balanced Double-Entry Entry
  public requestPayout(params: {
    userId: string;
    amount: number;
    method: string;
    accountDetails: string;
    actor?: string;
  }) {
    const wallet = this.wallets.get(params.userId);
    if (!wallet) throw new Error('User wallet not found');

    const amount = FinanceLedgerEngine.round(params.amount);
    if (amount <= 0) throw new Error('Withdrawal amount must be greater than $0.00');
    if (wallet.availableBalance < amount) {
      throw new Error(`Insufficient available funds. Available: $${wallet.availableBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}`);
    }
    if (wallet.status !== 'active') {
      throw new Error(`Wallet is ${wallet.status}. Withdrawals are currently disabled for this account.`);
    }

    const accountCode = wallet.userRole === 'buyer' ? '2010' : '2020';
    const accountName = wallet.userRole === 'buyer' ? 'Buyer Wallets Payable' : 'Freelancer Wallets Payable';

    const journal = this.postJournal({
      reference: `PAYOUT-REQ-${Date.now().toString(36).toUpperCase()}`,
      description: `Withdrawal request of $${amount.toFixed(2)} via ${params.method} for ${wallet.userName}`,
      eventType: 'PAYOUT_REQUESTED',
      idempotencyKey: `IDEMP-PAYOUT-${params.userId}-${Date.now()}`,
      actor: params.actor || wallet.userName,
      entries: [
        {
          accountCode,
          accountName,
          debit: amount,
          credit: 0,
          currency: 'USD',
          description: `Debited available balance for withdrawal to ${params.method}`,
          userId: params.userId
        },
        {
          accountCode: '2040',
          accountName: 'Pending Payout Liabilities',
          debit: 0,
          credit: amount,
          currency: 'USD',
          description: `Queued pending payout liability via ${params.method}`,
          userId: params.userId
        }
      ]
    });

    wallet.availableBalance = FinanceLedgerEngine.round(wallet.availableBalance - amount);
    wallet.pendingWithdrawals = FinanceLedgerEngine.round(wallet.pendingWithdrawals + amount);
    wallet.lastActivityAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const txn: FinancialTransaction = {
      id: `txn_${Date.now()}`,
      type: 'payout_requested',
      amount,
      currency: 'USD',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      status: 'pending',
      userId: params.userId,
      userName: wallet.userName,
      userRole: wallet.userRole,
      journalId: journal.id,
      description: `Withdrawal to ${params.method} (${params.accountDetails})`
    };
    this.transactions.unshift(txn);

    return { journal, newBalance: wallet.availableBalance, transaction: txn };
  }

  // Get Authoritative Aggregated Financial Overview
  public getFinancialOverview() {
    let totalBuyerLiabilities = 0;
    let totalFreelancerLiabilities = 0;
    let totalEscrowHeld = 0;
    let totalPlatformRevenue = 0;
    let totalPendingPayouts = 0;

    for (const w of this.wallets.values()) {
      if (w.userRole === 'buyer') {
        totalBuyerLiabilities += w.availableBalance;
        totalEscrowHeld += w.fundsOnHold;
      } else if (w.userRole === 'freelancer') {
        totalFreelancerLiabilities += w.availableBalance;
      }
    }

    // Revenue from 4010 accounts
    for (const j of this.journals) {
      for (const e of j.entries) {
        if (e.accountCode === '4010') {
          totalPlatformRevenue += e.credit - e.debit;
        }
        if (e.accountCode === '2040') {
          totalPendingPayouts += e.credit - e.debit;
        }
      }
    }

    // Trial Balance Totals
    let totalDebits = 0;
    let totalCredits = 0;
    for (const j of this.journals) {
      totalDebits += j.totalDebit;
      totalCredits += j.totalCredit;
    }

    const trialBalanceDiff = FinanceLedgerEngine.round(Math.abs(totalDebits - totalCredits));

    return {
      totalUserWalletLiabilities: FinanceLedgerEngine.round(totalBuyerLiabilities + totalFreelancerLiabilities),
      availableBuyerBalances: FinanceLedgerEngine.round(totalBuyerLiabilities),
      availableFreelancerBalances: FinanceLedgerEngine.round(totalFreelancerLiabilities),
      fundsHeldInEscrow: FinanceLedgerEngine.round(totalEscrowHeld),
      pendingPayouts: FinanceLedgerEngine.round(Math.max(0, totalPendingPayouts)),
      platformRevenue: FinanceLedgerEngine.round(totalPlatformRevenue),
      failedTransactionsCount: this.transactions.filter(t => t.status === 'failed').length,
      unreconciledExceptionsCount: this.exceptions.filter(e => e.status === 'unresolved').length,
      trialBalanceInBalance: trialBalanceDiff === 0,
      totalLedgerDebits: FinanceLedgerEngine.round(totalDebits),
      totalLedgerCredits: FinanceLedgerEngine.round(totalCredits),
      trialBalanceDiscrepancy: trialBalanceDiff,
      activeWalletsCount: this.wallets.size,
      frozenWalletsCount: Array.from(this.wallets.values()).filter(w => w.status === 'frozen').length,
      restrictedWalletsCount: Array.from(this.wallets.values()).filter(w => w.status === 'restricted').length
    };
  }

  // Get Reconciliation Summary
  public getReconciliationSummary() {
    const wallets = this.getWallets();
    const driftedWallets = wallets.filter(w => !w.isReconciled);

    // Trial balance by Account
    const accountBalances = CHART_OF_ACCOUNTS.map(coa => {
      let totalDebits = 0;
      let totalCredits = 0;
      for (const j of this.journals) {
        for (const e of j.entries) {
          if (e.accountCode === coa.code) {
            totalDebits = FinanceLedgerEngine.round(totalDebits + e.debit);
            totalCredits = FinanceLedgerEngine.round(totalCredits + e.credit);
          }
        }
      }
      const net = coa.normalBalance === 'debit' ? (totalDebits - totalCredits) : (totalCredits - totalDebits);
      return {
        ...coa,
        totalDebits,
        totalCredits,
        netBalance: FinanceLedgerEngine.round(net)
      };
    });

    const sumDebits = FinanceLedgerEngine.round(accountBalances.reduce((acc, a) => acc + a.totalDebits, 0));
    const sumCredits = FinanceLedgerEngine.round(accountBalances.reduce((acc, a) => acc + a.totalCredits, 0));

    return {
      trialBalance: {
        accounts: accountBalances,
        totalDebits: sumDebits,
        totalCredits: sumCredits,
        isBalanced: Math.abs(sumDebits - sumCredits) === 0,
        difference: FinanceLedgerEngine.round(Math.abs(sumDebits - sumCredits))
      },
      walletAudit: {
        totalWalletsChecked: wallets.length,
        reconciledCount: wallets.filter(w => w.isReconciled).length,
        driftedCount: driftedWallets.length,
        driftedWallets
      },
      exceptions: this.exceptions
    };
  }

  public resolveException(exceptionId: string, notes: string, actor: string) {
    const ex = this.exceptions.find(e => e.id === exceptionId);
    if (!ex) throw new Error('Exception record not found');
    ex.status = 'resolved';
    ex.investigationNotes = notes;
    ex.resolvedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    this.auditLogs.unshift({
      id: `FAUD-${Date.now()}`,
      actor,
      role: 'super_admin',
      action: 'RECONCILIATION_EXCEPTION_RESOLVED',
      target: `Exception #${ex.id}`,
      reason: notes,
      timestamp: ex.resolvedAt
    });

    return ex;
  }

  // Getters for Read-Only Collections
  public getJournals() {
    return this.journals;
  }

  public getJournalById(id: string) {
    return this.journals.find(j => j.id === id);
  }

  public getTransactions() {
    return this.transactions;
  }

  public getTransactionById(id: string) {
    return this.transactions.find(t => t.id === id);
  }

  public getAuditLogs() {
    return this.auditLogs;
  }

  public getExceptions() {
    return this.exceptions;
  }

  // CSV Report Generator
  public generateCsvExport(reportType: string, filters: { currency?: string; startDate?: string; endDate?: string } = {}): { filename: string; content: string } {
    const now = new Date().toISOString().replace('T', '_').substring(0, 19);
    let rows: string[] = [];

    switch (reportType) {
      case 'trial_balance': {
        rows.push('"Account Code","Account Name","Account Type","Normal Balance","Total Debits","Total Credits","Net Balance"');
        const summary = this.getReconciliationSummary();
        for (const a of summary.trialBalance.accounts) {
          rows.push(`"${a.code}","${a.name}","${a.type}","${a.normalBalance}",${a.totalDebits.toFixed(2)},${a.totalCredits.toFixed(2)},${a.netBalance.toFixed(2)}`);
        }
        rows.push(`"TOTAL","Trial Balance Sum","","Balanced: ${summary.trialBalance.isBalanced}",${summary.trialBalance.totalDebits.toFixed(2)},${summary.trialBalance.totalCredits.toFixed(2)},${summary.trialBalance.difference.toFixed(2)}`);
        return { filename: `workperhour_trial_balance_${now}.csv`, content: rows.join('\n') };
      }

      case 'ledger_journals': {
        rows.push('"Journal ID","Posting Date","Reference","Event Type","Status","Account Code","Account Name","Debit","Credit","Description","User ID","Order ID"');
        for (const j of this.journals) {
          for (const e of j.entries) {
            rows.push(`"${j.id}","${j.postingDate}","${j.reference}","${j.eventType}","${j.status}","${e.accountCode}","${e.accountName}",${e.debit.toFixed(2)},${e.credit.toFixed(2)},"${e.description.replace(/"/g, '""')}","${e.userId || ''}","${e.orderId || ''}"`);
          }
        }
        return { filename: `workperhour_double_entry_ledger_${now}.csv`, content: rows.join('\n') };
      }

      case 'wallets': {
        rows.push('"Wallet ID","User ID","User Name","Email","Role","Currency","Available Balance","Escrow On Hold","Pending Incoming","Status","Ledger Reconciled"');
        for (const w of this.getWallets()) {
          rows.push(`"${w.id}","${w.userId}","${w.userName}","${w.userEmail}","${w.userRole}","${w.currency}",${w.availableBalance.toFixed(2)},${w.fundsOnHold.toFixed(2)},${w.pendingIncoming.toFixed(2)},"${w.status}","${w.isReconciled}"`);
        }
        return { filename: `workperhour_wallet_balances_${now}.csv`, content: rows.join('\n') };
      }

      case 'transactions': {
        rows.push('"Transaction ID","Type","Amount","Currency","Status","Timestamp","User Name","Role","Order ID","Journal ID","Description"');
        for (const t of this.transactions) {
          rows.push(`"${t.id}","${t.type}",${t.amount.toFixed(2)},"${t.currency}","${t.status}","${t.timestamp}","${t.userName}","${t.userRole}","${t.relatedOrderId || ''}","${t.journalId || ''}","${t.description.replace(/"/g, '""')}"`);
        }
        return { filename: `workperhour_financial_transactions_${now}.csv`, content: rows.join('\n') };
      }

      case 'audit_trail': {
        rows.push('"Log ID","Actor","Role","Action","Target","Reason","Journal ID","Timestamp"');
        for (const a of this.auditLogs) {
          rows.push(`"${a.id}","${a.actor}","${a.role}","${a.action}","${a.target}","${(a.reason || '').replace(/"/g, '""')}","${a.journalId || ''}","${a.timestamp}"`);
        }
        return { filename: `workperhour_financial_audit_${now}.csv`, content: rows.join('\n') };
      }

      default:
        throw new Error(`Unsupported export type: ${reportType}`);
    }
  }
}

// Global Singleton Instance for the application session
export const financeLedger = new FinanceLedgerEngine();

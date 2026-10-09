import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Search, Clock, DollarSign, CheckCircle2, AlertTriangle,
  ArrowRight, ArrowLeft, ExternalLink, Download, FileUp, Send,
  Lock, Unlock, MessageSquare, AlertCircle, FileText, Check, X,
  User, Copy, Sparkles, RefreshCw, Layers, ShieldCheck, Flag,
  ChevronRight, Calendar, UserX, MoreHorizontal, Play, Pause,
  Eye, Filter, ArrowUpRight, HelpCircle, FileCheck, Info, ShieldAlert
} from 'lucide-react';

export interface OrderItem {
  id: string;
  title: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  status: 'funded_in_escrow' | 'in_progress' | 'delivered' | 'completed' | 'disputed' | 'revision' | 'cancelled';
  createdAt: string;
  dueDate: string;
  requirements?: string;
  deliverables?: string;
  deliverableFiles?: Array<{ id: string; name: string; url: string; size: string; uploadedAt: string }>;
  revisions?: Array<{ id: string; requestedAt: string; reason: string; status: string }>;
  adminNotes?: string;
  isMuted?: boolean;
  isTimerPaused?: boolean;
  escrowProtectionStartDate?: string;
  escrowProtectionEndDate?: string;
  gigId?: string;
  projectId?: string;
  serviceUrl?: string;
  gigSlug?: string;
  sellerUsername?: string;
  buyerUsername?: string;
  serviceTitle?: string;
  serviceThumbnail?: string;
}

interface MessageItem {
  id: string;
  orderId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

interface UserAccount {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: string;
  avatar?: string;
  walletBalance?: number;
  isFlagged?: boolean;
  flagReason?: string;
}

interface AdminOrdersManagerProps {
  orders: OrderItem[];
  users: UserAccount[];
  gigs: any[];
  currentUser?: any;
  onRefreshOrders: () => void;
  getGigUrl: (gig: any) => string;
}

export const AdminOrdersManager: React.FC<AdminOrdersManagerProps> = ({
  orders,
  users,
  gigs,
  currentUser,
  onRefreshOrders,
  getGigUrl
}) => {
  // Navigation Sub-Tabs
  const [statusTab, setStatusTab] = useState<'all' | 'active' | 'delivered' | 'completed' | 'revision' | 'disputed' | 'cancelled'>('all');

  // Search & Efficiency Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [showHighValueOnly, setShowHighValueOnly] = useState(false);

  // Selected Order for Split-Screen Deep Link Workstream View
  const [activeWorkspaceOrder, setActiveWorkspaceOrder] = useState<OrderItem | null>(null);

  // Workstream Chat & Notes State
  const [workspaceMessages, setWorkspaceMessages] = useState<MessageItem[]>([]);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [chatMessageInput, setChatMessageInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Multi-Selection Checkboxes
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // Action Menu Dropdown (•••) State
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // User Profile Popover State
  const [activeProfilePopover, setActiveProfilePopover] = useState<{ userId: string; anchorRect: DOMRect | null } | null>(null);

  // Interactive Action Modals
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [extendTargetOrder, setExtendTargetOrder] = useState<OrderItem | null>(null);
  const [extendDaysCount, setExtendDaysCount] = useState<number>(2);
  const [extendReason, setExtendReason] = useState<string>('');

  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundTargetOrder, setRefundTargetOrder] = useState<OrderItem | null>(null);
  const [refundType, setRefundType] = useState<'full' | 'partial' | 'credit'>('full');
  const [partialRefundAmount, setPartialRefundAmount] = useState<number>(0);
  const [refundReason, setRefundReason] = useState<string>('');

  const [isOverrideUploadModalOpen, setIsOverrideUploadModalOpen] = useState(false);
  const [overrideFileName, setOverrideFileName] = useState('');
  const [overrideFileNotes, setOverrideFileNotes] = useState('');

  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [flagTargetUser, setFlagTargetUser] = useState<UserAccount | null>(null);
  const [flagReasonInput, setFlagReasonInput] = useState('');

  // UI Feedback Toast
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.action-menu-container') && !target.closest('.action-menu-trigger')) {
        setOpenActionMenuId(null);
      }
      if (!target.closest('.profile-popover-container') && !target.closest('.profile-popover-card')) {
        setActiveProfilePopover(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Fetch real-time chat messages when active workspace is opened
  useEffect(() => {
    if (activeWorkspaceOrder) {
      fetchWorkspaceMessages(activeWorkspaceOrder.id);
      const refreshed = orders.find(o => o.id === activeWorkspaceOrder.id);
      if (refreshed) {
        setActiveWorkspaceOrder(refreshed);
        setAdminNoteInput(refreshed.adminNotes || '');
      }
    }
  }, [activeWorkspaceOrder?.id, orders]);

  // Open Workstream View
  const handleOpenWorkspace = (order: OrderItem) => {
    setActiveWorkspaceOrder(order);
    setAdminNoteInput(order.adminNotes || '');
    setOpenActionMenuId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseWorkspace = () => {
    setActiveWorkspaceOrder(null);
    onRefreshOrders();
  };

  const fetchWorkspaceMessages = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`);
      if (res.ok) {
        const msgs = await res.json();
        setWorkspaceMessages(msgs);
        setTimeout(() => {
          if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
          }
        }, 100);
      }
    } catch (err) {
      console.warn('Failed to fetch order messages:', err);
    }
  };

  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const resolveOrderUrl = (order: OrderItem): string => {
    if (order.gigId) {
      const foundGig = gigs.find(g => g.id === order.gigId);
      if (foundGig) return getGigUrl(foundGig);
    }
    const slug = order.gigSlug || order.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    return `/gigs/${order.gigId || 'gig_1'}?slug=${encodeURIComponent(slug)}`;
  };

  const getOrderThumbnail = (order: OrderItem): string => {
    if (order.serviceThumbnail) return order.serviceThumbnail;
    if (order.gigId) {
      const foundGig = gigs.find(g => g.id === order.gigId);
      if (foundGig && foundGig.image) return foundGig.image;
    }
    return 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=400&q=80';
  };

  const getDueTimeStatus = (dueDateStr: string, status: string, isPaused?: boolean) => {
    if (status === 'completed' || status === 'cancelled') {
      return { text: status === 'completed' ? 'Delivered & Released' : 'Order Closed', color: 'text-slate-500', isOverdue: false };
    }
    if (isPaused) {
      return { text: 'Timer Paused (Admin)', color: 'text-amber-600', isOverdue: false, isPaused: true };
    }
    const dueTime = new Date(dueDateStr).getTime();
    const nowTime = new Date().getTime();
    const diffMs = dueTime - nowTime;

    if (diffMs < 0) {
      const daysOver = Math.abs(Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      const hoursOver = Math.abs(Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
      return {
        text: `Overdue by ${daysOver}d ${hoursOver}h`,
        color: 'text-red-600 font-extrabold',
        isOverdue: true
      };
    } else {
      const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      return {
        text: `${daysLeft}d ${hoursLeft}h remaining`,
        color: daysLeft <= 1 ? 'text-amber-600 font-bold' : 'text-slate-600',
        isOverdue: false
      };
    }
  };

  const getStatusBadge = (status: OrderItem['status']) => {
    switch (status) {
      case 'in_progress':
      case 'funded_in_escrow':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5 inline-flex">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span>In Progress</span>
          </span>
        );
      case 'delivered':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1.5 inline-flex">
            <CheckCircle2 className="w-3 h-3 text-purple-600" />
            <span>Delivered</span>
          </span>
        );
      case 'revision':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5 inline-flex">
            <RefreshCw className="w-3 h-3 text-amber-600" />
            <span>In Revision</span>
          </span>
        );
      case 'disputed':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200 flex items-center gap-1.5 inline-flex animate-pulse">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            <span>Disputed / Escalated</span>
          </span>
        );
      case 'completed':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 inline-flex">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Completed</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1.5 inline-flex">
            <X className="w-3 h-3 text-slate-500" />
            <span>Cancelled / Refunded</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  // Action: Save Admin Notes
  const handleSaveAdminNote = async () => {
    if (!activeWorkspaceOrder) return;
    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/orders/${activeWorkspaceOrder.id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes: adminNoteInput })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveWorkspaceOrder(prev => prev ? { ...prev, adminNotes: data.adminNotes } : null);
        setActionFeedback({ type: 'success', message: 'Internal administrator note saved successfully!' });
        onRefreshOrders();
      }
    } catch (err) {
      console.error(err);
      setActionFeedback({ type: 'error', message: 'Failed to update administrative notes.' });
    } finally {
      setIsSavingNote(false);
    }
  };

  // Action: Send Real-Time Chat Message as Super Admin
  const handleSendAdminChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceOrder || !chatMessageInput.trim()) return;
    setIsSendingMessage(true);
    try {
      const res = await fetch(`/api/orders/${activeWorkspaceOrder.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser?.id || 'user_admin',
          senderName: currentUser?.name ? `${currentUser.name} (Super Admin)` : 'WorkPerHour Admin Support',
          text: `[ADMIN BROADCAST]: ${chatMessageInput.trim()}`
        })
      });
      if (res.ok) {
        const newMsg = await res.json();
        setWorkspaceMessages(prev => [...prev, newMsg]);
        setChatMessageInput('');
        setTimeout(() => {
          if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
          }
        }, 100);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Action: Mute / Unmute Workspace
  const handleToggleMuteWorkspace = async (order?: OrderItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = order || activeWorkspaceOrder;
    if (!target) return;

    try {
      const res = await fetch(`/api/orders/${target.id}/mute`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (activeWorkspaceOrder && activeWorkspaceOrder.id === target.id) {
          setActiveWorkspaceOrder(prev => prev ? { ...prev, isMuted: data.isMuted } : null);
        }
        setActionFeedback({
          type: 'success',
          message: data.isMuted ? `Workspace #${target.id} communication muted.` : `Workspace #${target.id} communication unmuted.`
        });
        onRefreshOrders();
      }
    } catch (err) {
      console.error(err);
      setActionFeedback({ type: 'error', message: 'Failed to toggle chat mute state.' });
    }
    setOpenActionMenuId(null);
  };

  // Action: Pause / Unpause Countdown Timer
  const handleTogglePauseTimer = async (order?: OrderItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = order || activeWorkspaceOrder;
    if (!target) return;

    try {
      const res = await fetch(`/api/orders/${target.id}/pause-timer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (activeWorkspaceOrder && activeWorkspaceOrder.id === target.id) {
          setActiveWorkspaceOrder(prev => prev ? { ...prev, isTimerPaused: data.isTimerPaused } : null);
        }
        setActionFeedback({
          type: 'success',
          message: data.isTimerPaused ? `Countdown timer for #${target.id} paused.` : `Countdown timer for #${target.id} resumed.`
        });
        onRefreshOrders();
      }
    } catch (err) {
      console.error(err);
      setActionFeedback({ type: 'error', message: 'Failed to toggle timer pause state.' });
    }
    setOpenActionMenuId(null);
  };

  // Action: Open Extend Deadline Modal
  const handleOpenExtendModal = (order?: OrderItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = order || activeWorkspaceOrder;
    if (!target) return;
    setExtendTargetOrder(target);
    setExtendDaysCount(2);
    setExtendReason('');
    setIsExtendModalOpen(true);
    setOpenActionMenuId(null);
  };

  // Action: Open Force Cancel & Refund Modal
  const handleOpenRefundModal = (order?: OrderItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = order || activeWorkspaceOrder;
    if (!target) return;
    setRefundTargetOrder(target);
    setRefundType('full');
    setPartialRefundAmount(Math.round(target.amount / 2));
    setRefundReason('');
    setIsRefundModalOpen(true);
    setOpenActionMenuId(null);
  };

  // Action: Force Complete & Release Funds
  const handleExecuteReleaseFunds = async (order?: OrderItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = order || activeWorkspaceOrder;
    if (!target) return;
    const netPayout = (target.amount * 0.9).toFixed(2);
    const confirmMsg = `Are you sure you want to approve Order #${target.id} and release $${netPayout} net to the freelancer?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/orders/${target.id}/force-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: currentUser?.name || 'Super Admin' })
      });
      if (res.ok) {
        const data = await res.json();
        if (activeWorkspaceOrder && activeWorkspaceOrder.id === target.id) {
          setActiveWorkspaceOrder(data.order);
        }
        setActionFeedback({ type: 'success', message: `Order #${target.id} force completed. Funds released to freelancer wallet!` });
        onRefreshOrders();
      } else {
        const errData = await res.json();
        setActionFeedback({ type: 'error', message: errData.error || 'Failed to release escrow funds.' });
      }
    } catch (err) {
      console.error(err);
      setActionFeedback({ type: 'error', message: 'Network error releasing funds.' });
    }
    setOpenActionMenuId(null);
  };

  // Action: Cancel & Refund
  const handleExecuteRefund = async () => {
    const target = refundTargetOrder || activeWorkspaceOrder;
    if (!target) return;
    try {
      const res = await fetch(`/api/orders/${target.id}/force-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refundType,
          customAmount: refundType === 'partial' ? partialRefundAmount : target.amount,
          reason: refundReason || 'Administrative cancellation and refund',
          actor: currentUser?.name || 'Super Admin'
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (activeWorkspaceOrder && activeWorkspaceOrder.id === target.id) {
          setActiveWorkspaceOrder(data.order);
        }
        setIsRefundModalOpen(false);
        setActionFeedback({ type: 'success', message: `Order #${target.id} cancelled. ${refundType.toUpperCase()} refund processed!` });
        onRefreshOrders();
      } else {
        const err = await res.json();
        setActionFeedback({ type: 'error', message: err.error || 'Failed to process refund.' });
      }
    } catch (err) {
      console.error(err);
      setActionFeedback({ type: 'error', message: 'Failed to process refund.' });
    }
  };

  // Action: Execute Extend Deadline
  const handleExecuteExtendDeadline = async () => {
    const target = extendTargetOrder || activeWorkspaceOrder;
    if (!target) return;
    try {
      const res = await fetch(`/api/orders/${target.id}/extend-deadline`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: extendDaysCount,
          reason: extendReason || 'Extended by Super Admin intervention'
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (activeWorkspaceOrder && activeWorkspaceOrder.id === target.id) {
          setActiveWorkspaceOrder(data.order);
        }
        setIsExtendModalOpen(false);
        setActionFeedback({ type: 'success', message: `Order #${target.id} deadline successfully extended by ${extendDaysCount} days!` });
        onRefreshOrders();
      } else {
        const err = await res.json();
        setActionFeedback({ type: 'error', message: err.error || 'Failed to extend deadline.' });
      }
    } catch (err) {
      console.error(err);
      setActionFeedback({ type: 'error', message: 'Failed to extend deadline.' });
    }
  };

  // Action: Override Deliverable File Upload
  const handleExecuteOverrideUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceOrder || !overrideFileName.trim()) return;
    try {
      const res = await fetch(`/api/orders/${activeWorkspaceOrder.id}/deliverable-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: overrideFileName.trim(),
          url: `https://workperhour-storage.internal/files/${encodeURIComponent(overrideFileName.trim())}`,
          size: '4.8 MB',
          notes: overrideFileNotes || 'Uploaded by Super Admin override',
          actor: currentUser?.name || 'Super Admin'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveWorkspaceOrder(data.order);
        setIsOverrideUploadModalOpen(false);
        setOverrideFileName('');
        setOverrideFileNotes('');
        setActionFeedback({ type: 'success', message: 'Corrected deliverable file uploaded on behalf of seller.' });
        onRefreshOrders();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Open Flag User Modal
  const handleOpenFlagModal = (user: UserAccount, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFlagTargetUser(user);
    setFlagReasonInput(user.flagReason || 'Terms of Service violation / Under investigation');
    setIsFlagModalOpen(true);
    setActiveProfilePopover(null);
    setOpenActionMenuId(null);
  };

  // Action: Execute Flag User
  const handleExecuteFlagUser = async () => {
    if (!flagTargetUser) return;
    try {
      const res = await fetch(`/api/users/${flagTargetUser.id}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: flagReasonInput })
      });
      if (res.ok) {
        const data = await res.json();
        setIsFlagModalOpen(false);
        setActionFeedback({
          type: 'success',
          message: data.isFlagged
            ? `User ${flagTargetUser.name} has been flagged for TOS investigation.`
            : `Flag removed from ${flagTargetUser.name}.`
        });
        onRefreshOrders();
      }
    } catch (err) {
      console.error(err);
      setActionFeedback({ type: 'error', message: 'Failed to update user flag status.' });
    }
  };

  // Quick Status Count Badges
  const counts = {
    all: orders.length,
    active: orders.filter(o => o.status === 'in_progress' || o.status === 'funded_in_escrow').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revision: orders.filter(o => o.status === 'revision').length,
    disputed: orders.filter(o => o.status === 'disputed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length
  };

  // =========================================================================
  // VIEW 1: DEDICATED WORKSTREAM SPLIT-SCREEN WORKSPACE (WHITE THEME)
  // =========================================================================
  if (activeWorkspaceOrder) {
    const o = activeWorkspaceOrder;
    const buyer = users.find(u => u.id === o.buyerId);
    const seller = users.find(u => u.id === o.sellerId);
    const serviceUrl = resolveOrderUrl(o);
    const dueTime = getDueTimeStatus(o.dueDate, o.status, o.isTimerPaused);
    const platformCommission = Math.round(o.amount * 0.10);
    const freelancerNet = o.amount - platformCommission;

    return (
      <div className="space-y-6">
        {/* Workspace Top Header */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCloseWorkspace}
                className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-emerald-600" />
                <span>Back to All Orders</span>
              </button>

              <div className="flex items-center gap-3">
                <img
                  src={getOrderThumbnail(o)}
                  alt={o.title}
                  className="w-12 h-12 rounded-xl object-cover ring-1 ring-slate-200"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      #{o.id}
                    </span>
                    <h2 className="text-base font-extrabold text-slate-900 truncate max-w-md">
                      {o.title}
                    </h2>
                    <a
                      href={serviceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-emerald-600 p-1"
                      title="View Public Service Webpage"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>Placed on {o.createdAt}</span>
                    <span>·</span>
                    <span className={`font-semibold ${dueTime.color}`}>
                      Due: {o.dueDate} ({dueTime.text})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {getStatusBadge(o.status)}

              {/* Toggle Timer Pause Shortcut */}
              <button
                onClick={e => handleTogglePauseTimer(o, e)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  o.isTimerPaused
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {o.isTimerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{o.isTimerPaused ? 'Resume Timer' : 'Pause Timer'}</span>
              </button>

              {/* Mute Workspace Shortcut */}
              <button
                onClick={e => handleToggleMuteWorkspace(o, e)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  o.isMuted
                    ? 'bg-red-50 text-red-700 border-red-300'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {o.isMuted ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{o.isMuted ? 'Unmute Workspace' : 'Mute Workspace'}</span>
              </button>
            </div>
          </div>

          {/* Quick Notice Banner if Muted or Paused */}
          {(o.isMuted || o.isTimerPaused || o.status === 'disputed') && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {o.isMuted && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0 text-red-600" />
                  <span>Buyer/Seller chat is currently <strong>MUTED</strong> by administrative order.</span>
                </div>
              )}
              {o.isTimerPaused && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
                  <Pause className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Delivery countdown timer is <strong>PAUSED</strong>. Auto-late penalties are suspended.</span>
                </div>
              )}
              {o.status === 'disputed' && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>Active dispute escalation requires arbitration intervention.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* MAIN SPLIT-SCREEN WORKSPACE GRID */}
        {/* =================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ================================================================= */}
          {/* LEFT PANEL (7 / 12 Cols): Real-Time Communication & Activity Log */}
          {/* ================================================================= */}
          <div className="lg:col-span-7 space-y-6">
            {/* Card 1: Order Scope & Requirements */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-3 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>1. Buyer Requirements & Scope Brief</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-400">Locked Scope</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200 whitespace-pre-wrap font-sans">
                {o.requirements || 'No custom brief provided by buyer.'}
              </p>
            </div>

            {/* Card 2: Deliverables & Submitted Files */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-purple-600" />
                  <h3 className="text-sm font-bold text-slate-900">2. Deliverables & Submitted Files</h3>
                </div>
                <button
                  onClick={() => setIsOverrideUploadModalOpen(true)}
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-xl text-xs border border-purple-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Upload Override File</span>
                </button>
              </div>

              {o.deliverableFiles && o.deliverableFiles.length > 0 ? (
                <div className="space-y-2.5">
                  {o.deliverableFiles.map(file => (
                    <div
                      key={file.id}
                      className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-purple-100 text-purple-700 shrink-0">
                          <Download className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-900 block truncate" title={file.name}>
                            {file.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {file.size} · Uploaded {file.uploadedAt}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={file.url}
                          download={file.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5 text-purple-600" />
                          <span>Download</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                  <p className="text-xs text-slate-500">No deliverable files submitted by seller yet.</p>
                </div>
              )}
            </div>

            {/* Card 3: Revision History */}
            {o.revisions && o.revisions.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-3 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-amber-600" />
                    <span>3. Revision History & Buyer Change Requests</span>
                  </h3>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {o.revisions.length} Requests
                  </span>
                </div>
                <div className="space-y-2.5">
                  {o.revisions.map((rev, idx) => (
                    <div key={rev.id || idx} className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200 text-xs space-y-1">
                      <div className="flex items-center justify-between text-amber-800 font-bold">
                        <span>Revision #{idx + 1} - Status: {rev.status}</span>
                        <span className="text-[10px] text-amber-600 font-mono">{rev.requestedAt}</span>
                      </div>
                      <p className="text-slate-700 font-medium">{rev.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Card 4: Real-Time Communication & Activity Feed */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <span>4. Live Chat Feed & System Event Logs</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">Transparent audit of all messages and automated system events.</p>
                </div>
                <button
                  onClick={() => fetchWorkspaceMessages(o.id)}
                  className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-colors"
                  title="Refresh Chat Feed"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Chat Timeline Box */}
              <div
                ref={chatScrollRef}
                className="h-80 overflow-y-auto space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 scrollbar-thin"
              >
                {workspaceMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                    No conversation or system messages recorded for this order yet.
                  </div>
                ) : (
                  workspaceMessages.map(msg => {
                    const isSystem = msg.senderId === 'system' || msg.text.startsWith('[SYSTEM EVENT]');
                    const isAdmin = msg.senderId === 'user_admin' || (msg as any).senderRole === 'admin';
                    const isBuyerMsg = msg.senderId === o.buyerId;

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 text-[11px] text-slate-600 text-center font-mono">
                          <span className="font-bold text-emerald-700">⚙️ SYSTEM EVENT:</span> {msg.text.replace('[SYSTEM EVENT]:', '').trim()}
                          <span className="block text-[9px] text-slate-400 mt-0.5">{msg.timestamp}</span>
                        </div>
                      );
                    }

                    if (isAdmin) {
                      return (
                        <div key={msg.id} className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 ml-4 shadow-xs">
                          <div className="flex items-center justify-between font-bold text-[10px] text-purple-700 mb-1">
                            <span>🛡️ {msg.senderName} (Super Admin)</span>
                            <span className="font-mono text-slate-400">{msg.timestamp}</span>
                          </div>
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-2xl border text-xs max-w-[85%] ${
                          isBuyerMsg
                            ? 'bg-blue-50 border-blue-200 text-slate-800 mr-auto'
                            : 'bg-white border-slate-200 text-slate-800 ml-auto shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                          <span className={isBuyerMsg ? 'text-blue-700' : 'text-emerald-700'}>
                            {msg.senderName} {isBuyerMsg ? '(Buyer)' : '(Freelancer)'}
                          </span>
                          <span className="font-mono text-slate-400">{msg.timestamp}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-slate-800">{msg.text}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Administrative Message Broadcast Form */}
              <form onSubmit={handleSendAdminChatMessage} className="flex gap-2">
                <input
                  type="text"
                  value={chatMessageInput}
                  disabled={isSendingMessage}
                  onChange={e => setChatMessageInput(e.target.value)}
                  placeholder={o.isMuted ? 'Chat is currently muted by Administrator...' : 'Post administrative broadcast message into order workspace...'}
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 font-sans"
                />
                <button
                  type="submit"
                  disabled={isSendingMessage || !chatMessageInput.trim()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send as Admin</span>
                </button>
              </form>
            </div>

            {/* Card 5: Admin Private Sticky Notes Box */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-3 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    5. Admin Private Sticky Notes (Visible to Staff Only)
                  </h3>
                </div>
                <span className="text-[10px] uppercase font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  CONFIDENTIAL INTERNAL
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Sticky case notes left by administrators regarding delivery checks, buyer revision abuse, or fraud audits.
              </p>
              <textarea
                rows={3}
                value={adminNoteInput}
                onChange={e => setAdminNoteInput(e.target.value)}
                placeholder="Write internal staff notes (e.g., 'Checked delivery files—clean zip, no malware. Buyer abusing revision policy')..."
                className="w-full p-3 bg-amber-50/30 border border-amber-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-amber-500 font-sans leading-relaxed"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAdminNote}
                  disabled={isSavingNote}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isSavingNote ? 'Saving Notes...' : 'Save Private Sticky Note'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* RIGHT PANEL (5 / 12 Cols): Admin Control Widget (WHITE THEME) */}
          {/* ================================================================= */}
          <div className="lg:col-span-5 space-y-6">
            {/* Card 1: Financial Breakdown & Escrow State */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Financial Breakdown & Escrow State</span>
                </h3>
                <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                  14-Day Vault Active
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Gross Order Value:</span>
                  <span className="font-mono font-bold text-slate-900">${o.amount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Platform Commission (10%):</span>
                  <span className="font-mono font-bold text-emerald-600">-${platformCommission.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Freelancer Payout (Net 90%):</span>
                  <span className="font-mono font-bold text-blue-600">${freelancerNet.toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-bold text-slate-900">Current Escrow State:</span>
                  <span className="font-mono font-black text-xs uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {o.status === 'completed' ? 'RELEASED' : o.status === 'cancelled' ? 'REFUNDED' : 'HELD IN VAULT'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div className="flex items-center justify-between font-mono">
                  <span>Protection Window:</span>
                  <span className="text-slate-900 font-semibold">{o.escrowProtectionStartDate || o.createdAt} → {o.escrowProtectionEndDate || o.dueDate}</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Funds held in double-entry escrow ledger. Release or cancellation directly reflects on double-entry balances.
                </p>
              </div>
            </div>

            {/* Card 2: Quick Resolution Controls */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Quick Resolution Controls</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Super-Admin Access
                </span>
              </div>

              <div className="space-y-2.5">
                {/* 1. Force Complete Order */}
                <button
                  type="button"
                  disabled={o.status === 'completed' || o.status === 'cancelled'}
                  onClick={() => handleExecuteReleaseFunds()}
                  className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-between transition-colors cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span>Force Complete Order</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-100">Release ${freelancerNet}</span>
                </button>

                {/* 2. Force Cancel & Refund */}
                <button
                  type="button"
                  disabled={o.status === 'cancelled'}
                  onClick={() => handleOpenRefundModal()}
                  className="w-full py-3 px-4 rounded-2xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 disabled:opacity-40 font-bold text-xs flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span>Force Cancel & Refund</span>
                  </div>
                  <span className="text-[10px] font-mono">Full / Partial / Credit</span>
                </button>

                {/* 3. Extend Deadline / Adjust Time */}
                <button
                  type="button"
                  disabled={o.status === 'completed' || o.status === 'cancelled'}
                  onClick={() => handleOpenExtendModal()}
                  className="w-full py-3 px-4 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 disabled:opacity-40 font-bold text-xs flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Extend Deadline / Adjust Time</span>
                  </div>
                  <span className="text-[10px] font-mono">+1d, +2d, +5d Custom</span>
                </button>

                {/* 4. Pause / Resume Countdown Timer */}
                <button
                  type="button"
                  onClick={e => handleTogglePauseTimer(o, e)}
                  className={`w-full py-3 px-4 rounded-2xl border font-bold text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    o.isTimerPaused
                      ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {o.isTimerPaused ? <Play className="w-4 h-4 text-amber-600" /> : <Pause className="w-4 h-4 text-slate-600" />}
                    <span>{o.isTimerPaused ? 'Resume Delivery Timer' : 'Pause Delivery Timer'}</span>
                  </div>
                  <span className="text-[10px] font-mono">{o.isTimerPaused ? 'PAUSED' : 'RUNNING'}</span>
                </button>
              </div>
            </div>

            {/* Card 3: Escalation / Moderation Actions */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Flag className="w-4 h-4 text-red-600" />
                  <span>Escalation & Moderation Actions</span>
                </h3>
              </div>

              <div className="space-y-2.5">
                {/* Mute Workspace Toggle */}
                <button
                  type="button"
                  onClick={e => handleToggleMuteWorkspace(o, e)}
                  className={`w-full py-2.5 px-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                    o.isMuted
                      ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {o.isMuted ? <Unlock className="w-3.5 h-3.5 text-red-600" /> : <Lock className="w-3.5 h-3.5 text-slate-600" />}
                    <span>{o.isMuted ? 'Unmute Workspace Messaging' : 'Mute Workspace Messaging'}</span>
                  </div>
                  <span className="text-[10px]">{o.isMuted ? 'MUTED' : 'UNMUTED'}</span>
                </button>

                {/* Flag Buyer */}
                {buyer && (
                  <button
                    type="button"
                    onClick={e => handleOpenFlagModal(buyer, e)}
                    className="w-full py-2.5 px-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Flag className="w-3.5 h-3.5 text-red-500" />
                      <span>Flag / Moderate Buyer ({buyer.name})</span>
                    </div>
                    <span className="text-[10px] text-red-600">{buyer.isFlagged ? 'FLAGGED' : 'AUDIT'}</span>
                  </button>
                )}

                {/* Flag Seller */}
                {seller && (
                  <button
                    type="button"
                    onClick={e => handleOpenFlagModal(seller, e)}
                    className="w-full py-2.5 px-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Flag className="w-3.5 h-3.5 text-red-500" />
                      <span>Flag / Moderate Seller ({seller.name})</span>
                    </div>
                    <span className="text-[10px] text-red-600">{seller.isFlagged ? 'FLAGGED' : 'AUDIT'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Card 4: Parties Involved Cards */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                Parties Involved in Order
              </h3>

              {/* Buyer Card */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                    {buyer?.name?.[0] || 'B'}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{buyer?.name || o.buyerId}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{buyer?.email || `${o.buyerId}@buyer.internal`}</span>
                    <span className="text-[10px] text-blue-700 font-bold block mt-0.5">Role: Buyer · Balance: ${(buyer?.walletBalance || 0).toFixed(2)}</span>
                  </div>
                </div>
                {buyer && (
                  <button
                    onClick={e => handleOpenFlagModal(buyer, e)}
                    className="p-1.5 hover:bg-slate-200 rounded-xl text-slate-500 hover:text-red-600 transition-colors"
                    title="Audit / Flag User"
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Seller Card */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                    {seller?.name?.[0] || 'S'}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{seller?.name || o.sellerId}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{seller?.email || `${o.sellerId}@seller.internal`}</span>
                    <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">Role: Freelancer · Balance: ${(seller?.walletBalance || 0).toFixed(2)}</span>
                  </div>
                </div>
                {seller && (
                  <button
                    onClick={e => handleOpenFlagModal(seller, e)}
                    className="p-1.5 hover:bg-slate-200 rounded-xl text-slate-500 hover:text-red-600 transition-colors"
                    title="Audit / Flag User"
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* INTERACTIVE WORKSPACE MODALS (WHITE THEME) */}
        {/* =================================================================== */}

        {/* Modal: Extend Deadline */}
        {isExtendModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>Extend Deadline & Prevent Late Penalty</span>
                </h3>
                <button onClick={() => setIsExtendModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-600">
                Add extra days to Order #{extendTargetOrder?.id || o.id}. This adjusts the countdown timer and suppresses auto-late penalties.
              </p>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Choose Extension Days:</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 5, 7].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setExtendDaysCount(d)}
                      className={`py-2 rounded-xl text-xs font-bold font-mono border transition-colors cursor-pointer ${
                        extendDaysCount === d
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      +{d} Days
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Custom Days:</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={extendDaysCount}
                  onChange={e => setExtendDaysCount(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Reason for Extension:</label>
                <input
                  type="text"
                  value={extendReason}
                  onChange={e => setExtendReason(e.target.value)}
                  placeholder="e.g. Buyer submitted late brief clarification"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsExtendModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteExtendDeadline}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm"
                >
                  Apply Extension
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Force Cancel & Refund */}
        {isRefundModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>Force Cancel Order & Process Refund</span>
                </h3>
                <button onClick={() => setIsRefundModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Refund Type:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundType('full')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                      refundType === 'full'
                        ? 'bg-red-50 text-red-700 border-red-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Full Refund
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundType('partial')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                      refundType === 'partial'
                        ? 'bg-red-50 text-red-700 border-red-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Partial Refund
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundType('credit')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                      refundType === 'credit'
                        ? 'bg-red-50 text-red-700 border-red-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Credit to Buyer
                  </button>
                </div>
              </div>

              {refundType === 'partial' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Partial Refund Amount ($):</label>
                  <input
                    type="number"
                    min="1"
                    max={refundTargetOrder?.amount || o.amount}
                    value={partialRefundAmount}
                    onChange={e => setPartialRefundAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-red-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
                    Max refundable: ${(refundTargetOrder?.amount || o.amount).toFixed(2)}
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Reason for Administrative Cancellation:</label>
                <textarea
                  rows={2}
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  placeholder="Specify arbitration rationale or violation notes..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-red-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRefundModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRefund}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-sm"
                >
                  Execute Cancellation & Refund
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Override Deliverable File */}
        {isOverrideUploadModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileUp className="w-4 h-4 text-purple-600" />
                  <span>Upload Override File on Behalf of Seller</span>
                </h3>
                <button onClick={() => setIsOverrideUploadModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-600">
                Inject verified, clean files directly into the order deliverables archive with staff audit trails.
              </p>

              <form onSubmit={handleExecuteOverrideUpload} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">File Name & Extension:</label>
                  <input
                    type="text"
                    required
                    value={overrideFileName}
                    onChange={e => setOverrideFileName(e.target.value)}
                    placeholder="e.g. verified_clean_build_v2.zip"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Staff Verification Notes:</label>
                  <textarea
                    rows={2}
                    value={overrideFileNotes}
                    onChange={e => setOverrideFileNotes(e.target.value)}
                    placeholder="Scanned for malware; corrected formatting on behalf of freelancer..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-purple-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsOverrideUploadModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs shadow-sm"
                  >
                    Commit File Upload
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Flag / Ban User */}
        {isFlagModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Flag className="w-4 h-4 text-red-600" />
                  <span>Flag User for TOS Investigation</span>
                </h3>
                <button onClick={() => setIsFlagModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                  {flagTargetUser?.name?.[0] || 'U'}
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 block">{flagTargetUser?.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{flagTargetUser?.email}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Investigation / Flag Reason:</label>
                <textarea
                  rows={3}
                  value={flagReasonInput}
                  onChange={e => setFlagReasonInput(e.target.value)}
                  placeholder="Specify violation (e.g. repeated bad faith revision requests, TOS off-platform payment attempt)..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-red-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFlagModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteFlagUser}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-sm"
                >
                  {flagTargetUser?.isFlagged ? 'Update Flag Status' : 'Flag User Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: MAIN ORDERS TABLE VIEW (WHITE THEME)
  // =========================================================================

  // Filter orders by sub-tab and search query
  const filteredOrders = orders.filter(o => {
    // 1. Status Sub-Tab
    let matchesStatus = true;
    if (statusTab === 'active') matchesStatus = o.status === 'in_progress' || o.status === 'funded_in_escrow';
    else if (statusTab === 'delivered') matchesStatus = o.status === 'delivered';
    else if (statusTab === 'completed') matchesStatus = o.status === 'completed';
    else if (statusTab === 'revision') matchesStatus = o.status === 'revision';
    else if (statusTab === 'disputed') matchesStatus = o.status === 'disputed';
    else if (statusTab === 'cancelled') matchesStatus = o.status === 'cancelled';

    // 2. Global Search across Order ID, Buyer, Seller, Gig Title, Slugs
    const query = searchQuery.toLowerCase().trim();
    const buyer = users.find(u => u.id === o.buyerId);
    const seller = users.find(u => u.id === o.sellerId);

    const matchesSearch = !query ||
      o.id.toLowerCase().includes(query) ||
      o.title.toLowerCase().includes(query) ||
      (o.requirements && o.requirements.toLowerCase().includes(query)) ||
      (buyer && (buyer.name.toLowerCase().includes(query) || (buyer.username && buyer.username.toLowerCase().includes(query)) || buyer.email.toLowerCase().includes(query))) ||
      (seller && (seller.name.toLowerCase().includes(query) || (seller.username && seller.username.toLowerCase().includes(query)) || seller.email.toLowerCase().includes(query)));

    // 3. Efficiency Filters
    let matchesOverdue = true;
    if (showOverdueOnly) {
      const dueStatus = getDueTimeStatus(o.dueDate, o.status, o.isTimerPaused);
      matchesOverdue = dueStatus.isOverdue;
    }

    let matchesHighValue = true;
    if (showHighValueOnly) {
      matchesHighValue = o.amount >= 500;
    }

    return matchesStatus && matchesSearch && matchesOverdue && matchesHighValue;
  });

  return (
    <div className="space-y-6">
      {/* 1. Status Sub-Tabs Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All Orders', count: counts.all, color: 'text-slate-900' },
            { id: 'active', label: 'Active / In Progress', count: counts.active, color: 'text-blue-600' },
            { id: 'delivered', label: 'Delivered', count: counts.delivered, color: 'text-purple-600' },
            { id: 'completed', label: 'Completed', count: counts.completed, color: 'text-emerald-600' },
            { id: 'revision', label: 'In Revision', count: counts.revision, color: 'text-amber-600' },
            { id: 'disputed', label: 'Disputed / Escalated', count: counts.disputed, color: 'text-red-600', isAttention: counts.disputed > 0 },
            { id: 'cancelled', label: 'Cancelled / Refunded', count: counts.cancelled, color: 'text-slate-500' }
          ].map(tab => {
            const isActive = statusTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusTab(tab.id as any)}
                className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border ${
                  isActive
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                    : 'bg-transparent border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  tab.isAttention 
                    ? 'bg-red-50 text-red-700 font-extrabold border border-red-200 animate-pulse'
                    : isActive 
                    ? 'bg-slate-800 text-emerald-400' 
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Controls & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search by Order ID, Buyer, Freelancer, Gig Title, or Transaction..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Filter 1: Overdue Only */}
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={showOverdueOnly}
                onChange={e => setShowOverdueOnly(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-0 cursor-pointer"
              />
              <span className={showOverdueOnly ? 'text-red-700 font-bold' : ''}>⚠️ Overdue Only</span>
            </label>

            {/* Filter 2: High Value ($500+) */}
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={showHighValueOnly}
                onChange={e => setShowHighValueOnly(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-0 cursor-pointer"
              />
              <span className={showHighValueOnly ? 'text-emerald-700 font-bold' : ''}>💎 High Value ($500+)</span>
            </label>

            {/* Multi-Select Bulk Actions / Export */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const targetList = selectedOrderIds.length > 0 
                    ? orders.filter(o => selectedOrderIds.includes(o.id))
                    : filteredOrders;
                  const csvRows = [
                    'Order ID,Title,Buyer,Seller,Amount,Status,Due Date,Requirements',
                    ...targetList.map(o => {
                      const buyer = users.find(u => u.id === o.buyerId)?.name || o.buyerId;
                      const seller = users.find(u => u.id === o.sellerId)?.name || o.sellerId;
                      return `"${o.id}","${o.title.replace(/"/g, '""')}","${buyer}","${seller}",${o.amount},"${o.status}","${o.dueDate}","${(o.requirements || '').replace(/"/g, '""')}"`;
                    })
                  ];
                  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `orders_export_${Date.now()}.csv`;
                  a.click();
                }}
                className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export CSV ({selectedOrderIds.length > 0 ? selectedOrderIds.length : filteredOrders.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <span>{actionFeedback.message}</span>
            <button onClick={() => setActionFeedback(null)} className="text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Orders Table (WHITE THEME) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    checked={selectedOrderIds.length > 0 && selectedOrderIds.length === filteredOrders.length}
                    onChange={e => {
                      if (e.target.checked) setSelectedOrderIds(filteredOrders.map(o => o.id));
                      else setSelectedOrderIds([]);
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 cursor-pointer"
                  />
                </th>
                <th className="p-4">Order ID</th>
                <th className="p-4">Gig / Service</th>
                <th className="p-4">Buyer & Seller</th>
                <th className="p-4">Status</th>
                <th className="p-4">Countdown / Due Date</th>
                <th className="p-4 text-right">Workstream Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredOrders.map(o => {
                const buyer = users.find(u => u.id === o.buyerId);
                const seller = users.find(u => u.id === o.sellerId);
                const serviceUrl = resolveOrderUrl(o);
                const dueTime = getDueTimeStatus(o.dueDate, o.status, o.isTimerPaused);
                const isSelected = selectedOrderIds.includes(o.id);
                const isMenuOpen = openActionMenuId === o.id;

                return (
                  <tr
                    key={o.id}
                    onClick={() => handleOpenWorkspace(o)}
                    className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                      o.status === 'disputed' ? 'bg-red-50/40' : ''
                    } ${isSelected ? 'bg-emerald-50/30' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="p-4" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          if (e.target.checked) setSelectedOrderIds([...selectedOrderIds, o.id]);
                          else setSelectedOrderIds(selectedOrderIds.filter(id => id !== o.id));
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 cursor-pointer"
                      />
                    </td>

                    {/* Column 1: Order ID Badge */}
                    <td className="p-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenWorkspace(o)}
                          className="font-mono text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Open Workstream for Order"
                        >
                          <span>#{o.id}</span>
                        </button>

                        <button
                          onClick={e => handleCopyId(o.id, e)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"
                          title="Copy Order ID"
                        >
                          {copiedId === o.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Column 2: Gig / Service */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={getOrderThumbnail(o)}
                          alt={o.title}
                          className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-200 shrink-0"
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 block max-w-xs truncate" title={o.title}>
                              {o.title}
                            </span>
                            <a
                              href={serviceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-slate-400 hover:text-emerald-600 p-0.5 rounded"
                              title="Open Gig Webpage in New Tab"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-emerald-600 text-xs">
                              ${o.amount.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              (Fee: ${(o.amount * 0.1).toFixed(0)})
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Column 3: Buyer & Seller Usernames + Popovers */}
                    <td className="p-4" onClick={e => e.stopPropagation()}>
                      <div className="space-y-1.5">
                        {/* Buyer */}
                        <div className="relative profile-popover-container">
                          <button
                            onClick={e => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setActiveProfilePopover(
                                activeProfilePopover?.userId === o.buyerId ? null : { userId: o.buyerId, anchorRect: rect }
                              );
                            }}
                            className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition-colors group cursor-pointer"
                          >
                            <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-slate-600">B:</span>
                            <span className="font-semibold underline decoration-slate-300 underline-offset-2">
                              {buyer?.name || o.buyerUsername || o.buyerId}
                            </span>
                            {buyer?.isFlagged && <Flag className="w-3 h-3 text-red-500" />}
                          </button>
                        </div>

                        {/* Seller */}
                        <div className="relative profile-popover-container">
                          <button
                            onClick={e => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setActiveProfilePopover(
                                activeProfilePopover?.userId === o.sellerId ? null : { userId: o.sellerId, anchorRect: rect }
                              );
                            }}
                            className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition-colors group cursor-pointer"
                          >
                            <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-slate-600">S:</span>
                            <span className="font-semibold underline decoration-slate-300 underline-offset-2">
                              {seller?.name || o.sellerUsername || o.sellerId}
                            </span>
                            {seller?.isFlagged && <Flag className="w-3 h-3 text-red-500" />}
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Column 4: Status Badge */}
                    <td className="p-4">
                      {getStatusBadge(o.status)}
                    </td>

                    {/* Column 5: Countdown / Due Date */}
                    <td className="p-4 font-mono">
                      <div className="space-y-0.5">
                        <div className={`text-xs flex items-center gap-1.5 ${dueTime.color}`}>
                          <Clock className="w-3 h-3" />
                          <span>{dueTime.text}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block">Due {o.dueDate}</span>
                      </div>
                    </td>

                    {/* Column 6: Workstream Action & Quick Actions (•••) */}
                    <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {/* Primary Button: Open Workstream */}
                        <button
                          onClick={() => handleOpenWorkspace(o)}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                        >
                          <span>Open Workstream</span>
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                        </button>

                        {/* Quick Actions Menu Trigger (•••) */}
                        <div className="relative action-menu-container">
                          <button
                            type="button"
                            onClick={() => setOpenActionMenuId(isMenuOpen ? null : o.id)}
                            className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors cursor-pointer action-menu-trigger"
                            title="Quick Actions"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {/* Quick Actions Dropdown Menu */}
                          {isMenuOpen && (
                            <div className="absolute right-0 top-9 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 p-2 space-y-1 text-left text-xs">
                              <button
                                onClick={e => handleExecuteReleaseFunds(o, e)}
                                disabled={o.status === 'completed' || o.status === 'cancelled'}
                                className="w-full px-3 py-2 rounded-xl text-left font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-30 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Force Complete Order</span>
                              </button>

                              <button
                                onClick={e => handleOpenRefundModal(o, e)}
                                disabled={o.status === 'cancelled'}
                                className="w-full px-3 py-2 rounded-xl text-left font-bold text-red-700 hover:bg-red-50 disabled:opacity-30 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Cancel & Refund Order</span>
                              </button>

                              <button
                                onClick={e => handleOpenExtendModal(o, e)}
                                disabled={o.status === 'completed' || o.status === 'cancelled'}
                                className="w-full px-3 py-2 rounded-xl text-left font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-30 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Extend Deadline</span>
                              </button>

                              <button
                                onClick={e => handleTogglePauseTimer(o, e)}
                                className="w-full px-3 py-2 rounded-xl text-left font-bold text-amber-700 hover:bg-amber-50 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                {o.isTimerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                                <span>{o.isTimerPaused ? 'Resume Timer' : 'Pause Timer'}</span>
                              </button>

                              <button
                                onClick={e => handleToggleMuteWorkspace(o, e)}
                                className="w-full px-3 py-2 rounded-xl text-left font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                {o.isMuted ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                <span>{o.isMuted ? 'Unmute Workspace' : 'Mute Workspace'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredOrders.length === 0 && (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Shield className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600">No orders match the selected filters or search parameters.</p>
              <button
                onClick={() => {
                  setStatusTab('all');
                  setSearchQuery('');
                  setShowOverdueOnly(false);
                  setShowHighValueOnly(false);
                }}
                className="text-xs text-emerald-600 underline font-bold"
              >
                Reset All Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mini Profile Popover Floating Card */}
      {activeProfilePopover && (() => {
        const pUser = users.find(u => u.id === activeProfilePopover.userId);
        if (!pUser) return null;
        return (
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xl text-xs space-y-3 w-64 profile-popover-card"
            style={{
              top: Math.min(window.innerHeight - 200, (activeProfilePopover.anchorRect?.bottom || 100) + 8),
              left: Math.min(window.innerWidth - 270, activeProfilePopover.anchorRect?.left || 100)
            }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                  {pUser.name?.[0] || 'U'}
                </div>
                <div>
                  <span className="font-bold text-slate-900 block truncate max-w-[130px]">{pUser.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">ID: {pUser.id}</span>
                </div>
              </div>
              <button onClick={() => setActiveProfilePopover(null)} className="text-slate-400 hover:text-slate-700 font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-1 text-slate-600 text-[11px]">
              <div>Email: <strong className="text-slate-900">{pUser.email}</strong></div>
              <div>Role: <strong className="text-slate-900 uppercase">{pUser.role}</strong></div>
              <div>Wallet: <strong className="text-emerald-600">${(pUser.walletBalance || 0).toFixed(2)}</strong></div>
              {pUser.isFlagged && (
                <div className="text-red-700 font-bold bg-red-50 p-1.5 rounded border border-red-200">
                  ⚠️ Flagged: {pUser.flagReason || 'TOS Investigation'}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={e => handleOpenFlagModal(pUser, e)}
                className="text-[10px] font-bold text-red-600 hover:underline flex items-center gap-1"
              >
                <Flag className="w-3 h-3" />
                <span>{pUser.isFlagged ? 'Manage Flag' : 'Flag Account'}</span>
              </button>
              <span className="text-[10px] text-slate-400">WorkPerHour ID</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

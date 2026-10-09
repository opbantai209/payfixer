export interface GigExtra {
  id: string;
  title: string;
  price: number;
}

export interface Gig {
  id: string;
  freelancerId: string;
  freelancerName: string;
  freelancerUsername?: string;
  freelancerAvatar: string;
  freelancerLevel?: string;
  title: string;
  slug?: string;
  category: string;
  subcategory?: string;
  description: string;
  price: number;
  deliveryDays: number;
  rating: number;
  reviewsCount: number;
  image: string;
  status: 'published' | 'draft' | 'suspended';
  featured: boolean;
  extras?: GigExtra[];
  moderationStatus?: 'approved' | 'flagged' | 'rejected' | 'pending';
  moderationNotes?: string;
}

export interface Project {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerAvatar: string;
  title: string;
  slug?: string;
  category: string;
  subcategory?: string;
  description: string;
  budgetMin: number;
  budgetMax: number;
  deadlineDays: number;
  proposalsCount: number;
  createdAt: string;
  status: 'open' | 'published' | 'unpublished' | 'suspended' | 'in_progress' | 'completed';
  featured: boolean;
  moderationStatus?: 'approved' | 'flagged' | 'rejected' | 'pending';
  moderationNotes?: string;
}

export interface Proposal {
  id: string;
  projectId: string;
  freelancerId: string;
  freelancerName: string;
  freelancerAvatar: string;
  freelancerTitle: string;
  coverLetter: string;
  bidAmount: number;
  deliveryDays: number;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface Order {
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
  isTimerPaused?: boolean;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  title: string;
  rating: number;
  reviewsCount: number;
  hourlyRate: number;
  earned: number;
  completedJobs: number;
  bio: string;
  skills: string[];
  status: 'active' | 'suspended' | 'restricted';
  verified: boolean;
  walletBalance: number;
  createdAt: string;
}

export interface Dispute {
  id: string;
  orderId: string;
  raisedBy: string;
  reason: string;
  evidence: string;
  status: 'open' | 'under_investigation' | 'resolved_refund' | 'resolved_release' | 'resolved_partial';
  createdAt: string;
  resolutionNotes?: string;
  assignedTo?: string;
}

export interface Refund {
  id: string;
  orderId: string;
  buyerId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Payout {
  id: string;
  freelancerId: string;
  amount: number;
  method: string;
  status: 'pending' | 'approved' | 'processed' | 'failed' | 'cancelled' | 'reversed';
  createdAt: string;
  accountDetails: string;
}

export interface PaymentMethodItem {
  id: string;
  userId: string;
  type: 'card' | 'bank' | 'paypal' | 'upi';
  name: string;
  details: {
    last4?: string;
    brand?: string;
    expiry?: string;
    bankName?: string;
    accountNumberMasked?: string;
    routingNumber?: string;
    email?: string;
    upiId?: string;
  };
  isDefault: boolean;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  userId: string;
  type?: 'sent' | 'received';
  recipientName: string;
  recipientEmail: string;
  issuerName?: string;
  issuerEmail?: string;
  title: string;
  issueDate: string;
  dueDate: string;
  status: 'paid' | 'in_escrow' | 'unpaid' | 'refunded';
  items: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  subtotal: number;
  platformFee: number;
  tax: number;
  total: number;
  notes?: string;
  relatedOrderId?: string;
}

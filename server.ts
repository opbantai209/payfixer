import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { randomUUID, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { financeLedger, FinanceLedgerEngine } from './src/server/financeLedger.js';
import { DEFAULT_SITE_SETTINGS } from './src/server/siteSettings.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '100kb' }));

// ==========================================
// PAYMENT SECURITY LAYER
// ==========================================
const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || '';
const REQUIRE_KYC_FOR_PAYOUTS = process.env.REQUIRE_KYC_FOR_PAYOUTS !== 'false';

// Feed business rules from the site settings into the ledger engine
financeLedger.configure({
  commissionPercent: DEFAULT_SITE_SETTINGS.commission.commissionPercent,
  minimumOrderAmount: DEFAULT_SITE_SETTINGS.commission.minimumOrderAmount,
  minimumWithdrawalAmount: DEFAULT_SITE_SETTINGS.wallets.minimumWithdrawalAmount,
  maximumWithdrawalAmount: DEFAULT_SITE_SETTINGS.wallets.maximumWithdrawalPerTransaction
});

// Admin guard. Set ADMIN_API_TOKEN in your environment; send it as "Authorization: Bearer <token>".
// In production the admin and money-moving endpoints stay disabled until a token is configured.
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_TOKEN) {
    if (IS_PROD) return res.status(503).json({ error: 'ADMIN_API_TOKEN is not configured; admin endpoints are disabled.' });
    return next(); // local development convenience only
  }
  const header = String(req.headers.authorization || '');
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(given);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'Admin authorization required.' });
  next();
}
// The actor name recorded in audit trails is decided by the server, never by the request body.
const adminActor = (_req: Request) => 'Admin';

// Minimal in-memory rate limiter for money-moving user endpoints.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.method}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const b = rateBuckets.get(key);
    if (!b || b.resetAt < now) { rateBuckets.set(key, { count: 1, resetAt: now + windowMs }); return next(); }
    if (++b.count > max) return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    next();
  };
}

// Everything under /api/admin and the order admin actions require the admin token.
app.use('/api/admin', requireAdmin);
for (const sub of ['force-complete', 'force-cancel', 'admin-notes', 'extend-time', 'mute']) {
  app.use(`/api/orders/:id/${sub}`, requireAdmin);
}
app.use(['/api/payouts', '/api/refunds', '/api/audit-logs'], (req: Request, res: Response, next: NextFunction) => (req.method === 'GET' ? requireAdmin(req, res, next) : next()));

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize Gemini AI client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'dummy_key',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Interfaces
interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: 'user' | 'admin' | 'super_admin' | 'moderator' | 'support';
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
  isFlagged?: boolean;
  flagReason?: string;
}

interface GigExtra {
  id: string;
  title: string;
  price: number;
}

interface Gig {
  id: string;
  freelancerId: string;
  freelancerName: string;
  freelancerUsername: string;
  freelancerAvatar: string;
  freelancerLevel: string;
  title: string;
  slug: string;
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

interface Project {
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

interface Proposal {
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

interface Order {
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

interface Dispute {
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

interface Refund {
  id: string;
  orderId: string;
  buyerId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface Payout {
  id: string;
  freelancerId: string;
  amount: number;
  method: 'UPI' | 'Bank Transfer' | 'Stripe' | 'Razorpay' | 'PayPal';
  status: 'pending' | 'approved' | 'processed' | 'failed' | 'cancelled' | 'reversed';
  createdAt: string;
  accountDetails: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  order: number;
  subcategories: { id: string; name: string; slug: string; enabled: boolean }[];
}

interface Review {
  id: string;
  orderId: string;
  reviewerName: string;
  reviewerAvatar: string;
  targetUserId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
  messages: { sender: string; text: string; timestamp: string }[];
}

interface AuditLog {
  id: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

interface Message {
  id: string;
  orderId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

interface UserEmail {
  id: string;
  userId: string;
  userEmail: string;
  subject: string;
  body: string;
  type: 'SUSPEND' | 'RESTRICT' | 'IMPERSONATE' | 'GENERAL';
  sentAt: string;
  read: boolean;
}

let userEmails: UserEmail[] = [
  {
    id: 'email_init_1',
    userId: 'user_1',
    userEmail: 'elena@example.com',
    subject: 'Welcome to WorkPerHour Platform',
    body: 'Welcome Elena! Your freelancer and buyer profile is active.',
    type: 'GENERAL',
    sentAt: '2026-10-01 10:00 AM',
    read: true
  }
];

function notifyUserOnAdminAction(user: User, action: 'suspended' | 'restricted' | 'impersonated', notes?: string) {
  const timestamp = new Date().toLocaleString();
  const timeShort = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let emailSubject = '';
  let emailBody = '';
  let chatText = '';

  if (action === 'suspended') {
    emailSubject = `[URGENT] WorkSphere Account Suspended - Action Required`;
    emailBody = `Dear ${user.name},\n\nYour WorkSphere account (${user.email}) has been SUSPENDED by Platform Administration.\n\nReason/Notes: ${notes || 'Violation of Marketplace Policies / Security Investigation'}.\n\nWhile suspended, your active listings, gigs, and bidding capabilities are temporarily paused. If you believe this is an error or wish to file an appeal, please click "Contact Support Desk" or reply directly to support.`;
    chatText = `🚨 ACCOUNT ALERT: Your WorkSphere account has been SUSPENDED by Platform Administration. Please Contact Support Desk immediately to review your account status and submit an appeal.`;
  } else if (action === 'restricted') {
    emailSubject = `[NOTICE] WorkSphere Account Privileges Restricted`;
    emailBody = `Dear ${user.name},\n\nYour WorkSphere account (${user.email}) privileges have been RESTRICTED by Platform Administration.\n\nReason/Notes: ${notes || 'Account compliance review / policy warning'}.\n\nCertain actions (such as creating new gigs or submitting bids) are currently limited. Please contact our Support Desk to resolve these restrictions.`;
    chatText = `⚠️ ACCOUNT NOTICE: Your WorkSphere account privileges have been RESTRICTED by Platform Administration. Please Contact Support Desk for assistance and clarification.`;
  } else if (action === 'impersonated') {
    emailSubject = `[SECURITY NOTICE] Administrative Support Session Initialized`;
    emailBody = `Dear ${user.name},\n\nA Super Administrator initialized an Administrative Support Impersonation Session for your account (${user.email}) at ${timestamp} for support investigation and auditing.\n\nIf you have any questions or security concerns, please contact support immediately.`;
    chatText = `🔒 SECURITY NOTICE: An Administrative Support Impersonation Session was started for your account by Super Admin for inspection. Please contact support if you have any questions.`;
  }

  // 1. Store Email Record
  const newEmail: UserEmail = {
    id: 'email_' + Date.now() + Math.random().toString(36).substring(2, 5),
    userId: user.id,
    userEmail: user.email,
    subject: emailSubject,
    body: emailBody,
    type: action === 'suspended' ? 'SUSPEND' : action === 'restricted' ? 'RESTRICT' : 'IMPERSONATE',
    sentAt: timestamp,
    read: false
  };
  userEmails.unshift(newEmail);

  // 2. Add System Chat Message into User's Support Thread
  const supportOrderId = `support_admin_${user.id}`;
  const newChatMsg: Message = {
    id: 'msg_' + Date.now() + Math.random().toString(36).substring(2, 5),
    orderId: supportOrderId,
    senderId: 'user_admin',
    senderName: 'WorkSphere Admin & Support Desk',
    text: chatText,
    timestamp: timeShort
  };
  messages.push(newChatMsg);

  // 3. Broadcast WS message
  try {
    const payload = JSON.stringify({ type: 'MESSAGE_RECEIVED', message: newChatMsg });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  } catch (err) {
    console.error('WS notify error:', err);
  }
}

// Initial Data Seeds
let users: User[] = [
  {
    id: 'user_1',
    name: 'Elena Rostova',
    email: 'elena@example.com',
    role: 'user',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
    title: 'Senior Full-Stack & UI/UX Architect',
    rating: 4.9,
    reviewsCount: 142,
    hourlyRate: 85,
    earned: 48500,
    completedJobs: 165,
    bio: 'Product engineer building scalable SaaS apps.',
    skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    status: 'active',
    verified: true,
    walletBalance: 4250,
    createdAt: '2025-01-15'
  },
  {
    id: 'user_2',
    name: 'Marcus Vance',
    email: 'marcus@example.com',
    role: 'user',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    title: 'VP of Product at NexusTech',
    rating: 5.0,
    reviewsCount: 28,
    hourlyRate: 0,
    earned: 0,
    completedJobs: 0,
    bio: 'Looking for elite freelance developers.',
    skills: ['Product Management', 'Startup Growth'],
    status: 'active',
    verified: true,
    walletBalance: 12000,
    createdAt: '2025-02-01'
  },
  {
    id: 'user_admin',
    name: 'Admin Chief',
    email: 'admin@workperhour.com',
    role: 'super_admin',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&h=400&fit=crop',
    title: 'Platform Super Administrator',
    rating: 5.0,
    reviewsCount: 0,
    hourlyRate: 0,
    earned: 0,
    completedJobs: 0,
    bio: 'Super Admin managing marketplace integrity.',
    skills: ['Platform Operations', 'Security'],
    status: 'active',
    verified: true,
    walletBalance: 0,
    createdAt: '2025-01-01'
  },
  {
    id: 'user_bk',
    name: 'Broadcast King',
    username: 'broadcastking',
    email: 'broadcastking@workperhour.com',
    role: 'user',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
    title: 'Professional Animator & Puppet Director',
    rating: 4.9,
    reviewsCount: 2840,
    hourlyRate: 75,
    earned: 62000,
    completedJobs: 410,
    bio: 'Award-winning video and puppet production specialist.',
    skills: ['Video Production', 'Puppet Rigging', 'Voiceover', 'Animation'],
    status: 'active',
    verified: true,
    walletBalance: 3450,
    createdAt: '2025-01-10'
  },
  {
    id: 'user_3',
    name: 'Bushra Khan',
    username: 'bushra',
    email: 'bushra@workperhour.com',
    role: 'user',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
    title: 'Senior SEO Strategist & Backlink Specialist',
    rating: 5.0,
    reviewsCount: 16,
    hourlyRate: 60,
    earned: 14200,
    completedJobs: 88,
    bio: 'High authority backlink building and organic SEO ranking.',
    skills: ['SEO', 'Link Building', 'Ahrefs', 'Technical SEO'],
    status: 'active',
    verified: true,
    walletBalance: 1850,
    createdAt: '2025-02-15'
  }
];

let gigs: Gig[] = [
  {
    id: 'gig_0',
    freelancerId: 'user_bk',
    freelancerName: 'Broadcast King',
    freelancerUsername: 'broadcastking',
    freelancerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
    freelancerLevel: 'Top Rated ★★★',
    title: 'Create an amazing promotional explainer video a puppet',
    slug: 'create-an-amazing-promotional-explainer-video-a-puppet',
    category: 'Design & Creative',
    subcategory: 'Explainer Videos',
    description: 'I will create a high quality 1080p promotional explainer video featuring a custom puppet character for your brand or business. Includes professional voiceover, sound effects, commercial rights, and unlimited revisions.',
    price: 450,
    deliveryDays: 3,
    rating: 4.9,
    reviewsCount: 2840,
    image: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800&h=500&fit=crop',
    status: 'published',
    featured: true,
    extras: [
      { id: 'ext_1', title: 'Extra Fast 24-Hour Express Delivery', price: 100 },
      { id: 'ext_2', title: 'Full Commercial & Broadcast License', price: 150 },
      { id: 'ext_3', title: 'Additional 30 Seconds Animation', price: 200 },
      { id: 'ext_4', title: 'Custom Background Music Track', price: 50 }
    ]
  },
  {
    id: 'gig_1',
    freelancerId: 'user_1',
    freelancerName: 'Jacob M.',
    freelancerUsername: 'jacob_m',
    freelancerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    freelancerLevel: 'Top Rated ★★★',
    title: 'I will seo backlinks high da authority link building service for google ranking',
    slug: 'i-will-seo-backlinks-high-da-authority-link-building-service-for-google-ranking',
    category: 'Development & IT',
    subcategory: 'SEO & Link Building',
    description: 'Get high DA authority backlinks and contextual link building to boost your Google rankings safely.',
    price: 450,
    deliveryDays: 5,
    rating: 4.9,
    reviewsCount: 1420,
    image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=500&fit=crop',
    status: 'published',
    featured: true,
    extras: [
      { id: 'ext_5', title: 'Supercharge with 25 Extra High DA 70+ Backlinks', price: 200 },
      { id: 'ext_6', title: 'Detailed PDF Indexing & Anchor Text Report', price: 50 }
    ]
  },
  {
    id: 'gig_2',
    freelancerId: 'user_3',
    freelancerName: 'BUSHRA',
    freelancerUsername: 'bushra',
    freelancerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
    freelancerLevel: 'Level 2 ★★',
    title: 'I will increase ahrefs domain rating dr 70 using high authority SEO backlinks',
    slug: 'i-will-increase-ahrefs-domain-rating-dr-70-using-high-authority-seo-backlinks',
    category: 'AI & Data',
    subcategory: 'AI Integration',
    description: 'Supercharge your domain rating with Ahrefs DR 70 guaranteed backlinks.',
    price: 350,
    deliveryDays: 3,
    rating: 5.0,
    reviewsCount: 16,
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&h=500&fit=crop',
    status: 'published',
    featured: false,
    extras: [
      { id: 'ext_7', title: 'Fast Track Processing (2 Days Delivery)', price: 150 },
      { id: 'ext_8', title: 'Ahrefs & SEMrush SEO Competitor Comparison', price: 80 }
    ]
  },
  {
    id: 'gig_3',
    freelancerId: 'user_1',
    freelancerName: 'Elena Rostova',
    freelancerUsername: 'elena_rostova',
    freelancerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
    freelancerLevel: 'Vetted Pro ★★★',
    title: 'I will build a high performance full stack web app in react and node',
    slug: 'i-will-build-a-high-performance-full-stack-web-app-in-react-and-node',
    category: 'Development & IT',
    subcategory: 'Full-Stack Development',
    description: 'Custom full-stack web applications built with React 19, TypeScript, Express, and PostgreSQL.',
    price: 950,
    deliveryDays: 7,
    rating: 5.0,
    reviewsCount: 382,
    image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&h=500&fit=crop',
    status: 'published',
    featured: true,
    extras: [
      { id: 'ext_9', title: 'Add Real-Time WebSockets Messaging System', price: 350 },
      { id: 'ext_10', title: 'Stripe & Escrow Payment Gateway Integration', price: 400 },
      { id: 'ext_11', title: 'Express Deployment to Cloud Hosting', price: 150 }
    ]
  }
];

let projects: Project[] = [
  {
    id: 'proj_1',
    buyerId: 'user_2',
    buyerName: 'Marcus Vance',
    buyerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    title: 'Looking for a React Native Expert to build an iOS/Android fintech mobile app',
    category: 'Mobile Apps',
    subcategory: 'React Native',
    description: 'Launching a next-gen crypto & fiat savings wallet with biometric auth & Stripe.',
    budgetMin: 3000,
    budgetMax: 6000,
    deadlineDays: 30,
    proposalsCount: 4,
    createdAt: '2026-10-01',
    status: 'open',
    featured: true
  }
];

let proposals: Proposal[] = [
  {
    id: 'prop_1',
    projectId: 'proj_1',
    freelancerId: 'user_1',
    freelancerName: 'Elena Rostova',
    freelancerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
    freelancerTitle: 'Senior Full-Stack & UI/UX Architect',
    coverLetter: 'Hi Marcus! I have built several secure fintech apps.',
    bidAmount: 4500,
    deliveryDays: 25,
    createdAt: '2026-10-02',
    status: 'pending'
  }
];

let orders: Order[] = [
  {
    id: 'ord_1',
    title: 'I will build a high performance full stack web app in react and node',
    buyerId: 'user_2',
    sellerId: 'user_1',
    gigId: 'gig_3',
    sellerUsername: 'elena_rostova',
    gigSlug: 'i-will-build-a-high-performance-full-stack-web-app-in-react-and-node',
    serviceUrl: '/elena_rostova/i-will-build-a-high-performance-full-stack-web-app-in-react-and-node',
    serviceTitle: 'I will build a high performance full stack web app in react and node',
    amount: 950,
    status: 'disputed',
    createdAt: '2026-10-05',
    dueDate: '2026-10-19',
    requirements: 'Build user dashboard with dark mode, full-stack MVP, and PostgreSQL database integration.',
    deliverables: 'Source code repository with React 19 frontend and Node.js REST API.',
    deliverableFiles: [
      { id: 'deliv_1', name: 'saas_mvp_build_v1.zip', size: '14.8 MB', url: '#', uploadedAt: '2026-10-07 11:20 AM' },
      { id: 'deliv_2', name: 'api_documentation.pdf', size: '1.2 MB', url: '#', uploadedAt: '2026-10-07 11:22 AM' }
    ],
    revisions: [
      { id: 'rev_1', requestedAt: '2026-10-07 01:15 PM', reason: 'Missing dark mode toggle in navigation bar and settings.', status: 'open' }
    ],
    adminNotes: 'Buyer filed formal dispute regarding dark theme. Elena states toggle was ready in PR #4. Under review.',
    isMuted: false,
    escrowProtectionStartDate: '2026-10-05',
    escrowProtectionEndDate: '2026-10-19'
  },
  {
    id: 'ord_bk',
    title: 'Create an amazing promotional explainer video a puppet',
    buyerId: 'user_2',
    sellerId: 'user_bk',
    gigId: 'gig_0',
    sellerUsername: 'broadcastking',
    gigSlug: 'create-an-amazing-promotional-explainer-video-a-puppet',
    serviceUrl: '/broadcastking/create-an-amazing-promotional-explainer-video-a-puppet',
    serviceTitle: 'Create an amazing promotional explainer video a puppet',
    amount: 450,
    status: 'in_progress',
    createdAt: '2026-10-06',
    dueDate: '2026-10-12',
    requirements: '30-second puppet animation for mobile app launch. Professional voiceover and commercial rights included.',
    deliverables: 'Full 1080p MP4 master video + raw audio WAV file.',
    deliverableFiles: [
      { id: 'deliv_3', name: 'puppet_rigging_preview.mp4', size: '8.4 MB', url: '#', uploadedAt: '2026-10-08 02:40 PM' }
    ],
    adminNotes: 'Puppet character model approved by Marcus. Final render underway.',
    isMuted: false,
    escrowProtectionStartDate: '2026-10-06',
    escrowProtectionEndDate: '2026-10-20'
  },
  {
    id: 'ord_bushra',
    title: 'I will increase ahrefs domain rating dr 70 using high authority SEO backlinks',
    buyerId: 'user_2',
    sellerId: 'user_3',
    gigId: 'gig_2',
    sellerUsername: 'bushra',
    gigSlug: 'i-will-increase-ahrefs-domain-rating-dr-70-using-high-authority-seo-backlinks',
    serviceUrl: '/bushra/i-will-increase-ahrefs-domain-rating-dr-70-using-high-authority-seo-backlinks',
    serviceTitle: 'I will increase ahrefs domain rating dr 70 using high authority SEO backlinks',
    amount: 350,
    status: 'delivered',
    createdAt: '2026-10-07',
    dueDate: '2026-10-14',
    requirements: 'Target domain ranking boost for SaaS landing page with 25 contextual backlinks.',
    deliverables: 'Comprehensive Ahrefs DR 70 indexing report and verified live URLs.',
    deliverableFiles: [
      { id: 'deliv_4', name: 'ahrefs_dr70_verified_backlinks.pdf', size: '2.4 MB', url: '#', uploadedAt: '2026-10-08 04:30 PM' },
      { id: 'deliv_5', name: 'anchor_text_analysis.xlsx', size: '540 KB', url: '#', uploadedAt: '2026-10-08 04:32 PM' }
    ],
    adminNotes: 'Work delivered on time. 3-day buyer review timer active before auto-completion.',
    isMuted: false,
    escrowProtectionStartDate: '2026-10-07',
    escrowProtectionEndDate: '2026-10-21'
  },
  {
    id: 'ord_comp_1',
    title: 'I will seo backlinks high da authority link building service for google ranking',
    buyerId: 'user_2',
    sellerId: 'user_1',
    gigId: 'gig_1',
    sellerUsername: 'jacob_m',
    gigSlug: 'i-will-seo-backlinks-high-da-authority-link-building-service-for-google-ranking',
    serviceUrl: '/jacob_m/i-will-seo-backlinks-high-da-authority-link-building-service-for-google-ranking',
    serviceTitle: 'I will seo backlinks high da authority link building service for google ranking',
    amount: 450,
    status: 'completed',
    createdAt: '2026-09-25',
    dueDate: '2026-10-02',
    requirements: 'Contextual backlinks on DA 70+ technology blogs.',
    deliverables: 'PDF verification report and high-ranking backlinks.',
    deliverableFiles: [
      { id: 'deliv_6', name: 'final_seo_delivery_da70.pdf', size: '3.1 MB', url: '#', uploadedAt: '2026-10-01 10:00 AM' }
    ],
    adminNotes: 'Successfully completed. Buyer left 5-star positive review.',
    isMuted: false,
    escrowProtectionStartDate: '2026-09-25',
    escrowProtectionEndDate: '2026-10-09'
  },
  {
    id: 'ord_rev_1',
    title: 'Modern Minimalist Logo & Brand Identity System',
    buyerId: 'user_2',
    sellerId: 'user_1',
    gigId: 'gig_3',
    sellerUsername: 'elena_rostova',
    buyerUsername: 'marcus_vance',
    gigSlug: 'modern-minimalist-logo-and-brand-identity-system',
    serviceUrl: '/elena_rostova/modern-minimalist-logo-and-brand-identity-system',
    serviceTitle: 'Modern Minimalist Logo & Brand Identity System',
    serviceThumbnail: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800&h=500&fit=crop',
    amount: 620,
    status: 'revision',
    createdAt: '2026-10-04',
    dueDate: '2026-10-16',
    requirements: 'Complete vector brand identity, typography scale, monochrome icons, and Figma component system.',
    deliverables: 'Figma source file (.fig) and high-resolution exported SVG/PNG assets.',
    deliverableFiles: [
      { id: 'deliv_rev_1', name: 'brand_identity_v1_draft.fig', size: '28.4 MB', url: '#', uploadedAt: '2026-10-06 05:10 PM' },
      { id: 'deliv_rev_2', name: 'logo_presentation_deck.pdf', size: '4.6 MB', url: '#', uploadedAt: '2026-10-06 05:12 PM' }
    ],
    revisions: [
      { id: 'rev_req_1', requestedAt: '2026-10-07 02:45 PM', reason: 'Please provide high contrast monochrome variant and refine primary mark curvature.', status: 'in_progress' }
    ],
    adminNotes: 'Buyer requested monochrome mark variation. Freelancer confirmed re-submission within 24h.',
    isMuted: false,
    escrowProtectionStartDate: '2026-10-04',
    escrowProtectionEndDate: '2026-10-18'
  },
  {
    id: 'ord_canc_1',
    title: 'Custom Shopify Dropshipping Store Setup & Integration',
    buyerId: 'user_2',
    sellerId: 'user_3',
    gigId: 'gig_2',
    sellerUsername: 'bushra',
    buyerUsername: 'marcus_vance',
    gigSlug: 'custom-shopify-dropshipping-store-setup',
    serviceUrl: '/bushra/custom-shopify-dropshipping-store-setup',
    serviceTitle: 'Custom Shopify Dropshipping Store Setup & Integration',
    serviceThumbnail: 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=800&h=500&fit=crop',
    amount: 800,
    status: 'cancelled',
    createdAt: '2026-09-20',
    dueDate: '2026-09-28',
    requirements: 'Turnkey Shopify store configuration with custom liquid theme and payment gateway setup.',
    deliverables: 'Shopify collaborator access transfer and configured store.',
    deliverableFiles: [],
    adminNotes: 'Order cancelled by mutual agreement following client pivot. $800 fully refunded to buyer wallet.',
    isMuted: false,
    escrowProtectionStartDate: '2026-09-20',
    escrowProtectionEndDate: '2026-10-04'
  },
  {
    id: 'ord_late_1',
    title: 'AI Voice Agent with Realtime Telephony & Webhook Bridge',
    buyerId: 'user_2',
    sellerId: 'user_1',
    gigId: 'gig_3',
    sellerUsername: 'elena_rostova',
    buyerUsername: 'marcus_vance',
    gigSlug: 'ai-voice-agent-with-realtime-telephony',
    serviceUrl: '/elena_rostova/ai-voice-agent-with-realtime-telephony',
    serviceTitle: 'AI Voice Agent with Realtime Telephony & Webhook Bridge',
    serviceThumbnail: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=500&fit=crop',
    amount: 1250,
    status: 'in_progress',
    createdAt: '2026-09-26',
    dueDate: '2026-10-03',
    requirements: 'Real-time Twilio voice bridge connecting speech-to-speech AI pipeline with low latency.',
    deliverables: 'Deployed AWS Lambda endpoint + Git repository + environment setup instructions.',
    deliverableFiles: [
      { id: 'deliv_late_1', name: 'telephony_architecture_spec.pdf', size: '1.8 MB', url: '#', uploadedAt: '2026-09-29 10:15 AM' }
    ],
    adminNotes: 'Order is overdue. Freelancer requested extra time due to Twilio carrier registration wait. Admin intervention recommended.',
    isMuted: false,
    isTimerPaused: false,
    escrowProtectionStartDate: '2026-09-26',
    escrowProtectionEndDate: '2026-10-10'
  }
];

let disputes: Dispute[] = [
  {
    id: 'disp_1',
    orderId: 'ord_1',
    raisedBy: 'user_2',
    reason: 'Deliverable delay and missing dark mode toggle requirement.',
    evidence: 'Screenshot of dashboard preview missing dark theme switch.',
    status: 'under_investigation',
    createdAt: '2026-10-07',
    assignedTo: 'user_admin'
  }
];

let refunds: Refund[] = [
  {
    id: 'ref_1',
    orderId: 'ord_1',
    buyerId: 'user_2',
    amount: 250,
    reason: 'Partial refund requested due to reduced scope.',
    status: 'pending',
    createdAt: '2026-10-07'
  }
];

let payouts: Payout[] = [
  {
    id: 'pay_1',
    freelancerId: 'user_1',
    amount: 1500,
    method: 'UPI',
    status: 'processed',
    createdAt: '2026-10-04',
    accountDetails: 'elena@upi'
  }
];

let categories: Category[] = [
  {
    id: 'cat_1',
    name: 'Development & IT',
    slug: 'development-it',
    enabled: true,
    order: 1,
    subcategories: [
      { id: 'sub_1', name: 'Web Development', slug: 'web-dev', enabled: true },
      { id: 'sub_2', name: 'SEO & Link Building', slug: 'seo', enabled: true }
    ]
  },
  {
    id: 'cat_2',
    name: 'AI & Data',
    slug: 'ai-data',
    enabled: true,
    order: 2,
    subcategories: [
      { id: 'sub_3', name: 'AI Integration', slug: 'ai-integration', enabled: true },
      { id: 'sub_4', name: 'Data Science', slug: 'data-science', enabled: true }
    ]
  },
  {
    id: 'cat_3',
    name: 'Design & Creative',
    slug: 'design-creative',
    enabled: true,
    order: 3,
    subcategories: [
      { id: 'sub_5', name: 'Explainer Videos', slug: 'explainer-videos', enabled: true },
      { id: 'sub_6', name: 'UI/UX Design', slug: 'ui-ux-design', enabled: true }
    ]
  },
  {
    id: 'cat_4',
    name: 'Mobile Apps',
    slug: 'mobile-apps',
    enabled: true,
    order: 4,
    subcategories: [
      { id: 'sub_7', name: 'React Native', slug: 'react-native', enabled: true },
      { id: 'sub_8', name: 'iOS & Android', slug: 'ios-android', enabled: true }
    ]
  }
];

let reviews: Review[] = [
  {
    id: 'rev_1',
    orderId: 'ord_1',
    reviewerName: 'Marcus Vance',
    reviewerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    targetUserId: 'user_1',
    rating: 5,
    comment: 'Exceptional work! Elena delivered clean React code ahead of schedule.',
    createdAt: '2026-10-06'
  }
];

let supportTickets: SupportTicket[] = [
  {
    id: 'tick_1',
    userId: 'user_1',
    userName: 'Elena Rostova',
    subject: 'Question regarding withdrawal payout fees',
    priority: 'medium',
    status: 'open',
    createdAt: '2026-10-07',
    messages: [
      { sender: 'Elena Rostova', text: 'Hi support team, what is the fee rate for UPI payouts?', timestamp: '11:20 AM' }
    ]
  }
];

let auditLogs: AuditLog[] = [
  {
    id: 'log_1',
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'FORCE_ESCROW_RELEASE',
    target: 'Order #ord_1',
    details: 'Released $950 escrow to Elena Rostova after milestone sign-off.',
    timestamp: '2026-10-08 02:15 AM'
  }
];

let messages: Message[] = [
  {
    id: 'msg_1',
    orderId: 'ord_1',
    senderId: 'user_2',
    senderName: 'Marcus Vance',
    text: 'Hi Elena, excited to get started! Funds secured in escrow.',
    timestamp: '10:30 AM'
  },
  {
    id: 'msg_2',
    orderId: 'ord_1',
    senderId: 'user_1',
    senderName: 'Elena Rostova',
    text: 'Thanks Marcus! Initial architecture and UI wireframes are ready.',
    timestamp: '10:35 AM'
  },
  {
    id: 'msg_3',
    orderId: 'ord_bk',
    senderId: 'user_2',
    senderName: 'Marcus Vance',
    text: 'Hi Broadcast King! Looking forward to the puppet explainer video preview.',
    timestamp: '02:15 PM'
  },
  {
    id: 'msg_4',
    orderId: 'ord_bk',
    senderId: 'user_bk',
    senderName: 'Broadcast King',
    text: 'Hello Marcus! Character rigging is complete and voiceover is recorded.',
    timestamp: '02:20 PM'
  },
  {
    id: 'msg_5',
    orderId: 'ord_bushra',
    senderId: 'user_2',
    senderName: 'Marcus Vance',
    text: 'Hi Bushra, checking in on the SEO DR 70 backlinks report.',
    timestamp: '04:10 PM'
  },
  {
    id: 'msg_6',
    orderId: 'ord_bushra',
    senderId: 'user_3',
    senderName: 'BUSHRA',
    text: 'Hello Marcus! Backlink indexing is underway, sending the initial Ahrefs report shortly.',
    timestamp: '04:15 PM'
  }
];

function enrichOrderWithServiceInfo(o: Order) {
  const gig = (o.gigId ? gigs.find(g => g.id === o.gigId) : undefined) ||
              gigs.find(g => g.freelancerId === o.sellerId) ||
              gigs.find(g => g.title.toLowerCase() === o.title.toLowerCase());
  const project = (o.projectId ? projects.find(p => p.id === o.projectId) : undefined) ||
                  projects.find(p => p.title.toLowerCase() === o.title.toLowerCase());
  const seller = users.find(u => u.id === o.sellerId);
  const buyer = users.find(u => u.id === o.buyerId);
  const sellerUsername = o.sellerUsername || gig?.freelancerUsername || (seller?.username || seller?.name || '').toLowerCase().replace(/\s+/g, '_');
  const buyerUsername = o.buyerUsername || (buyer?.username || buyer?.name || '').toLowerCase().replace(/\s+/g, '_');
  const gigSlug = o.gigSlug || gig?.slug;
  const serviceUrl = o.serviceUrl || (gig && gigSlug ? `/${sellerUsername}/${gigSlug}` : project ? `/project/${project.slug}` : undefined);
  const serviceTitle = gig?.title || project?.title || o.serviceTitle || o.title;
  const serviceThumbnail = o.serviceThumbnail || gig?.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=500&fit=crop';

  return {
    ...o,
    gigId: o.gigId || gig?.id,
    projectId: o.projectId || project?.id,
    sellerUsername,
    buyerUsername,
    gigSlug,
    serviceUrl,
    serviceTitle,
    serviceThumbnail,
    isTimerPaused: Boolean(o.isTimerPaused)
  };
}

// Site & Fee Settings State
interface SiteFeeSettings {
  platformName: string;
  supportEmail: string;
  currency: string;
  currencySymbol: string;
  freelancerCommissionRate: number;
  buyerProcessingFeeRate: number;
  buyerProcessingFeeFixed: number;
  minOrderAmount: number;
  featuredGigFee: number;
  urgentProjectFee: number;
  escrowHoldDays: number;
  autoCompleteDeliveredDays: number;
  disputeWindowDays: number;
  minPayoutThreshold: number;
  instantPayoutFeeRate: number;
  freelancerOnboardingMode: 'open' | 'moderated';
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  updatedAt?: string;
  updatedBy?: string;
}

let siteFeeSettings: SiteFeeSettings = {
  platformName: 'WorkPerHour',
  supportEmail: 'support@workperhour.com',
  currency: 'USD',
  currencySymbol: '$',
  freelancerCommissionRate: 10,
  buyerProcessingFeeRate: 3,
  buyerProcessingFeeFixed: 0,
  minOrderAmount: 10,
  featuredGigFee: 15,
  urgentProjectFee: 25,
  escrowHoldDays: 14,
  autoCompleteDeliveredDays: 3,
  disputeWindowDays: 14,
  minPayoutThreshold: 50,
  instantPayoutFeeRate: 1.5,
  freelancerOnboardingMode: 'open',
  maintenanceMode: false,
  maintenanceMessage: 'WorkPerHour is undergoing brief scheduled maintenance. Escrow funds and data remain 100% secure.',
  updatedAt: new Date().toISOString().split('T')[0],
  updatedBy: 'Admin Chief (Super Admin)'
};

// REST API Endpoints
app.get('/api/admin/settings', (req, res) => res.json(siteFeeSettings));
app.post('/api/admin/settings', (req, res) => {
  siteFeeSettings = {
    ...siteFeeSettings,
    ...req.body,
    updatedAt: new Date().toISOString().split('T')[0],
    updatedBy: req.body.updatedBy || 'Super Admin'
  };

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: req.body.updatedBy || 'Super Admin',
    role: 'super_admin',
    action: 'SITE_FEE_SETTINGS_UPDATED',
    target: 'Platform Settings & Fee Structure',
    details: `Updated settings: Commission=${siteFeeSettings.freelancerCommissionRate}%, EscrowHold=${siteFeeSettings.escrowHoldDays}d, BuyerFee=${siteFeeSettings.buyerProcessingFeeRate}%`,
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, settings: siteFeeSettings });
});

// ==========================================
// MONEY HELPERS (all balance changes go through the ledger engine)
// ==========================================
function syncUserBalances() {
  for (const u of users) {
    const b = financeLedger.getWalletBalance(u.id);
    if (b !== null) u.walletBalance = b;
  }
}
syncUserBalances();

// Every regular user gets a ledger wallet the first time they touch money.
function ensureWallet(userId: string) {
  const u = users.find(x => x.id === userId);
  if (!u || u.role === 'admin' || u.role === 'super_admin') return;
  financeLedger.ensureWallet({ userId: u.id, name: u.name, email: u.email, role: gigs.some(g => g.freelancerId === u.id) ? 'freelancer' : 'buyer' });
}

function pushSystemMessage(orderId: string, text: string) {
  messages.push({
    id: 'msg_' + randomUUID().slice(0, 12),
    orderId,
    senderId: 'system',
    senderName: 'WorkSphere Escrow Vault',
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } as Message);
}

function closeActiveDispute(orderId: string, status: Dispute['status'], notes: string) {
  const d = disputes.find(x => x.orderId === orderId && (x.status === 'open' || x.status === 'under_investigation'));
  if (d) { d.status = status; d.resolutionNotes = notes; }
}

function assertOrderOpen(order: Order) {
  if (order.status === 'completed') throw new Error('Order is already completed; funds were already released.');
  if (order.status === 'cancelled') throw new Error('Order is already cancelled; funds were already handled.');
}

function releaseOrderFunds(order: Order, actor: string, reason: string, requestKey?: string) {
  assertOrderOpen(order);
  const result = financeLedger.releaseEscrow({ orderId: order.id, actor, reason, requestKey });
  order.status = 'completed';
  const seller = users.find(u => u.id === order.sellerId);
  if (seller) {
    seller.earned = (seller.earned || 0) + result.freelancerNet;
    seller.completedJobs = (seller.completedJobs || 0) + 1;
  }
  syncUserBalances();
  return result;
}

function refundOrderFunds(order: Order, amount: number | undefined, actor: string, reason: string, requestKey?: string) {
  assertOrderOpen(order);
  const result = financeLedger.refundEscrow({ orderId: order.id, amount, reason, actor, requestKey });
  if (result.remaining === 0) order.status = 'cancelled';
  const record = refunds.find(r => r.orderId === order.id && r.status === 'pending');
  if (record) { record.status = 'approved'; record.amount = result.refunded; }
  else refunds.push({ id: 'ref_' + randomUUID().slice(0, 12), orderId: order.id, buyerId: order.buyerId, amount: result.refunded, reason, status: 'approved', createdAt: new Date().toISOString().substring(0, 10) });
  syncUserBalances();
  return result;
}

function splitOrderFunds(order: Order, refundAmount: number, actor: string, reason: string) {
  assertOrderOpen(order);
  const result = financeLedger.resolveEscrowSplit({ orderId: order.id, refundAmount, reason, actor });
  order.status = 'completed';
  const seller = users.find(u => u.id === order.sellerId);
  if (seller) {
    seller.earned = (seller.earned || 0) + result.release.freelancerNet;
    seller.completedJobs = (seller.completedJobs || 0) + 1;
  }
  refunds.push({ id: 'ref_' + randomUUID().slice(0, 12), orderId: order.id, buyerId: order.buyerId, amount: refundAmount, reason, status: 'approved', createdAt: new Date().toISOString().substring(0, 10) });
  syncUserBalances();
  return result;
}

app.get('/api/users', (req, res) => res.json(users));
app.get('/api/gigs', (req, res) => res.json(gigs));
app.get('/api/projects', (req, res) => res.json(projects));
app.get('/api/proposals', (req, res) => res.json(proposals));
app.get('/api/orders', (req, res) => {
  const enriched = orders.map(enrichOrderWithServiceInfo);
  res.json(enriched);
});

// Single Order Workspace Detail
app.get('/api/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const enriched = enrichOrderWithServiceInfo(order);
  const buyer = users.find(u => u.id === order.buyerId);
  const seller = users.find(u => u.id === order.sellerId);
  const orderMessages = messages.filter(m => m.orderId === order.id);
  const dispute = disputes.find(d => d.orderId === order.id);

  res.json({
    ...enriched,
    buyer,
    seller,
    messages: orderMessages,
    dispute
  });
});

// Extend Order Deadline
app.patch('/api/orders/:id/extend-time', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { days, newDueDate, reason } = req.body;
  const oldDate = order.dueDate;
  let targetDate = newDueDate;

  if (days && Number(days) > 0) {
    const current = new Date(order.dueDate || Date.now());
    current.setDate(current.getDate() + Number(days));
    targetDate = current.toISOString().split('T')[0];
  } else if (!targetDate) {
    targetDate = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
  }

  order.dueDate = targetDate;

  // Add system event message in chat
  const sysMsg: Message = {
    id: 'msg_' + Date.now(),
    orderId: order.id,
    senderId: 'system',
    senderName: 'System / Admin Notice',
    text: `⏱️ Deadline extended from ${oldDate} to ${order.dueDate}. ${reason ? 'Reason: ' + reason : 'Admin approved time extension.'}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  messages.push(sysMsg);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'ORDER_DEADLINE_EXTENDED',
    target: `Order #${order.id}`,
    details: `Extended deadline to ${order.dueDate} (${days || 'custom'} days). ${reason || ''}`,
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, order: enrichOrderWithServiceInfo(order), message: sysMsg });
});

// Save Admin Private Notes
app.post('/api/orders/:id/admin-notes', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.adminNotes = req.body.notes || '';
  res.json({ success: true, adminNotes: order.adminNotes });
});

// Upload Deliverable Override / File
app.post('/api/orders/:id/deliverable', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (!order.deliverableFiles) order.deliverableFiles = [];
  const newFile = {
    id: 'deliv_' + Date.now(),
    name: req.body.name || 'deliverable_final.zip',
    size: req.body.size || '3.5 MB',
    url: req.body.url || '#',
    uploadedAt: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
  };

  order.deliverableFiles.push(newFile);
  if (order.status !== 'completed' && order.status !== 'disputed') {
    order.status = 'delivered';
  }

  const sysMsg: Message = {
    id: 'msg_' + Date.now(),
    orderId: order.id,
    senderId: 'system',
    senderName: 'WorkSphere Deliveries',
    text: `📦 Deliverable submitted: "${newFile.name}" (${newFile.size}). Buyer review window initiated.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  messages.push(sysMsg);

  res.json({ success: true, file: newFile, order: enrichOrderWithServiceInfo(order) });
});

// Toggle Chat Mute
app.patch('/api/orders/:id/mute', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.isMuted = !order.isMuted;
  const sysMsg: Message = {
    id: 'msg_' + Date.now(),
    orderId: order.id,
    senderId: 'system',
    senderName: 'Administration Alert',
    text: order.isMuted 
      ? `🔒 Chat paused by Administrator during case review. Neither party may send messages.`
      : `🔓 Chat unlocked by Administrator. Standard messaging resumed.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  messages.push(sysMsg);

  res.json({ success: true, isMuted: order.isMuted });
});

// Toggle Pause Order Timer
app.patch('/api/orders/:id/pause-timer', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.isTimerPaused = !order.isTimerPaused;
  const sysMsg: Message = {
    id: 'msg_' + Date.now(),
    orderId: order.id,
    senderId: 'system',
    senderName: 'Administration Alert',
    text: order.isTimerPaused 
      ? `⏸️ Delivery countdown paused by Administrator pending dispute/clarification.`
      : `▶️ Delivery countdown resumed by Administrator. Normal timer active.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  messages.push(sysMsg);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: order.isTimerPaused ? 'ORDER_TIMER_PAUSED' : 'ORDER_TIMER_RESUMED',
    target: `Order #${order.id}`,
    details: order.isTimerPaused ? 'Timer paused by Admin' : 'Timer resumed by Admin',
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, isTimerPaused: order.isTimerPaused, order: enrichOrderWithServiceInfo(order) });
});

// Flag / Unflag User for Terms of Service review
app.post('/api/users/:id/flag', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.isFlagged = !user.isFlagged;
  user.flagReason = user.isFlagged ? (req.body.reason || 'Flagged for TOS investigation.') : undefined;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: user.isFlagged ? 'USER_FLAGGED_TOS' : 'USER_UNFLAGGED_TOS',
    target: `User #${user.id} (${user.name})`,
    details: user.flagReason || 'Flag removed',
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, isFlagged: user.isFlagged, flagReason: user.flagReason, user });
});

// Force Complete & Release Funds (admin)
app.post('/api/orders/:id/force-complete', (req, res) => {
  try {
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const reason = String(req.body.reason || 'Admin administrative force-release in seller favor.');
    const result = releaseOrderFunds(order, adminActor(req), reason, req.body.requestKey);
    closeActiveDispute(order.id, 'resolved_release', reason);
    pushSystemMessage(order.id, `✅ Order Approved & Completed by Administration! Escrow funds released to freelancer wallet. Net Payout: $${result.freelancerNet}.`);
    res.json({ success: true, order: enrichOrderWithServiceInfo(order), result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Force Cancel & Refund Buyer (admin). A partial refund refunds that amount and releases the rest to the seller.
app.post('/api/orders/:id/force-cancel', (req, res) => {
  try {
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const reason = String(req.body.reason || 'Admin cancelled order and refunded buyer wallet');
    const isPartial = req.body.refundType === 'partial';
    let result: any;
    let refundAmount: number;
    if (isPartial) {
      refundAmount = Number(req.body.customAmount);
      result = splitOrderFunds(order, refundAmount, adminActor(req), reason);
      closeActiveDispute(order.id, 'resolved_partial', reason);
      pushSystemMessage(order.id, `⚖️ Order resolved by Administration. $${refundAmount} refunded to buyer; the remainder was released to the freelancer. Reason: ${reason}`);
    } else {
      result = refundOrderFunds(order, undefined, adminActor(req), reason, req.body.requestKey);
      refundAmount = result.refunded;
      closeActiveDispute(order.id, 'resolved_refund', reason);
      pushSystemMessage(order.id, `🚨 Order Cancelled & Refunded by Administration. $${refundAmount} credited back to buyer wallet balance. Reason: ${reason}`);
    }
    res.json({ success: true, order: enrichOrderWithServiceInfo(order), result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Send Chat Message into Order Workstream
app.post('/api/orders/:id/message', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.isMuted && req.body.senderRole !== 'admin') {
    return res.status(403).json({ error: 'Chat is currently muted by Administrator.' });
  }

  const newMsg: Message = {
    id: 'msg_' + Date.now(),
    orderId: order.id,
    senderId: req.body.senderId || 'user_admin',
    senderName: req.body.senderName || 'Platform Support Desk',
    text: req.body.text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  messages.push(newMsg);

  // Broadcast WebSocket
  try {
    const payload = JSON.stringify({ type: 'MESSAGE_RECEIVED', message: newMsg });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  } catch (err) {
    console.error('WS broadcast error:', err);
  }

  res.json({ success: true, message: newMsg });
});
app.get('/api/disputes', (req, res) => res.json(disputes));
app.get('/api/refunds', (req, res) => res.json(refunds));
app.get('/api/payouts', (req, res) => res.json(payouts));
app.get('/api/categories', (req, res) => res.json(categories));

// ==========================================
// USER PAYMENTS, ESCROW, AND FINANCIAL APIS
// ==========================================

interface PaymentMethodRecord {
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

interface CustomInvoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  recipientName: string;
  recipientEmail: string;
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

let savedPaymentMethods: PaymentMethodRecord[] = [
  {
    id: 'pm_1',
    userId: 'user_1',
    type: 'card',
    name: 'Visa ending in 4242',
    details: { last4: '4242', brand: 'Visa', expiry: '12/28' },
    isDefault: true,
    createdAt: '2026-09-15'
  },
  {
    id: 'pm_2',
    userId: 'user_1',
    type: 'bank',
    name: 'Chase Premier Business Checking',
    details: { bankName: 'Chase Bank', accountNumberMasked: '•••• 8821', routingNumber: '021000021' },
    isDefault: false,
    createdAt: '2026-09-20'
  },
  {
    id: 'pm_3',
    userId: 'user_2',
    type: 'card',
    name: 'Mastercard ending in 8890',
    details: { last4: '8890', brand: 'Mastercard', expiry: '08/29' },
    isDefault: true,
    createdAt: '2026-09-01'
  },
  {
    id: 'pm_4',
    userId: 'user_2',
    type: 'paypal',
    name: 'PayPal (marcus@vance.io)',
    details: { email: 'marcus@vance.io' },
    isDefault: false,
    createdAt: '2026-09-05'
  }
];

let customInvoices: CustomInvoice[] = [
  {
    id: 'inv_init_1',
    invoiceNumber: 'INV-2026-001',
    userId: 'user_1',
    recipientName: 'Marcus Vance',
    recipientEmail: 'marcus@vance.io',
    title: 'Full-Stack React & Node.js Application Development Milestone 1',
    issueDate: '2026-10-01',
    dueDate: '2026-10-15',
    status: 'paid',
    items: [
      { description: 'Architecture Setup & DB Design', quantity: 1, unitPrice: 400, amount: 400 },
      { description: 'Authentication & API Gateway', quantity: 1, unitPrice: 400, amount: 400 }
    ],
    subtotal: 800,
    platformFee: 60,
    tax: 0,
    total: 800,
    notes: 'Thank you for your business. Escrow funds successfully cleared.',
    relatedOrderId: 'ord_1'
  }
];

// User Financial Overview Snapshot
app.get('/api/payments/user/:userId', (req, res) => {
  try {
    const userId = req.params.userId;
    const u = users.find(user => user.id === userId);
    
    if (u) {
      ensureWallet(u.id);
    }

    const walletData = financeLedger.getWalletById(userId);
    const availableBalance = walletData?.wallet.availableBalance ?? (u?.walletBalance ?? 0);
    
    const buyerEscrowOrders = orders.filter(o => o.buyerId === userId && ['funded_in_escrow', 'in_progress'].includes(o.status));
    const buyerEscrowAmount = buyerEscrowOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

    const freelancerEscrowOrders = orders.filter(o => o.sellerId === userId && ['funded_in_escrow', 'in_progress', 'delivered'].includes(o.status));
    const freelancerEscrowAmount = freelancerEscrowOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

    const userPaidOrders = orders.filter(o => o.buyerId === userId && ['funded_in_escrow', 'in_progress', 'delivered', 'completed'].includes(o.status));
    const paidToDate = userPaidOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const paidThisMonth = userPaidOrders.filter(o => (o.createdAt || '').startsWith('2026-10')).reduce((sum, o) => sum + (o.amount || 0), 0);

    const userEarnedOrders = orders.filter(o => o.sellerId === userId && o.status === 'completed');
    const earnedToDate = u?.earned ?? userEarnedOrders.reduce((sum, o) => sum + (o.amount * 0.9), 0);
    const earnedThisMonth = userEarnedOrders.filter(o => (o.createdAt || '').startsWith('2026-10')).reduce((sum, o) => sum + (o.amount * 0.9), 0);

    const userMethods = savedPaymentMethods.filter(m => m.userId === userId);

    res.json({
      userId,
      availableBalance,
      buyerEscrowAmount,
      freelancerEscrowAmount,
      buyerEscrowOrders,
      freelancerEscrowOrders,
      paidToDate,
      paidThisMonth,
      earnedToDate,
      earnedThisMonth,
      earnedPastTwoMonths: earnedThisMonth,
      clearingPeriodDays: 14,
      paymentMethods: userMethods,
      walletStatus: walletData?.wallet.status || 'active'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Deposit Funds into User Account
app.post('/api/payments/deposit', (req, res) => {
  try {
    const { userId, amount, paymentMethod, providerReference } = req.body;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid deposit amount greater than $0.00' });
    }

    const u = users.find(user => user.id === userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    ensureWallet(u.id);
    const key = String(providerReference || randomUUID());
    const result = financeLedger.creditDeposit({
      userId: u.id,
      amount: numAmount,
      reference: providerReference || `PAY-${Date.now()}`,
      idempotencyKey: `DEP-${u.id}-${key}`,
      actor: u.name,
      source: paymentMethod || 'Instant Card Settlement'
    });
    syncUserBalances();
    const newBalance = financeLedger.getWalletBalance(u.id) ?? u.walletBalance;
    const transaction = financeLedger.getTransactions().find(t => t.journalId === result.journal.id);

    auditLogs.unshift({
      id: 'log_' + Date.now(),
      actor: u.name,
      role: u.role,
      action: 'FUNDS_DEPOSITED',
      target: `User ${u.name}`,
      details: `Deposited $${numAmount.toFixed(2)} via ${paymentMethod || 'Credit Card'}. New Balance: $${newBalance.toFixed(2)}`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ success: true, newBalance, transaction });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Withdraw Funds from User Account
app.post('/api/payments/withdraw', (req, res) => {
  try {
    const { userId, amount, method, accountDetails } = req.body;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid withdrawal amount greater than $0.00' });
    }

    const u = users.find(user => user.id === userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    if (u.walletBalance < numAmount) {
      return res.status(400).json({ error: `Insufficient available funds. Available: $${u.walletBalance.toFixed(2)}, Requested: $${numAmount.toFixed(2)}` });
    }

    ensureWallet(u.id);
    const payoutId = 'pay_' + randomUUID().slice(0, 8);
    financeLedger.requestPayout({
      payoutId,
      freelancerId: u.id,
      amount: numAmount,
      method: method || 'Bank Transfer',
      accountDetails: accountDetails || 'Primary Bank Account',
      actor: u.name
    });
    syncUserBalances();
    const newBalance = financeLedger.getWalletBalance(u.id) ?? u.walletBalance;

    const newPayout: Payout = {
      id: payoutId,
      freelancerId: u.id,
      amount: numAmount,
      method: (method as any) || 'Bank Transfer',
      status: 'pending',
      createdAt: new Date().toISOString().split('T')[0],
      accountDetails: accountDetails || 'Primary Bank Wire'
    };
    payouts.unshift(newPayout);
    const transaction = financeLedger.getTransactions().find(t => t.relatedPayoutId === payoutId);

    auditLogs.unshift({
      id: 'log_' + Date.now(),
      actor: u.name,
      role: u.role,
      action: 'PAYOUT_REQUESTED',
      target: `Payout #${newPayout.id}`,
      details: `User requested withdrawal of $${numAmount.toFixed(2)} via ${newPayout.method}`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ success: true, newBalance, payout: newPayout, transaction });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Release Escrow Payment (Buyer approves work)
app.post('/api/payments/escrow/release', (req, res) => {
  try {
    const { orderId } = req.body;
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'completed') {
      return res.status(400).json({ error: 'Order escrow has already been released and completed.' });
    }

    const seller = users.find(u => u.id === order.sellerId);
    const buyer = users.find(u => u.id === order.buyerId);

    if (seller) ensureWallet(seller.id);
    if (buyer) ensureWallet(buyer.id);

    const result = releaseOrderFunds(order, buyer?.name || 'Authorized Buyer', 'Buyer approved work');

    auditLogs.unshift({
      id: 'log_' + Date.now(),
      actor: buyer?.name || 'Buyer',
      role: 'buyer',
      action: 'ESCROW_RELEASED_BY_BUYER',
      target: `Order #${order.id}`,
      details: `Buyer authorized escrow release of $${order.amount}. $${result.freelancerNet} credited to ${seller?.name || 'freelancer'}, $${result.platformFee} platform fee.`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ success: true, order, freelancerNet: result.freelancerNet, platformFee: result.platformFee });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Refund Escrow Payment (Buyer or Admin refund)
app.post('/api/payments/escrow/refund', (req, res) => {
  try {
    const { orderId, reason } = req.body;
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled/refunded.' });
    }

    const buyer = users.find(u => u.id === order.buyerId);
    if (buyer) ensureWallet(buyer.id);

    const result = refundOrderFunds(order, undefined, buyer?.name || 'Buyer', reason || 'Buyer escrow refund agreement');

    auditLogs.unshift({
      id: 'log_' + Date.now(),
      actor: buyer?.name || 'Buyer',
      role: 'buyer',
      action: 'ESCROW_REFUNDED_BY_BUYER',
      target: `Order #${order.id}`,
      details: `Buyer requested escrow refund of $${result.refunded} to wallet. Reason: ${reason || 'Escrow cancellation'}`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ success: true, order, refunded: result.refunded });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Deposit Escrow for Order
app.post('/api/payments/escrow/deposit', (req, res) => {
  try {
    const { orderId, userId, amount, source } = req.body;
    const numAmount = Number(amount);
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const buyer = users.find(u => u.id === userId);
    if (!buyer) return res.status(404).json({ error: 'User not found' });

    if (source === 'wallet') {
      if (buyer.walletBalance < numAmount) {
        return res.status(400).json({ error: 'Insufficient wallet balance. Please top up your wallet or pay via card.' });
      }
      buyer.walletBalance -= numAmount;
    }
    order.status = 'funded_in_escrow';
    res.json({ success: true, order, newBalance: buyer.walletBalance });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// User Transactions Ledger
app.get('/api/payments/transactions/:userId', (req, res) => {
  try {
    const userId = req.params.userId;
    const allTxns = financeLedger.getTransactions();
    const userTxns = allTxns.filter(t => t.userId === userId);
    
    if (userTxns.length === 0) {
      const syn: any[] = [];
      for (const ord of orders) {
        if (ord.buyerId === userId) {
          syn.push({
            id: `txn_ord_${ord.id}`,
            type: 'escrow_fund',
            amount: ord.amount,
            currency: 'USD',
            timestamp: `${ord.createdAt} 12:00:00`,
            status: 'completed',
            userId: userId,
            userName: ord.buyerUsername || 'Buyer',
            userRole: 'buyer',
            description: `Escrow hold for Order: ${ord.title}`,
            relatedOrderId: ord.id
          });
        }
        if (ord.sellerId === userId && ord.status === 'completed') {
          syn.push({
            id: `txn_rel_${ord.id}`,
            type: 'escrow_release',
            amount: Number((ord.amount * 0.9).toFixed(2)),
            currency: 'USD',
            timestamp: `${ord.dueDate} 15:30:00`,
            status: 'completed',
            userId: userId,
            userName: ord.sellerUsername || 'Freelancer',
            userRole: 'freelancer',
            description: `Escrow earnings (90% net) from: ${ord.title}`,
            relatedOrderId: ord.id
          });
        }
      }
      return res.json(syn);
    }

    res.json(userTxns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// User Invoices
app.get('/api/payments/invoices/:userId', (req, res) => {
  try {
    const userId = req.params.userId;
    const userOrders = orders.filter(o => o.buyerId === userId || o.sellerId === userId);
    const orderInvoices = userOrders.map(o => {
      const isBuyer = o.buyerId === userId;
      const otherUser = users.find(u => u.id === (isBuyer ? o.sellerId : o.buyerId));
      return {
        id: `inv_ord_${o.id}`,
        invoiceNumber: `INV-${o.id.replace('ord_', '').toUpperCase()}`,
        userId: userId,
        type: isBuyer ? 'received' : 'sent',
        recipientName: isBuyer ? (users.find(u => u.id === userId)?.name || 'Buyer') : (otherUser?.name || 'Client'),
        recipientEmail: isBuyer ? (users.find(u => u.id === userId)?.email || 'buyer@example.com') : (otherUser?.email || 'client@example.com'),
        issuerName: isBuyer ? (otherUser?.name || 'Freelancer') : (users.find(u => u.id === userId)?.name || 'Freelancer'),
        issuerEmail: isBuyer ? (otherUser?.email || 'seller@example.com') : (users.find(u => u.id === userId)?.email || 'seller@example.com'),
        title: o.title,
        issueDate: o.createdAt,
        dueDate: o.dueDate,
        status: o.status === 'completed' ? 'paid' : o.status === 'cancelled' ? 'refunded' : 'in_escrow',
        items: [
          { description: o.title, quantity: 1, unitPrice: o.amount, amount: o.amount }
        ],
        subtotal: o.amount,
        platformFee: Number((o.amount * 0.10).toFixed(2)),
        tax: 0,
        total: o.amount,
        notes: `WorkPerHour 14-Day Escrow Protection Order #${o.id}. 100% Protected.`,
        relatedOrderId: o.id
      };
    });

    const userCustom = customInvoices.filter(i => i.userId === userId);
    res.json([...orderInvoices, ...userCustom]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create Custom Invoice
app.post('/api/payments/invoices', (req, res) => {
  try {
    const { userId, recipientName, recipientEmail, title, dueDate, items, notes } = req.body;
    if (!title || !recipientName) {
      return res.status(400).json({ error: 'Title and recipient name are required' });
    }
    const cleanItems = (items && items.length > 0) ? items : [{ description: title, quantity: 1, unitPrice: 100, amount: 100 }];
    const subtotal = cleanItems.reduce((s: number, it: any) => s + (Number(it.amount) || (Number(it.quantity || 1) * Number(it.unitPrice || 0))), 0);
    const platformFee = Number((subtotal * 0.075).toFixed(2));
    const total = subtotal;

    const newInvoice: CustomInvoice = {
      id: 'inv_' + Date.now(),
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      userId,
      recipientName,
      recipientEmail: recipientEmail || 'client@example.com',
      title,
      issueDate: new Date().toISOString().substring(0, 10),
      dueDate: dueDate || new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
      status: 'unpaid',
      items: cleanItems,
      subtotal,
      platformFee,
      tax: 0,
      total,
      notes: notes || 'Standard WorkPerHour Invoice'
    };
    customInvoices.unshift(newInvoice);
    res.json(newInvoice);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Saved Payment Methods CRUD
app.get('/api/payments/methods/:userId', (req, res) => {
  const methods = savedPaymentMethods.filter(m => m.userId === req.params.userId);
  res.json(methods);
});

app.post('/api/payments/methods', (req, res) => {
  try {
    const { userId, type, name, details, isDefault } = req.body;
    if (!userId || !type || !name) {
      return res.status(400).json({ error: 'User ID, method type, and name are required' });
    }
    if (isDefault) {
      savedPaymentMethods.forEach(m => {
        if (m.userId === userId) m.isDefault = false;
      });
    }
    const newMethod: PaymentMethodRecord = {
      id: 'pm_' + Date.now(),
      userId,
      type,
      name,
      details: details || {},
      isDefault: Boolean(isDefault) || savedPaymentMethods.filter(m => m.userId === userId).length === 0,
      createdAt: new Date().toISOString().substring(0, 10)
    };
    savedPaymentMethods.push(newMethod);
    res.json(newMethod);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/payments/methods/:id', (req, res) => {
  const index = savedPaymentMethods.findIndex(m => m.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Payment method not found' });
  savedPaymentMethods.splice(index, 1);
  res.json({ success: true, id: req.params.id });
});

app.patch('/api/payments/methods/:id/default', (req, res) => {
  const method = savedPaymentMethods.find(m => m.id === req.params.id);
  if (!method) return res.status(404).json({ error: 'Payment method not found' });
  savedPaymentMethods.forEach(m => {
    if (m.userId === method.userId) m.isDefault = false;
  });
  method.isDefault = true;
  res.json(method);
});

// ==========================================
// DOUBLE-ENTRY LEDGER & FINANCIAL REST APIS
// ==========================================

// 1. Overview Financial Metrics Dashboard
app.get('/api/admin/finance/overview', (req, res) => {
  try {
    const overview = financeLedger.getFinancialOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. User Wallets Explorer & Details
app.get('/api/admin/finance/wallets', (req, res) => {
  try {
    const wallets = financeLedger.getWallets();
    res.json(wallets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/finance/wallets/:id', (req, res) => {
  try {
    const data = financeLedger.getWalletById(req.params.id);
    if (!data) return res.status(404).json({ error: 'Wallet not found' });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/finance/wallets/:id/freeze', (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Mandatory reason required to freeze a wallet' });
    const wallet = financeLedger.freezeWallet(req.params.id, reason, adminActor(req));
    res.json(wallet);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/finance/wallets/:id/unfreeze', (req, res) => {
  try {
    const { reason } = req.body;
    const wallet = financeLedger.unfreezeWallet(req.params.id, reason || 'Administrative review completed', adminActor(req));
    res.json(wallet);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/finance/wallets/:id/restrict', (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Mandatory reason required to restrict a wallet' });
    const wallet = financeLedger.restrictWallet(req.params.id, reason, adminActor(req));
    res.json(wallet);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Transactions Explorer
app.get('/api/admin/finance/transactions', (req, res) => {
  try {
    const txns = financeLedger.getTransactions();
    res.json(txns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/finance/transactions/:id', (req, res) => {
  try {
    const txn = financeLedger.getTransactionById(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });
    const journal = txn.journalId ? financeLedger.getJournalById(txn.journalId) : null;
    res.json({ transaction: txn, journal });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Double-Entry Ledger Journals & Entries
app.get('/api/admin/finance/ledger', (req, res) => {
  try {
    const journals = financeLedger.getJournals();
    res.json(journals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/finance/ledger/:id', (req, res) => {
  try {
    const journal = financeLedger.getJournalById(req.params.id);
    if (!journal) return res.status(404).json({ error: 'Journal not found' });
    res.json(journal);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/finance/ledger/:id/reverse', (req, res) => {
  try {
    const { reason, actor } = req.body;
    if (!reason) return res.status(400).json({ error: 'Mandatory accounting reversal reason required' });
    const reversal = financeLedger.reverseJournal(req.params.id, reason, adminActor(req));
    res.json(reversal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Escrow & Order Protection Vault Management
app.get('/api/admin/finance/escrow', (req, res) => {
  try {
    const escrowOrders = orders.map(o => {
      const enriched = enrichOrderWithServiceInfo(o);
      const isDisputed = disputes.some(d => d.orderId === o.id && (d.status === 'open' || d.status === 'under_investigation'));
      const isRefunded = refunds.some(r => r.orderId === o.id && r.status === 'approved');
      const buyer = users.find(u => u.id === o.buyerId);
      const seller = users.find(u => u.id === o.sellerId);

      let escrowState = 'in_progress';
      if (isDisputed) escrowState = 'disputed';
      else if (isRefunded) escrowState = 'refunded';
      else if (o.status === 'completed') escrowState = 'released';
      else if (o.status === 'delivered') escrowState = 'release_pending';
      else if (o.status === 'funded_in_escrow') escrowState = 'funded';

      return {
        ...enriched,
        buyerName: buyer?.name || 'Buyer #' + o.buyerId,
        buyerEmail: buyer?.email || '',
        sellerName: seller?.name || 'Freelancer #' + o.sellerId,
        sellerEmail: seller?.email || '',
        platformFeeRate: `${financeLedger.getPlatformCommissionRate()}%`,
        platformFeeAmount: FinanceLedgerEngine.round(o.amount * financeLedger.getPlatformCommissionRate() / 100),
        freelancerNetAmount: FinanceLedgerEngine.round(o.amount - o.amount * financeLedger.getPlatformCommissionRate() / 100),
        ledgerEscrowStatus: financeLedger.getEscrow(o.id)?.status || 'not_funded',
        ledgerEscrowHeld: financeLedger.getEscrow(o.id)?.remaining ?? 0,
        escrowState,
        isDisputed
      };
    });
    res.json(escrowOrders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/finance/escrow/:orderId/release', (req, res) => {
  try {
    const order = orders.find(o => o.id === req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const activeDispute = disputes.find(d => d.orderId === order.id && (d.status === 'open' || d.status === 'under_investigation'));
    if (activeDispute) {
      return res.status(400).json({ error: `Cannot release escrow: Order #${order.id} is under active dispute (${activeDispute.id}). Resolve the dispute first.` });
    }
    const result = releaseOrderFunds(order, adminActor(req), String(req.body.reason || 'Administrative escrow release'), req.body.requestKey);
    res.json({ success: true, order, journal: result.journal, freelancerNet: result.freelancerNet, platformFee: result.platformFee });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/finance/escrow/:orderId/refund', (req, res) => {
  try {
    const order = orders.find(o => o.id === req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const amount = req.body.amount === undefined || req.body.amount === '' ? undefined : Number(req.body.amount);
    const result = refundOrderFunds(order, amount, adminActor(req), String(req.body.reason || 'Administrative escrow refund approval'), req.body.requestKey);
    closeActiveDispute(order.id, 'resolved_refund', String(req.body.reason || 'Administrative escrow refund'));
    res.json({ success: true, order, journal: result.journal });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Payouts Management & Gateway Settlements
app.get('/api/admin/finance/payouts', (req, res) => {
  try {
    const enrichedPayouts = payouts.map(p => {
      const freelancer = users.find(u => u.id === p.freelancerId);
      const wallet = financeLedger.getWalletById(p.freelancerId);
      return {
        ...p,
        freelancerName: freelancer?.name || 'Freelancer #' + p.freelancerId,
        freelancerEmail: freelancer?.email || '',
        walletAvailableBalance: wallet?.wallet.availableBalance || 0,
        currency: 'USD'
      };
    });
    res.json(enrichedPayouts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const REVIEW_THRESHOLD = DEFAULT_SITE_SETTINGS.wallets.manualReviewThresholdAmount;
const ALLOWED_METHODS: Record<string, keyof typeof DEFAULT_SITE_SETTINGS.wallets.allowedPayoutMethods> = {
  'UPI': 'upi', 'Bank Transfer': 'bankTransfer', 'Stripe': 'stripeConnect', 'Razorpay': 'razorpayX', 'PayPal': 'paypal'
};

function payoutAudit(req: Request, action: string, p: Payout, details: string) {
  auditLogs.unshift({
    id: 'FAUD-' + randomUUID().slice(0, 12),
    actor: adminActor(req),
    role: 'super_admin',
    action,
    target: `Payout #${p.id}`,
    details,
    timestamp: new Date().toLocaleString()
  });
}

const approvePayout = (req: Request, res: Response) => {
  try {
    const p = payouts.find(pay => pay.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Payout not found' });
    if (p.status !== 'pending') return res.status(400).json({ error: `Cannot approve payout in status "${p.status}"` });
    p.status = 'approved';
    payoutAudit(req, 'PAYOUT_APPROVED', p, `Approved payout of $${p.amount} via ${p.method} for freelancer ${p.freelancerId}`);
    res.json(p);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

// Marks a payout as paid. When a real gateway is connected, call it here FIRST and only continue on success.
const processPayout = (req: Request, res: Response) => {
  try {
    const p = payouts.find(pay => pay.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Payout not found' });
    if (p.status !== 'pending' && p.status !== 'approved') return res.status(400).json({ error: `Cannot process payout in status "${p.status}"` });
    if (p.amount >= REVIEW_THRESHOLD && p.status !== 'approved') return res.status(400).json({ error: `Payouts of $${REVIEW_THRESHOLD} or more must be approved before processing.` });
    const { journal } = financeLedger.settlePayout({ payoutId: p.id, actor: adminActor(req), providerReference: req.body?.providerReference });
    p.status = 'processed';
    payoutAudit(req, 'PAYOUT_PROCESSED', p, `Processed payout of $${p.amount} via ${p.method}`);
    syncUserBalances();
    res.json({ success: true, payout: p, journal, ...p });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

const rejectPayout = (req: Request, res: Response) => {
  try {
    const p = payouts.find(pay => pay.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Payout not found' });
    if (p.status !== 'pending' && p.status !== 'approved') return res.status(400).json({ error: `Cannot reject payout in status "${p.status}"` });
    financeLedger.cancelPayout({ payoutId: p.id, reason: String(req.body?.reason || 'Administrative rejection'), actor: adminActor(req) });
    p.status = 'cancelled';
    payoutAudit(req, 'PAYOUT_REJECTED', p, `Rejected payout of $${p.amount}; funds returned to wallet`);
    syncUserBalances();
    res.json({ success: true, payout: p, ...p });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

const failPayout = (req: Request, res: Response) => {
  try {
    const p = payouts.find(pay => pay.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Payout not found' });
    if (p.status !== 'pending' && p.status !== 'approved') return res.status(400).json({ error: `Cannot fail payout in status "${p.status}"` });
    financeLedger.failPayout({ payoutId: p.id, reason: String(req.body?.reason || 'Gateway reported a transfer failure'), actor: adminActor(req) });
    p.status = 'failed';
    payoutAudit(req, 'PAYOUT_FAILED', p, `Payout of $${p.amount} failed; funds returned to wallet`);
    syncUserBalances();
    res.json(p);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

const retryPayout = (req: Request, res: Response) => {
  try {
    const p = payouts.find(pay => pay.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Payout not found' });
    if (p.status !== 'failed') return res.status(400).json({ error: 'Only failed payouts can be retried.' });
    financeLedger.retryPayout({ payoutId: p.id, actor: adminActor(req) });
    p.status = 'pending';
    payoutAudit(req, 'PAYOUT_RETRIED', p, `Re-queued failed payout of $${p.amount}`);
    syncUserBalances();
    res.json(p);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

app.post('/api/admin/finance/payouts/:id/approve', approvePayout);
app.post('/api/admin/finance/payouts/:id/process', processPayout);
app.post('/api/admin/finance/payouts/:id/reject', rejectPayout);
app.post('/api/admin/finance/payouts/:id/fail', failPayout);
app.post('/api/admin/finance/payouts/:id/retry', retryPayout);
// Legacy routes still used by the older admin payments tab in App.tsx
app.patch('/api/admin/payouts/:id/approve', approvePayout);
app.patch('/api/admin/payouts/:id/process', processPayout);
app.patch('/api/admin/payouts/:id/fail', failPayout);

// Freelancer withdrawal request: the money leaves the wallet immediately and waits for admin approval.
// NOTE: there is no login system yet, so freelancerId comes from the client. Bind it to the
// authenticated session user before going live.
app.post('/api/payouts', rateLimit(10, 60_000), (req, res) => {
  try {
    const freelancerId = String(req.body?.freelancerId || '');
    const user = users.find(u => u.id === freelancerId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'active') return res.status(403).json({ error: `Account is ${user.status}; withdrawals are blocked.` });
    ensureWallet(freelancerId);
    if (REQUIRE_KYC_FOR_PAYOUTS && !user.verified) return res.status(403).json({ error: 'Identity verification (KYC) is required before withdrawing.' });
    const method = String(req.body?.method || '');
    const settingKey = ALLOWED_METHODS[method];
    if (!settingKey || !DEFAULT_SITE_SETTINGS.wallets.allowedPayoutMethods[settingKey]) return res.status(400).json({ error: 'Unsupported payout method.' });
    const id = 'pay_' + randomUUID().slice(0, 8);
    const { payout } = financeLedger.requestPayout({ payoutId: id, freelancerId, amount: Number(req.body?.amount), method, accountDetails: String(req.body?.accountDetails || ''), actor: `user:${freelancerId}` });
    const record: Payout = { id, freelancerId, amount: payout.amount, method: method as Payout['method'], status: 'pending', createdAt: new Date().toISOString().substring(0, 10), accountDetails: payout.accountDetails };
    payouts.unshift(record);
    syncUserBalances();
    res.status(201).json(record);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// Wallet top-up. Simulated until a payment gateway is connected: when you add Stripe/Razorpay, delete this
// route and call financeLedger.creditDeposit() from the verified webhook handler using the gateway's event id as idempotencyKey.
app.post('/api/wallet/deposit', rateLimit(10, 60_000), (req, res) => {
  try {
    if (IS_PROD && process.env.ALLOW_SIMULATED_DEPOSITS !== 'true') {
      return res.status(501).json({ error: 'Deposits require a connected payment gateway.' });
    }
    const userId = String(req.body?.userId || '');
    const amount = Number(req.body?.amount);
    if (!users.some(u => u.id === userId)) return res.status(404).json({ error: 'User not found' });
    ensureWallet(userId);
    if (Number.isFinite(amount) && amount > 5000) return res.status(400).json({ error: 'Simulated deposits are limited to $5,000.' });
    const key = String(req.body?.idempotencyKey || randomUUID());
    const { replayed } = financeLedger.creditDeposit({ userId, amount, reference: `SIM-${key}`, idempotencyKey: `SIM-${userId}-${key}`, actor: 'Simulated Gateway', source: 'simulated' });
    syncUserBalances();
    res.json({ success: true, replayed, balance: financeLedger.getWalletBalance(userId) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 7. Reconciliation Workspace & Exception Resolution
app.get('/api/admin/finance/reconciliation', (req, res) => {
  try {
    const recon = financeLedger.getReconciliationSummary();
    res.json(recon);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/finance/reconciliation/resolve/:id', (req, res) => {
  try {
    const { notes, actor } = req.body;
    if (!notes) return res.status(400).json({ error: 'Investigation notes required to mark exception resolved' });
    const resolved = financeLedger.resolveException(req.params.id, notes, adminActor(req));
    res.json(resolved);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Financial Audit Trail
app.get('/api/admin/finance/audit', (req, res) => {
  try {
    const logs = financeLedger.getAuditLogs();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Administrative Adjustments (Controlled Double-Entry Workflow)
app.post('/api/admin/finance/adjustments/preview', (req, res) => {
  try {
    const { userId, amount, direction, category, reason } = req.body;
    const preview = financeLedger.previewAdjustment({ userId, amount: Number(amount), direction, category, reason });
    res.json(preview);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/finance/adjustments', (req, res) => {
  try {
    const { userId, amount, direction, category, reason, evidenceReference, requestKey } = req.body;
    const result = financeLedger.executeAdministrativeAdjustment({
      userId,
      amount: Number(amount),
      direction,
      category,
      reason,
      evidenceReference,
      actor: adminActor(req),
      requestKey
    });
    syncUserBalances();
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Reports & CSV Export Engine
app.get('/api/admin/finance/export/:type', (req, res) => {
  try {
    const { type } = req.params;
    const { filename, content } = financeLedger.generateCsvExport(type, req.query as any);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(content);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Category CRUD Endpoints
app.post('/api/admin/categories', (req, res) => {
  const { name, slug } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const catSlug = slug || name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
  const newCat: Category = {
    id: 'cat_' + Date.now(),
    name,
    slug: catSlug,
    enabled: true,
    order: categories.length + 1,
    subcategories: []
  };
  categories.push(newCat);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'CATEGORY_CREATED',
    target: `Category: ${name}`,
    details: `Created new main category "${name}" with slug /${catSlug}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(categories);
});

app.post('/api/admin/categories/bulk-delete', (req, res) => {
  const { categoryIds = [], subcategoryPairs = [] } = req.body;
  if (Array.isArray(categoryIds) && categoryIds.length > 0) {
    categories = categories.filter(c => !categoryIds.includes(c.id));
  }
  if (Array.isArray(subcategoryPairs) && subcategoryPairs.length > 0) {
    subcategoryPairs.forEach(({ catId, subId }: { catId: string; subId: string }) => {
      const cat = categories.find(c => c.id === catId);
      if (cat) {
        cat.subcategories = cat.subcategories.filter(s => s.id !== subId);
      }
    });
  }

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'CATEGORIES_BULK_DELETED',
    target: 'Marketplace Categories',
    details: `Bulk deleted ${categoryIds.length} categories and ${subcategoryPairs.length} subcategories`,
    timestamp: new Date().toLocaleString()
  });

  res.json(categories);
});

app.patch('/api/admin/categories/:id', (req, res) => {
  const cat = categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  if (req.body.name) cat.name = req.body.name;
  if (req.body.slug) cat.slug = req.body.slug;
  if (typeof req.body.enabled === 'boolean') cat.enabled = req.body.enabled;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'CATEGORY_UPDATED',
    target: `Category: ${cat.name}`,
    details: `Updated category name/slug/status for ${cat.name}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(categories);
});

app.patch('/api/admin/categories/:id/toggle', (req, res) => {
  const cat = categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  cat.enabled = !cat.enabled;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: cat.enabled ? 'CATEGORY_ENABLED' : 'CATEGORY_DISABLED',
    target: `Category: ${cat.name}`,
    details: `Toggled status of category ${cat.name} to ${cat.enabled ? 'Enabled' : 'Disabled'}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(categories);
});

app.delete('/api/admin/categories/:id', (req, res) => {
  const index = categories.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Category not found' });
  const deleted = categories[index];
  categories.splice(index, 1);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'CATEGORY_DELETED',
    target: `Category: ${deleted.name}`,
    details: `Deleted category ${deleted.name}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(categories);
});

// Subcategory CRUD Endpoints
app.post('/api/admin/categories/:id/subcategories', (req, res) => {
  const cat = categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Parent category not found' });
  const { name, slug } = req.body;
  if (!name) return res.status(400).json({ error: 'Subcategory name is required' });
  const subSlug = slug || name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
  const newSub = {
    id: 'sub_' + Date.now(),
    name,
    slug: subSlug,
    enabled: true
  };
  cat.subcategories.push(newSub);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'SUBCATEGORY_CREATED',
    target: `Subcategory: ${name} (under ${cat.name})`,
    details: `Created subcategory ${name}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(categories);
});

app.patch('/api/admin/categories/:id/subcategories/:subId', (req, res) => {
  const cat = categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Parent category not found' });
  const sub = cat.subcategories.find(s => s.id === req.params.subId);
  if (!sub) return res.status(404).json({ error: 'Subcategory not found' });
  if (req.body.name) sub.name = req.body.name;
  if (req.body.slug) sub.slug = req.body.slug;
  if (typeof req.body.enabled === 'boolean') sub.enabled = req.body.enabled;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'SUBCATEGORY_UPDATED',
    target: `Subcategory: ${sub.name}`,
    details: `Updated subcategory under ${cat.name}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(categories);
});

app.patch('/api/admin/categories/:id/subcategories/:subId/toggle', (req, res) => {
  const cat = categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Parent category not found' });
  const sub = cat.subcategories.find(s => s.id === req.params.subId);
  if (!sub) return res.status(404).json({ error: 'Subcategory not found' });
  sub.enabled = !sub.enabled;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: sub.enabled ? 'SUBCATEGORY_ENABLED' : 'SUBCATEGORY_DISABLED',
    target: `Subcategory: ${sub.name}`,
    details: `Toggled subcategory status to ${sub.enabled ? 'Enabled' : 'Disabled'}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(categories);
});

app.delete('/api/admin/categories/:id/subcategories/:subId', (req, res) => {
  const cat = categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Parent category not found' });
  const subIndex = cat.subcategories.findIndex(s => s.id === req.params.subId);
  if (subIndex === -1) return res.status(404).json({ error: 'Subcategory not found' });
  const deletedSub = cat.subcategories[subIndex];
  cat.subcategories.splice(subIndex, 1);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'SUBCATEGORY_DELETED',
    target: `Subcategory: ${deletedSub.name}`,
    details: `Deleted subcategory from ${cat.name}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(categories);
});
app.get('/api/reviews', (req, res) => res.json(reviews));
app.get('/api/support-tickets', (req, res) => res.json(supportTickets));
app.get('/api/audit-logs', (req, res) => res.json(auditLogs));

// User Email Notifications API
app.get('/api/user-emails/:userId', (req, res) => {
  const userList = userEmails.filter(e => e.userId === req.params.userId);
  res.json(userList);
});

app.patch('/api/user-emails/:id/read', (req, res) => {
  const em = userEmails.find(e => e.id === req.params.id);
  if (em) em.read = true;
  res.json({ success: true });
});

// User Support Ticket Creation API
app.post('/api/support-tickets', (req, res) => {
  const { userId, userName, subject, text, priority = 'medium' } = req.body;
  const newTicket: SupportTicket = {
    id: 'tick_' + Date.now(),
    userId: userId || 'user_1',
    userName: userName || 'Elena Rostova',
    subject: subject || 'General Support Query',
    priority,
    status: 'open',
    createdAt: new Date().toISOString().split('T')[0],
    messages: [
      { sender: userName || 'Elena Rostova', text: text || 'I need support assistance regarding my account.', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ]
  };
  supportTickets.unshift(newTicket);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: userName || 'User',
    role: 'user',
    action: 'SUPPORT_TICKET_OPENED',
    target: `Ticket #${newTicket.id}`,
    details: `User submitted support request: ${subject}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(newTicket);
});

app.get('/api/messages/:orderId', (req, res) => {
  const filtered = messages.filter(m => m.orderId === req.params.orderId);
  res.json(filtered);
});

app.post('/api/messages', (req, res) => {
  const newMsg: Message = {
    id: 'msg_' + Date.now(),
    orderId: req.body.orderId,
    senderId: req.body.senderId || 'user_2',
    senderName: req.body.senderName || 'Marcus Vance',
    text: req.body.text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  messages.push(newMsg);
  res.json(newMsg);
});

app.post('/api/gigs', (req, res) => {
  const newGig: Gig = {
    id: 'gig_' + Date.now(),
    freelancerId: req.body.freelancerId || 'user_1',
    freelancerName: req.body.freelancerName || 'Elena Rostova',
    freelancerUsername: req.body.freelancerUsername || 'elena_rostova',
    freelancerAvatar: req.body.freelancerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
    freelancerLevel: req.body.freelancerLevel || 'Level 1 ★',
    title: req.body.title,
    slug: req.body.title ? req.body.title.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') : 'custom-gig',
    category: req.body.category || 'Development & IT',
    subcategory: req.body.subcategory || 'General',
    description: req.body.description,
    price: Number(req.body.price),
    deliveryDays: Number(req.body.deliveryDays),
    rating: 5.0,
    reviewsCount: 1,
    image: req.body.image || 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&h=500&fit=crop',
    status: 'published',
    featured: false,
    extras: req.body.extras || []
  };
  gigs.unshift(newGig);
  res.json(newGig);
});

app.post('/api/projects', (req, res) => {
  const newProj: Project = {
    id: 'proj_' + Date.now(),
    buyerId: req.body.buyerId || 'user_2',
    buyerName: req.body.buyerName || 'Marcus Vance',
    buyerAvatar: req.body.buyerAvatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    title: req.body.title,
    category: req.body.category || 'Development & IT',
    subcategory: req.body.subcategory || 'General',
    description: req.body.description,
    budgetMin: Number(req.body.budgetMin),
    budgetMax: Number(req.body.budgetMax),
    deadlineDays: 14,
    proposalsCount: 0,
    createdAt: new Date().toISOString().split('T')[0],
    status: 'open',
    featured: false
  };
  projects.unshift(newProj);
  res.json(newProj);
});

// Admin Projects Management Endpoints
app.patch('/api/admin/projects/:id', (req, res) => {
  const p = projects.find(proj => proj.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });

  if (req.body.title !== undefined) p.title = req.body.title;
  if (req.body.category !== undefined) p.category = req.body.category;
  if (req.body.subcategory !== undefined) p.subcategory = req.body.subcategory;
  if (req.body.description !== undefined) p.description = req.body.description;
  if (req.body.budgetMin !== undefined) p.budgetMin = Number(req.body.budgetMin);
  if (req.body.budgetMax !== undefined) p.budgetMax = Number(req.body.budgetMax);
  if (req.body.deadlineDays !== undefined) p.deadlineDays = Number(req.body.deadlineDays);
  if (req.body.status !== undefined) p.status = req.body.status;
  if (req.body.featured !== undefined) p.featured = Boolean(req.body.featured);
  if (req.body.moderationStatus !== undefined) p.moderationStatus = req.body.moderationStatus;
  if (req.body.moderationNotes !== undefined) p.moderationNotes = req.body.moderationNotes;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'PROJECT_EDITED',
    target: `Project "${p.title}"`,
    details: `Updated project parameters, category, budget, or moderation status`,
    timestamp: new Date().toLocaleString()
  });

  res.json(p);
});

app.patch('/api/admin/projects/:id/status', (req, res) => {
  const p = projects.find(proj => proj.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });

  const oldStatus = p.status;
  p.status = req.body.status;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: `PROJECT_STATUS_${req.body.status.toUpperCase()}`,
    target: `Project "${p.title}"`,
    details: `Changed project status from "${oldStatus}" to "${req.body.status}"`,
    timestamp: new Date().toLocaleString()
  });

  res.json(p);
});

app.patch('/api/admin/projects/:id/feature', (req, res) => {
  const p = projects.find(proj => proj.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });

  p.featured = !p.featured;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: p.featured ? 'PROJECT_FEATURED' : 'PROJECT_UNFEATURED',
    target: `Project "${p.title}"`,
    details: `${p.featured ? 'Featured' : 'Unfeatured'} project on platform homepage & listings`,
    timestamp: new Date().toLocaleString()
  });

  res.json(p);
});

app.delete('/api/admin/projects/:id', (req, res) => {
  const index = projects.findIndex(proj => proj.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Project not found' });

  const deleted = projects[index];
  projects.splice(index, 1);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'PROJECT_DELETED',
    target: `Project "${deleted.title}"`,
    details: `Permanently removed project #${deleted.id} by ${deleted.buyerName}`,
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, id: deleted.id });
});

// Admin Gigs / Services Management Endpoints
app.patch('/api/admin/gigs/:id', (req, res) => {
  const g = gigs.find(gig => gig.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Gig/Service not found' });

  if (req.body.title !== undefined) g.title = req.body.title;
  if (req.body.category !== undefined) g.category = req.body.category;
  if (req.body.subcategory !== undefined) g.subcategory = req.body.subcategory;
  if (req.body.description !== undefined) g.description = req.body.description;
  if (req.body.price !== undefined) g.price = Number(req.body.price);
  if (req.body.deliveryDays !== undefined) g.deliveryDays = Number(req.body.deliveryDays);
  if (req.body.status !== undefined) g.status = req.body.status;
  if (req.body.featured !== undefined) g.featured = Boolean(req.body.featured);
  if (req.body.moderationStatus !== undefined) g.moderationStatus = req.body.moderationStatus;
  if (req.body.moderationNotes !== undefined) g.moderationNotes = req.body.moderationNotes;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'GIG_EDITED',
    target: `Gig "${g.title}"`,
    details: `Updated gig specifications, pricing, delivery, or moderation verdict: "${g.moderationStatus || 'none'}"`,
    timestamp: new Date().toLocaleString()
  });

  res.json(g);
});

app.patch('/api/admin/gigs/:id/status', (req, res) => {
  const g = gigs.find(gig => gig.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Gig/Service not found' });

  const oldStatus = g.status;
  g.status = req.body.status;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: `GIG_STATUS_${req.body.status.toUpperCase()}`,
    target: `Gig "${g.title}"`,
    details: `Changed service status from "${oldStatus}" to "${req.body.status}"`,
    timestamp: new Date().toLocaleString()
  });

  res.json(g);
});

app.patch('/api/admin/gigs/:id/feature', (req, res) => {
  const g = gigs.find(gig => gig.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Gig/Service not found' });

  g.featured = !g.featured;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: g.featured ? 'GIG_FEATURED' : 'GIG_UNFEATURED',
    target: `Gig "${g.title}"`,
    details: `${g.featured ? 'Featured' : 'Unfeatured'} freelancer service on marketplace home & listings`,
    timestamp: new Date().toLocaleString()
  });

  res.json(g);
});

app.delete('/api/admin/gigs/:id', (req, res) => {
  const index = gigs.findIndex(gig => gig.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Gig/Service not found' });

  const deleted = gigs[index];
  gigs.splice(index, 1);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'GIG_DELETED',
    target: `Gig "${deleted.title}"`,
    details: `Permanently deleted freelancer gig #${deleted.id} by ${deleted.freelancerName}`,
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, id: deleted.id });
});

app.post('/api/proposals', (req, res) => {
  const newProp: Proposal = {
    id: 'prop_' + Date.now(),
    projectId: req.body.projectId,
    freelancerId: req.body.freelancerId || 'user_1',
    freelancerName: req.body.freelancerName || 'Elena Rostova',
    freelancerAvatar: req.body.freelancerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
    freelancerTitle: req.body.freelancerTitle || 'Senior Engineer',
    coverLetter: req.body.coverLetter,
    bidAmount: Number(req.body.bidAmount),
    deliveryDays: Number(req.body.deliveryDays),
    createdAt: new Date().toISOString().split('T')[0],
    status: 'pending'
  };
  proposals.unshift(newProp);
  const proj = projects.find(p => p.id === req.body.projectId);
  if (proj) proj.proposalsCount += 1;
  res.json(newProp);
});

app.post('/api/orders', rateLimit(30, 60_000), (req, res) => {
  try {
    // NOTE: no login system yet, so buyerId comes from the client. Bind it to the authenticated user before going live.
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (title.length < 3) return res.status(400).json({ error: 'A valid order title is required.' });
    const buyerId = String(req.body?.buyerId || '');
    const sellerId = String(req.body?.sellerId || '');
    const buyer = users.find(u => u.id === buyerId);
    const seller = users.find(u => u.id === sellerId);
    if (!buyer || !seller) return res.status(404).json({ error: 'Buyer or seller not found.' });
    if (buyerId === sellerId) return res.status(400).json({ error: 'You cannot order from yourself.' });
    ensureWallet(buyerId); ensureWallet(sellerId);
    if (buyer.status !== 'active' || seller.status !== 'active') return res.status(403).json({ error: 'Both accounts must be active to place an order.' });

    const id = 'ord_' + randomUUID().slice(0, 12);
    const today = new Date().toISOString().split('T')[0];
    const rawAmount = Number(req.body?.amount);
    const isInquiry = rawAmount === 0 && /^inquiry:/i.test(title);

    let newOrd: Order;
    if (isInquiry) {
      // Chat thread only: nothing is charged and no escrow exists
      newOrd = { id, title, buyerId, sellerId, amount: 0, status: 'in_progress', createdAt: today, dueDate: req.body.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], gigId: req.body.gigId, projectId: req.body.projectId };
    } else {
      // Debits the buyer wallet into escrow. Throws (and creates nothing) if the balance is too low.
      financeLedger.fundEscrow({ orderId: id, orderTitle: title, amount: rawAmount, buyerId, sellerId, actor: `user:${buyerId}` });
      newOrd = {
        id, title, buyerId, sellerId, amount: rawAmount, status: 'funded_in_escrow', createdAt: today,
        dueDate: req.body.dueDate || new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
        escrowProtectionStartDate: today,
        escrowProtectionEndDate: new Date(Date.now() + DEFAULT_SITE_SETTINGS.commission.escrowProtectionDays * 86400000).toISOString().split('T')[0],
        gigId: req.body.gigId, projectId: req.body.projectId
      };
      syncUserBalances();
    }
    const enriched = enrichOrderWithServiceInfo(newOrd);
    orders.unshift(enriched);
    res.status(201).json(enriched);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Proposals Management Endpoints
app.patch('/api/admin/proposals/:id', (req, res) => {
  const p = proposals.find(prop => prop.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposal not found' });

  if (req.body.coverLetter !== undefined) p.coverLetter = req.body.coverLetter;
  if (req.body.bidAmount !== undefined) p.bidAmount = Number(req.body.bidAmount);
  if (req.body.deliveryDays !== undefined) p.deliveryDays = Number(req.body.deliveryDays);
  if (req.body.status !== undefined) p.status = req.body.status;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'PROPOSAL_EDITED',
    target: `Proposal #${p.id}`,
    details: `Updated bid parameters ($${p.bidAmount}), delivery days (${p.deliveryDays}d), or status (${p.status}) for freelancer ${p.freelancerName}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(p);
});

app.patch('/api/admin/proposals/:id/status', (req, res) => {
  const p = proposals.find(prop => prop.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposal not found' });

  const oldStatus = p.status;
  p.status = req.body.status;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: `PROPOSAL_STATUS_${req.body.status.toUpperCase()}`,
    target: `Proposal #${p.id}`,
    details: `Changed proposal status from "${oldStatus}" to "${req.body.status}" for freelancer ${p.freelancerName}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(p);
});

app.delete('/api/admin/proposals/:id', (req, res) => {
  const index = proposals.findIndex(prop => prop.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Proposal not found' });

  const deleted = proposals[index];
  proposals.splice(index, 1);

  // Decrement proposalsCount on project if project exists
  const proj = projects.find(p => p.id === deleted.projectId);
  if (proj && proj.proposalsCount > 0) {
    proj.proposalsCount -= 1;
  }

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'PROPOSAL_DELETED',
    target: `Proposal #${deleted.id}`,
    details: `Permanently removed proposal #${deleted.id} by freelancer ${deleted.freelancerName} from project #${deleted.projectId}`,
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, id: deleted.id });
});

// User Management Endpoints
app.patch('/api/admin/users/:id', (req, res) => {
  const u = users.find(user => user.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  
  if (req.body.name !== undefined) u.name = req.body.name;
  if (req.body.email !== undefined) u.email = req.body.email;
  if (req.body.role !== undefined) u.role = req.body.role;
  if (req.body.title !== undefined) u.title = req.body.title;
  if (req.body.bio !== undefined) u.bio = req.body.bio;
  if (req.body.skills !== undefined) u.skills = Array.isArray(req.body.skills) ? req.body.skills : req.body.skills.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (req.body.hourlyRate !== undefined) u.hourlyRate = Number(req.body.hourlyRate);
  // walletBalance is ledger-controlled and intentionally ignored here (use /api/admin/finance/adjustments)
  if (req.body.verified !== undefined) u.verified = Boolean(req.body.verified);
  if (req.body.status !== undefined) u.status = req.body.status;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'USER_PROFILE_EDITED',
    target: `User ${u.name}`,
    details: `Updated profile details and parameters for ${u.email}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(u);
});

app.patch('/api/admin/users/:id/status', (req, res) => {
  const u = users.find(user => user.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  
  const oldStatus = u.status;
  u.status = req.body.status;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: `USER_STATUS_${req.body.status.toUpperCase()}`,
    target: `User ${u.name}`,
    details: `Changed account status from ${oldStatus} to ${req.body.status}`,
    timestamp: new Date().toLocaleString()
  });

  // Notify user via chat message and email notification if suspended or restricted
  if (req.body.status === 'suspended' || req.body.status === 'restricted') {
    notifyUserOnAdminAction(u, req.body.status, req.body.notes);
  }

  res.json(u);
});

app.post('/api/admin/users/:id/impersonate', (req, res) => {
  const u = users.find(user => user.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'USER_IMPERSONATED',
    target: `User ${u.name}`,
    details: `Initialized administrative impersonation session for ${u.email}`,
    timestamp: new Date().toLocaleString()
  });

  // Send security chat notification & email
  notifyUserOnAdminAction(u, 'impersonated');

  res.json({ success: true, user: u });
});

app.post('/api/admin/users/:id/stop-impersonate', (req, res) => {
  const u = users.find(user => user.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'USER_IMPERSONATION_ENDED',
    target: `User ${u.name}`,
    details: `Safely ended administrative impersonation session for ${u.email}`,
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, user: u });
});

app.patch('/api/admin/users/:id/verify', (req, res) => {
  const u = users.find(user => user.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  u.verified = !u.verified;

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: u.verified ? 'USER_VERIFIED' : 'USER_UNVERIFIED',
    target: `User ${u.name}`,
    details: `Verification status changed to ${u.verified}`,
    timestamp: new Date().toLocaleString()
  });

  res.json(u);
});

app.delete('/api/admin/users/:id', (req, res) => {
  const index = users.findIndex(user => user.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });

  const target = users[index];
  if (financeLedger.hasOutstandingFunds(target.id)) {
    return res.status(409).json({ error: 'User still has wallet funds, pending withdrawals or active escrow. Resolve these before deleting the account.' });
  }
  if (orders.some(o => (o.buyerId === target.id || o.sellerId === target.id) && o.status !== 'completed' && o.status !== 'cancelled' && o.amount > 0)) {
    return res.status(409).json({ error: 'User has active paid orders. Complete or cancel them first.' });
  }
  const deletedUser = users[index];
  users.splice(index, 1);

  // Clean up listings to maintain references
  gigs = gigs.filter(g => g.freelancerId !== req.params.id);
  projects = projects.filter(p => p.buyerId !== req.params.id);

  auditLogs.unshift({
    id: 'log_' + Date.now(),
    actor: 'Admin Chief',
    role: 'super_admin',
    action: 'USER_DELETED',
    target: `User ${deletedUser.name}`,
    details: `Permanently deleted user account ${deletedUser.email} and cleared their associated gigs & projects`,
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, id: deletedUser.id });
});

// Dispute Resolution Endpoint: final outcomes actually move the escrowed money
app.patch('/api/admin/disputes/:id/resolve', (req, res) => {
  try {
    const d = disputes.find(disp => disp.id === req.params.id);
    if (!d) return res.status(404).json({ error: 'Dispute not found' });
    const status = req.body.status as Dispute['status'];
    if (!['open', 'under_investigation', 'resolved_refund', 'resolved_release', 'resolved_partial'].includes(status)) {
      return res.status(400).json({ error: 'Invalid dispute status.' });
    }
    if (d.status.startsWith('resolved')) return res.status(409).json({ error: `Dispute is already ${d.status}.` });
    const notes = String(req.body.notes || '');
    const reason = notes.trim().length >= 5 ? notes.trim() : 'Dispute resolved by administrator';
    const order = orders.find(o => o.id === d.orderId);
    if (status.startsWith('resolved')) {
      if (!order) return res.status(404).json({ error: 'Order for this dispute not found' });
      if (status === 'resolved_release') releaseOrderFunds(order, adminActor(req), reason);
      else if (status === 'resolved_refund') refundOrderFunds(order, undefined, adminActor(req), reason);
      else splitOrderFunds(order, Number(req.body.refundAmount), adminActor(req), reason);
    }
    d.status = status;
    d.resolutionNotes = notes;
    auditLogs.unshift({
      id: 'log_' + randomUUID().slice(0, 12),
      actor: adminActor(req),
      role: 'super_admin',
      action: 'DISPUTE_RESOLVED',
      target: `Dispute #${d.id}`,
      details: `Resolved dispute with status ${status}. Notes: ${notes}`,
      timestamp: new Date().toLocaleString()
    });
    res.json(d);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Support Ticket Reply Endpoint
app.post('/api/admin/tickets/:id/reply', (req, res) => {
  const t = supportTickets.find(tick => tick.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  t.messages.push({
    sender: 'WorkPerHour Support Staff',
    text: req.body.text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  t.status = 'in_progress';
  res.json(t);
});

// Gemini AI Endpoints
app.post('/api/ai/proposal', async (req, res) => {
  try {
    const { projectTitle, projectDescription, freelancerTitle, freelancerSkills } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Write a professional, winning freelance proposal cover letter for a project titled "${projectTitle}".
Project Description: "${projectDescription}".
Freelancer Professional Title: "${freelancerTitle}".
Freelancer Skills: ${JSON.stringify(freelancerSkills)}.
Keep it engaging, professional, persuasive, concise (under 180 words), highlighting relevant expertise and a clear call to action.`,
    });
    res.json({ proposal: response.text || 'Failed to generate proposal.' });
  } catch (err: any) {
    console.error('AI Proposal Error:', err);
    res.status(500).json({ error: err.message || 'AI generation failed' });
  }
});

app.post('/api/ai/optimize-gig', async (req, res) => {
  try {
    const { title, description } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Optimize this freelance gig listing for better search visibility, conversion rate, and professionalism:
Title: "${title}"
Description: "${description}"

Return ONLY valid JSON with structure:
{
  "optimizedTitle": "...",
  "optimizedDescription": "...",
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "pricingAdvice": "..."
}`,
      config: { responseMimeType: 'application/json' }
    });
    const json = JSON.parse(response.text || '{}');
    res.json(json);
  } catch (err: any) {
    console.error('AI Optimize Error:', err);
    res.status(500).json({ error: err.message || 'AI optimization failed' });
  }
});

// WebSocket Real-Time Chat Server
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'NEW_MESSAGE') {
        const newMsg: Message = {
          id: 'msg_' + Date.now(),
          orderId: parsed.orderId,
          senderId: parsed.senderId,
          senderName: parsed.senderName,
          text: parsed.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        messages.push(newMsg);

        const payload = JSON.stringify({ type: 'MESSAGE_RECEIVED', message: newMsg });
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Vite middleware integration for development
if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WorkPerHour server running on http://localhost:${PORT}`);
});

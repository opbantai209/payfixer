import React, { useState, useEffect } from 'react';
import {
  Settings, DollarSign, Shield, Clock, AlertTriangle, Check, RefreshCw,
  Sliders, Globe, HelpCircle, Save, Sparkles, ArrowRight, ShieldCheck,
  CheckCircle2, AlertCircle, Percent, Lock, Coins, FileText, Undo2
} from 'lucide-react';

export interface SiteFeeSettingsData {
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

const DEFAULT_SETTINGS: SiteFeeSettingsData = {
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
  updatedAt: '2026-10-09',
  updatedBy: 'Admin Chief (Super Admin)'
};

interface SiteFeeSettingsModuleProps {
  currentUser?: any;
  onSettingsSaved?: (newSettings: SiteFeeSettingsData) => void;
}

export const SiteFeeSettingsModule: React.FC<SiteFeeSettingsModuleProps> = ({
  currentUser,
  onSettingsSaved
}) => {
  const [settings, setSettings] = useState<SiteFeeSettingsData>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live Simulator state
  const [simOrderAmount, setSimOrderAmount] = useState<number>(500);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      let res = await fetch('/api/admin/site-settings');
      if (!res.ok && res.status === 404) {
        res = await fetch('/api/admin/settings');
      }
      if (res.ok) {
        const data = await res.json();
        const loaded = data.settings || data;
        setSettings(prev => ({ ...prev, ...loaded }));
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (err) {
      console.warn('Could not fetch site settings from server, using defaults:', err);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setToastMessage(null);
    try {
      const payload: SiteFeeSettingsData = {
        ...settings,
        updatedAt: new Date().toISOString().split('T')[0],
        updatedBy: currentUser?.name ? `${currentUser.name} (${currentUser.role || 'Admin'})` : 'Super Admin'
      };

      let res = await fetch('/api/admin/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok && res.status === 404) {
        res = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        const data = await res.json().catch(() => ({ settings: payload }));
        const saved = data.settings || data || payload;
        setSettings(saved);
        if (onSettingsSaved) {
          onSettingsSaved(saved);
        }
        setToastMessage({
          type: 'success',
          text: 'Site & Fee settings saved successfully and active across marketplace!'
        });
      } else {
        let errorMsg = 'Failed to save settings to server.';
        try {
          const err = await res.json();
          if (err && err.error) errorMsg = err.error;
        } catch {
          // ignore non-json error responses
        }
        setToastMessage({
          type: 'error',
          text: errorMsg
        });
      }
    } catch (err: any) {
      console.error(err);
      setToastMessage({
        type: 'error',
        text: err?.message ? `Network error: ${err.message}` : 'Network error occurred while saving settings.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all Site & Fee settings to factory defaults (10% Commission, 14-Day Escrow)?')) {
      setSettings({
        ...DEFAULT_SETTINGS,
        updatedAt: new Date().toISOString().split('T')[0],
        updatedBy: currentUser?.name ? `${currentUser.name} (Reset)` : 'Super Admin (Reset)'
      });
      setToastMessage({
        type: 'success',
        text: 'Settings reset to factory defaults. Click "Save Settings" to persist changes.'
      });
    }
  };

  // Real-time calculations for Fee Simulator
  const simBuyerFee = (simOrderAmount * (settings.buyerProcessingFeeRate / 100)) + settings.buyerProcessingFeeFixed;
  const simTotalBuyerPaid = simOrderAmount + simBuyerFee;
  const simFreelancerCommission = simOrderAmount * (settings.freelancerCommissionRate / 100);
  const simFreelancerPayout = simOrderAmount - simFreelancerCommission;
  const simPlatformRevenue = simFreelancerCommission + simBuyerFee;
  const simEffectiveMargin = simTotalBuyerPaid > 0 ? ((simPlatformRevenue / simTotalBuyerPaid) * 100).toFixed(1) : '0';

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-500 space-y-3 shadow-xs">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-700">Loading Site & Fee Settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Module Header & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700">
                <Settings className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-slate-900">20. Site & Fee Settings</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Configure marketplace monetization rates, mandatory double-entry escrow hold duration, buyer checkout fees, currency, and operational governance policies.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResetDefaults}
              className="px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Settings</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Toast */}
        {toastMessage && (
          <div className={`mt-4 p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <span className="font-semibold flex items-center gap-2">
              {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
              {toastMessage.text}
            </span>
            <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-700 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Live KPI Quick Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Take Rate</span>
            <span className="text-lg font-black text-emerald-600 mt-0.5 block">{settings.freelancerCommissionRate}%</span>
            <span className="text-[10px] text-slate-500">Freelancer Fee</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Buyer Fee</span>
            <span className="text-lg font-black text-purple-600 mt-0.5 block">{settings.buyerProcessingFeeRate}%</span>
            <span className="text-[10px] text-slate-500">Checkout Surcharge</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Escrow Hold</span>
            <span className="text-lg font-black text-blue-600 mt-0.5 block">{settings.escrowHoldDays} Days</span>
            <span className="text-[10px] text-slate-500">Vault Protection</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Auto-Complete</span>
            <span className="text-lg font-black text-amber-600 mt-0.5 block">{settings.autoCompleteDeliveredDays} Days</span>
            <span className="text-[10px] text-slate-500">Review Window</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Min Order</span>
            <span className="text-lg font-black text-slate-900 mt-0.5 block">${settings.minOrderAmount}</span>
            <span className="text-[10px] text-slate-500">Floor Threshold</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Min Payout</span>
            <span className="text-lg font-black text-slate-900 mt-0.5 block">${settings.minPayoutThreshold}</span>
            <span className="text-[10px] text-slate-500">Withdrawal Limit</span>
          </div>
        </div>
      </div>

      {/* 2. Main 2-Column Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* =================================================================== */}
        {/* LEFT COLUMN (7 / 12 Cols): Fees, Commission & Escrow Governance */}
        {/* =================================================================== */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Platform Take Rates & Commission */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-600" />
                <span>1. Platform Take Rates & Commissions</span>
              </h3>
              <span className="text-xs text-emerald-700 font-mono font-bold bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                Active Monetization
              </span>
            </div>

            {/* Freelancer Take Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">Freelancer Platform Take Rate (%)</span>
                  <p className="text-[11px] text-slate-500">Deducted from freelancer escrow gross earnings upon order completion.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-black text-emerald-600">{settings.freelancerCommissionRate}%</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="0.5"
                  value={settings.freelancerCommissionRate}
                  onChange={e => setSettings({ ...settings, freelancerCommissionRate: Number(e.target.value) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Presets:</span>
                {[5, 10, 15, 20].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSettings({ ...settings, freelancerCommissionRate: val })}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition-colors cursor-pointer ${
                      settings.freelancerCommissionRate === val
                        ? 'bg-emerald-600 text-white font-black shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Buyer Checkout Processing Fee */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">Buyer Checkout Processing Fee (%)</span>
                  <p className="text-[11px] text-slate-500">Added to invoice total during checkout to cover gateway and fraud protection.</p>
                </div>
                <span className="font-mono text-base font-black text-purple-600">{settings.buyerProcessingFeeRate}%</span>
              </div>

              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={settings.buyerProcessingFeeRate}
                onChange={e => setSettings({ ...settings, buyerProcessingFeeRate: Number(e.target.value) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />

              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Presets:</span>
                {[0, 2, 3, 5].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSettings({ ...settings, buyerProcessingFeeRate: val })}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition-colors cursor-pointer ${
                      settings.buyerProcessingFeeRate === val
                        ? 'bg-purple-600 text-white font-black shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Extra Fixed Fees */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Min Order Floor ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.minOrderAmount}
                    onChange={e => setSettings({ ...settings, minOrderAmount: Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Featured Gig Fee ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    min="0"
                    value={settings.featuredGigFee}
                    onChange={e => setSettings({ ...settings, featuredGigFee: Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Urgent Project Fee ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    min="0"
                    value={settings.urgentProjectFee}
                    onChange={e => setSettings({ ...settings, urgentProjectFee: Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Escrow & Financial Protection Policy */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>2. Escrow Protection & Vault Rules</span>
              </h3>
              <span className="text-xs text-blue-700 font-mono font-bold bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                Double-Entry Ledger
              </span>
            </div>

            {/* Escrow Hold Duration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">Mandatory Escrow Vault Hold Duration</span>
                  <p className="text-[11px] text-slate-500">Holding duration before completed funds become eligible for external withdrawal disbursements.</p>
                </div>
                <span className="font-mono text-base font-black text-blue-600">{settings.escrowHoldDays} Days</span>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-1">
                {[7, 14, 21, 30].map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setSettings({ ...settings, escrowHoldDays: days })}
                    className={`py-2 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer border ${
                      settings.escrowHoldDays === days
                        ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    {days} Days {days === 14 && '(Standard)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-Complete Review Window */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">Delivered Order Auto-Approval Window</span>
                  <p className="text-[11px] text-slate-500">If buyer is unresponsive after work delivery, the order automatically approves and releases escrow.</p>
                </div>
                <span className="font-mono text-base font-black text-amber-600">{settings.autoCompleteDeliveredDays} Days</span>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-1">
                {[1, 3, 5, 7].map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setSettings({ ...settings, autoCompleteDeliveredDays: days })}
                    className={`py-2 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer border ${
                      settings.autoCompleteDeliveredDays === days
                        ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-xs'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    {days} {days === 1 ? 'Day' : 'Days'} {days === 3 && '(Standard)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Minimum Payout Threshold & Instant Payout Fee */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Min Freelancer Payout Floor ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    min="10"
                    step="5"
                    value={settings.minPayoutThreshold}
                    onChange={e => setSettings({ ...settings, minPayoutThreshold: Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Instant Payout Surcharge (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={settings.instantPayoutFeeRate}
                    onChange={e => setSettings({ ...settings, instantPayoutFeeRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-mono"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT COLUMN (5 / 12 Cols): Live Simulator & Site Identity */}
        {/* =================================================================== */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 3: Interactive Marketplace Fee Calculator / Simulator */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-600" />
                <span>Live Fee Calculator & Simulator</span>
              </h3>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Instant Preview
              </span>
            </div>

            <div>
              <label className="text-xs text-slate-600 block mb-1.5 font-medium">Enter Sample Gig / Order Price ($):</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-2.5 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    min="5"
                    step="10"
                    value={simOrderAmount}
                    onChange={e => setSimOrderAmount(Math.max(1, Number(e.target.value)))}
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="flex items-center gap-1">
                  {[100, 500, 1500].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setSimOrderAmount(amt)}
                      className={`px-2.5 py-2 rounded-xl text-[10px] font-bold font-mono transition-colors cursor-pointer border ${
                        simOrderAmount === amt
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Calculated Breakdown Box */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Order Gross Value:</span>
                <span className="font-mono font-bold text-slate-900">${simOrderAmount.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Buyer Service Surcharge (+{settings.buyerProcessingFeeRate}%):</span>
                <span className="font-mono font-bold text-purple-700">+${simBuyerFee.toFixed(2)}</span>
              </div>

              <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">Buyer Pays at Checkout:</span>
                <span className="font-mono font-black text-sm text-slate-900">${simTotalBuyerPaid.toFixed(2)}</span>
              </div>

              <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-xs">
                <span className="text-slate-600">Platform Take Rate (-{settings.freelancerCommissionRate}%):</span>
                <span className="font-mono font-bold text-emerald-700">-${simFreelancerCommission.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">Freelancer Net Payout:</span>
                <span className="font-mono font-black text-sm text-emerald-700">${simFreelancerPayout.toFixed(2)}</span>
              </div>

              {/* Net Platform Revenue Highlight */}
              <div className="mt-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block tracking-wider">
                    Total Platform Margin
                  </span>
                  <span className="text-[11px] text-slate-600 font-medium">Commission + Buyer Fee</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-black text-base text-emerald-800 block">${simPlatformRevenue.toFixed(2)}</span>
                  <span className="text-[10px] font-mono text-emerald-700 font-bold">({simEffectiveMargin}% Net Margin)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Marketplace Identity & Operating Policies */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-600" />
                <span>3. Platform Identity & Operations</span>
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Platform Brand Name</label>
                <input
                  type="text"
                  value={settings.platformName}
                  onChange={e => setSettings({ ...settings, platformName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Support & Escalations Desk Email</label>
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={e => setSettings({ ...settings, supportEmail: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Operating Currency</label>
                <select
                  value={settings.currency}
                  onChange={e => {
                    const c = e.target.value;
                    const sym = c === 'EUR' ? '€' : c === 'GBP' ? '£' : '$';
                    setSettings({ ...settings, currency: c, currencySymbol: sym });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-medium"
                >
                  <option value="USD">USD ($) - United States Dollar</option>
                  <option value="EUR">EUR (€) - Euro</option>
                  <option value="GBP">GBP (£) - British Pound</option>
                  <option value="CAD">CAD ($) - Canadian Dollar</option>
                  <option value="AUD">AUD ($) - Australian Dollar</option>
                </select>
              </div>

              {/* Freelancer Onboarding Mode */}
              <div className="pt-2">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Gig & Catalog Moderation Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, freelancerOnboardingMode: 'open' })}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-colors cursor-pointer ${
                      settings.freelancerOnboardingMode === 'open'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block text-xs font-bold">Open Marketplace</span>
                    <span className="text-[10px] text-slate-500 font-normal">Instant gig publishing</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, freelancerOnboardingMode: 'moderated' })}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-colors cursor-pointer ${
                      settings.freelancerOnboardingMode === 'moderated'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block text-xs font-bold">Pre-Moderation</span>
                    <span className="text-[10px] text-slate-500 font-normal">Admin approval required</span>
                  </button>
                </div>
              </div>

              {/* Maintenance Mode Toggle */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-slate-900 block">Maintenance Mode Switch</span>
                    <span className="text-[10px] text-slate-500">Put marketplace in read-only maintenance window</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                      settings.maintenanceMode
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {settings.maintenanceMode ? 'Active (Read-Only)' : 'Disabled (Live)'}
                  </button>
                </div>

                {settings.maintenanceMode && (
                  <div className="mt-2 p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800">
                    ⚠️ Marketplace is currently in Maintenance Mode. Public buyers and sellers will see a maintenance notice.
                  </div>
                )}
              </div>
            </div>

            {/* Audit Footer */}
            {settings.updatedAt && (
              <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                <span>Last Updated: {settings.updatedAt}</span>
                <span className="truncate max-w-[180px]">By: {settings.updatedBy || 'Super Admin'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

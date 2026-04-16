'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Camera, Lock, Save, User, Check, AlertCircle, FileText, Clock, TrendingUp, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/auth';
import { updateProfile, changePassword, getMyCharges } from '@/services/api';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  // Collapsible sections state
  const [openSection, setOpenSection] = useState<'profile' | 'password' | 'invoices' | null>('invoices');

  // Profile state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invoice summary state
  const [chargesSummary, setChargesSummary] = useState<{
    totalPending: number;
    countPending: number;
    countOverdue: number;
    countPaid: number;
    nextDueDate: string | null;
  } | null>(null);
  const [loadingCharges, setLoadingCharges] = useState(true);

  const loadProfileData = useCallback(async () => {
    try {
      const { data } = await api.get('/users/profile');
      setPhone(data.phone || '');
      setCpfCnpj(data.cpfCnpj || null);
      setAvatar(data.avatar || null);
    } catch { /* ignore */ }
  }, []);

  const loadChargesSummary = useCallback(async () => {
    try {
      const { data } = await getMyCharges();
      const items: any[] = Array.isArray(data) ? data : data.data || [];
      const effectiveStatus = (c: any) => {
        if (c.status === 'PENDING' && new Date(c.dueDate) < new Date()) return 'OVERDUE';
        return c.status;
      };
      const pending = items.filter(c => effectiveStatus(c) === 'PENDING');
      const overdue = items.filter(c => effectiveStatus(c) === 'OVERDUE');
      const paid = items.filter(c => effectiveStatus(c) === 'PAID');
      const open = [...pending, ...overdue].sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );
      setChargesSummary({
        totalPending: [...pending, ...overdue].reduce((sum, c) => sum + Number(c.amount), 0),
        countPending: pending.length,
        countOverdue: overdue.length,
        countPaid: paid.length,
        nextDueDate: open.length > 0 ? open[0].dueDate : null,
      });
    } catch { /* ignore */ } finally {
      setLoadingCharges(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      loadProfileData();
      loadChargesSummary();
    }
  }, [user, loadProfileData, loadChargesSummary]);

  // Photo upload handler — saves immediately to server
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setAvatar(dataUrl);
      try {
        await updateProfile({ avatar: dataUrl });
        await refreshUser();
      } catch {
        setProfileMsg({ type: 'error', text: 'Erro ao salvar foto' });
        loadProfileData(); // revert to server value
      }
    };
    reader.readAsDataURL(file);
  };

  // Save profile handler
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const data: Record<string, unknown> = {};
      if (name.trim()) data.name = name.trim();
      if (phone) data.phone = phone;
      if (avatar) data.avatar = avatar;
      await updateProfile(data);
      setProfileMsg({ type: 'success', text: 'Perfil atualizado com sucesso!' });
      await refreshUser();
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message || 'Erro ao atualizar perfil';
      setProfileMsg({ type: 'error', text: Array.isArray(msg) ? msg.join(', ') : msg });
    } finally {
      setSavingProfile(false);
    }
  };

  // Change password handler
  const handleSavePassword = async () => {
    setPasswordMsg(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Preencha todos os campos' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'As senhas não coincidem' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres' });
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordMsg({ type: 'success', text: 'Senha alterada com sucesso!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message || 'Erro ao alterar senha';
      setPasswordMsg({ type: 'error', text: Array.isArray(msg) ? msg.join(', ') : msg });
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) return null;

  const avatarSrc = avatar || (user.avatar && user.avatar !== '' ? user.avatar : null);

  return (
    <div className="py-4 pb-24 space-y-4">
      {/* Photo */}
      <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] p-5 flex flex-col items-center shadow-[0_2px_20px_var(--calendar-shadow)]">
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-[var(--subtle)] flex items-center justify-center">
            {avatarSrc ? (
              <Image src={avatarSrc} alt="Foto de perfil" width={96} height={96} className="w-full h-full object-cover" unoptimized />
            ) : (
              <User size={40} className="text-[var(--text-muted)]" />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white shadow-lg"
          >
            <Camera size={14} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-2">Toque na câmera para alterar a foto</p>
      </div>

      {/* Registration Data */}
      <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] overflow-hidden shadow-[0_2px_20px_var(--calendar-shadow)]">
        <button
          onClick={() => setOpenSection(s => s === 'profile' ? null : 'profile')}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <span className="text-sm font-semibold text-[var(--text)] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500/15 to-primary-400/5 border border-primary-500/10 flex items-center justify-center">
              <User size={14} className="text-primary-500" />
            </div>
            Dados de Cadastro
          </span>
          <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${openSection === 'profile' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'profile' && (
        <div className="px-5 pb-5">

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Nome</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition"
              placeholder="Seu nome"
            />
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Email</label>
            <div className="w-full bg-[var(--subtle)] rounded-xl px-4 py-3 text-sm text-[var(--text-secondary)]">
              {user.email}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Email não pode ser alterado</p>
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Telefone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition"
              placeholder="(00) 00000-0000"
            />
          </div>

          {cpfCnpj && (
            <div>
              <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">CPF/CNPJ</label>
              <div className="w-full bg-[var(--subtle)] rounded-xl px-4 py-3 text-sm text-[var(--text-secondary)]">
                {cpfCnpj}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">CPF/CNPJ não pode ser alterado</p>
            </div>
          )}
        </div>

        {profileMsg && (
          <div className={`mt-3 flex items-center gap-2 text-xs ${profileMsg.type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
            {profileMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
            {profileMsg.text}
          </div>
        )}

        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={savingProfile}
          className="w-full mt-4 bg-gradient-to-r from-primary-500 to-primary-400 text-white rounded-xl px-4 py-3.5 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(0,117,119,0.3)] active:scale-[0.98] transition-transform"
        >
          {savingProfile ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <Save size={16} />
              Salvar Alterações
            </>
          )}
        </button>
        </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] overflow-hidden shadow-[0_2px_20px_var(--calendar-shadow)]">
        <button
          onClick={() => setOpenSection(s => s === 'password' ? null : 'password')}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <span className="text-sm font-semibold text-[var(--text)] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500/15 to-primary-400/5 border border-primary-500/10 flex items-center justify-center">
              <Lock size={14} className="text-primary-500" />
            </div>
          Alterar Senha
          </span>
          <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${openSection === 'password' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'password' && (
        <div className="px-5 pb-5">

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Senha Atual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition"
              placeholder="Digite sua senha atual"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Nova Senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Confirmar Nova Senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition"
              placeholder="Confirme a nova senha"
            />
          </div>
        </div>

        {passwordMsg && (
          <div className={`mt-3 flex items-center gap-2 text-xs ${passwordMsg.type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
            {passwordMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
            {passwordMsg.text}
          </div>
        )}

        <button
          type="button"
          onClick={handleSavePassword}
          disabled={savingPassword}
          className="w-full mt-4 bg-gradient-to-r from-primary-500 to-primary-400 text-white rounded-xl px-4 py-3.5 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(0,117,119,0.3)] active:scale-[0.98] transition-transform"
        >
          {savingPassword ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <Lock size={16} />
              Alterar Senha
            </>
          )}
        </button>
        </div>
        )}
      </div>

      {/* Invoice Summary */}
      <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] overflow-hidden shadow-[0_2px_20px_var(--calendar-shadow)]">
        <button
          onClick={() => setOpenSection(s => s === 'invoices' ? null : 'invoices')}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <span className="text-sm font-semibold text-[var(--text)] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500/15 to-primary-400/5 border border-primary-500/10 flex items-center justify-center">
              <FileText size={14} className="text-primary-500" />
            </div>
            Faturas
          </span>
          <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${openSection === 'invoices' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'invoices' && (
        <div className="px-5 pb-5">

        {loadingCharges ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : chargesSummary ? (
          <>
            {chargesSummary.nextDueDate && (
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.12)' }}>
                  <Clock size={16} style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Próximo vencimento</p>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {format(parseISO(chargesSummary.nextDueDate), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-primary-500/10 flex items-center justify-center">
                <TrendingUp size={16} className="text-primary-500" />
              </div>
              <div>
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Total em aberto</p>
                <p className="text-lg font-bold text-[var(--text)]">
                  R$ {chargesSummary.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <p className="text-lg font-bold" style={{ color: '#f59e0b' }}>{chargesSummary.countPending}</p>
                <p className="text-[9px] text-[var(--text-muted)]">Pendentes</p>
              </div>
              <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <p className="text-lg font-bold" style={{ color: '#ef4444' }}>{chargesSummary.countOverdue}</p>
                <p className="text-[9px] text-[var(--text-muted)]">Atrasadas</p>
              </div>
              <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
                <p className="text-lg font-bold" style={{ color: '#10b981' }}>{chargesSummary.countPaid}</p>
                <p className="text-[9px] text-[var(--text-muted)]">Pagas</p>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-[var(--text-muted)]">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma fatura encontrada</p>
          </div>
        )}
        </div>
        )}
      </div>
    </div>
  );
}

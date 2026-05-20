'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Settings {
  company_name: string
  sender_email: string
  whatsapp_text: string
  email_subject: string
  email_body: string
  contact_phone?: string
}

export function AppSettingsGeral({ initial }: { initial: Settings }) {
  const [form, setForm] = useState({
    company_name: initial.company_name,
    sender_email: initial.sender_email,
    contact_phone: initial.contact_phone || '',
    whatsapp_text: initial.whatsapp_text,
  })
  const [loading, setLoading] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('app_settings')
      .update({
        company_name: form.company_name.trim(),
        sender_email: form.sender_email.trim(),
        contact_phone: form.contact_phone.trim() || null,
        whatsapp_text: form.whatsapp_text.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success('Configurações salvas!')
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <Input label="Nome da empresa" value={form.company_name}
        onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
        placeholder="FoxCycles" disabled={loading} />

      <Input label="Email remetente" type="email" value={form.sender_email}
        onChange={(e) => setForm((p) => ({ ...p, sender_email: e.target.value }))}
        placeholder="noreply@foxcycles.com.br" disabled={loading} />

      <Input label="Telefone de contato exibido no cupom" value={form.contact_phone}
        onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))}
        placeholder="(19) 99999-9999" disabled={loading} />

      <div>
        <label className="text-sm text-gray-300 block mb-1.5">Texto padrão para compartilhar no WhatsApp</label>
        <textarea
          value={form.whatsapp_text}
          onChange={(e) => setForm((p) => ({ ...p, whatsapp_text: e.target.value }))}
          rows={3}
          placeholder="Texto que aparece quando o cliente compartilha o cupom..."
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] px-4 py-3 text-white text-sm placeholder:text-gray-500 focus:border-[#00ff87] focus:outline-none resize-none"
          disabled={loading}
        />
      </div>

      <Button type="submit" loading={loading} className="self-end">Salvar</Button>
    </form>
  )
}

export function AppSettingsEmail({ initial }: { initial: Settings }) {
  const [form, setForm] = useState({
    email_subject: initial.email_subject,
    email_body: initial.email_body,
  })
  const [loading, setLoading] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('app_settings')
      .update({
        email_subject: form.email_subject.trim(),
        email_body: form.email_body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success('Template de email salvo!')
  }

  const variables = ['{{nome}}', '{{codigo}}', '{{valor}}', '{{validade}}', '{{influencer}}']

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <div>
        <p className="text-gray-500 text-xs mb-3">
          Variáveis disponíveis:{' '}
          {variables.map((v) => (
            <code key={v} className="text-[#00ff87] bg-[#1e1e1e] px-1.5 py-0.5 rounded mr-1.5 font-mono text-xs">{v}</code>
          ))}
        </p>
      </div>

      <Input label="Assunto do email" value={form.email_subject}
        onChange={(e) => setForm((p) => ({ ...p, email_subject: e.target.value }))}
        placeholder="Seu cupom de desconto FoxCycles chegou!" disabled={loading} />

      <div>
        <label className="text-sm text-gray-300 block mb-1.5">Corpo do email</label>
        <textarea
          value={form.email_body}
          onChange={(e) => setForm((p) => ({ ...p, email_body: e.target.value }))}
          rows={14}
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] px-4 py-3 text-white text-sm placeholder:text-gray-500 focus:border-[#00ff87] focus:outline-none resize-y font-mono"
          disabled={loading}
        />
        <p className="text-gray-600 text-xs mt-1">Quebras de linha são preservadas no email enviado.</p>
      </div>

      <Button type="submit" loading={loading} className="self-end">Salvar template</Button>
    </form>
  )
}

'use client'

import { useState } from 'react'
import { UserManagement } from './UserManagement'
import { SellerManagement, type Seller } from './SellerManagement'
import { AppSettingsGeral } from './AppSettings'

interface UserProfile {
  id: string
  name: string
  email: string | null
  role: string
  store_name: string | null
  active: boolean
  created_at: string
}

interface Settings {
  company_name: string
  sender_email: string
  whatsapp_text: string
  email_subject: string
  email_body: string
  contact_phone?: string
}

// A aba "Email" foi escondida: o sistema não envia e-mail (o Resend nunca foi ligado),
// então deixar o template editável passava a impressão de que o cliente recebia o cupom
// por e-mail. O componente AppSettingsEmail continua no código — para trazer a aba de
// volta, basta reinserir { id: 'email', label: 'Email' } aqui e o bloco correspondente
// abaixo. As colunas email_subject/email_body seguem intactas no banco.
const TABS = [
  { id: 'usuarios', label: 'Usuários' },
  { id: 'vendedores', label: 'Vendedores' },
  { id: 'geral', label: 'Geral' },
]

export function ConfigTabs({
  users,
  currentUserId,
  settings,
  sellers,
  storeNames,
}: {
  users: UserProfile[]
  currentUserId: string
  settings: Settings
  sellers: Seller[]
  storeNames: string[]
}) {
  const [activeTab, setActiveTab] = useState('usuarios')

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[#1e1e1e] pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-[#00ff87] text-[#00ff87]'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      {activeTab === 'usuarios' && (
        <UserManagement users={users} currentUserId={currentUserId} />
      )}

      {activeTab === 'vendedores' && (
        <SellerManagement sellers={sellers} storeNames={storeNames} />
      )}

      {activeTab === 'geral' && (
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-6">
          <h2 className="text-white font-semibold mb-1">Configurações Gerais</h2>
          <p className="text-gray-500 text-xs mb-5">Informações exibidas no cupom e nas comunicações.</p>
          <AppSettingsGeral initial={settings} />
        </div>
      )}

    </div>
  )
}

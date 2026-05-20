'use client'

interface FoxLogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: { text: 'text-xl', gap: 'gap-0' },
  md: { text: 'text-3xl', gap: 'gap-0' },
  lg: { text: 'text-4xl', gap: 'gap-0' },
}

export function FoxLogo({ size = 'md', className = '' }: FoxLogoProps) {
  const s = sizes[size]

  return (
    <div className={`flex items-center justify-center ${className}`}>
      {/* Tenta carregar a logo real; se não existir, mostra texto */}
      <img
        src="/logo.png"
        alt="FoxCycles"
        className={`object-contain ${size === 'sm' ? 'h-8' : size === 'md' ? 'h-12' : 'h-16'}`}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
          const wrapper = target.nextElementSibling as HTMLElement
          if (wrapper) wrapper.style.display = 'flex'
        }}
      />
      {/* Fallback texto — hidden por padrão, exibido via onError */}
      <span
        className={`${s.text} font-black tracking-tight hidden items-center`}
        style={{ display: 'none' }}
      >
        <span style={{ color: '#00ff87' }}>FOX</span>
        <span style={{ color: '#ffffff' }}>CYCLES</span>
      </span>
    </div>
  )
}
